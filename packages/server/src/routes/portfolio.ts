import { Router, Request, Response } from 'express';
import type { ApiResponse, FundScore, SignalResult, FundInfo } from '@allin/shared';
import { getDb } from '../db/index.js';
import { getMockNAV, getMockFunds, fetchFundDetail, fetchAllFunds, estimateIntradayNAV } from '../adapters/eastmoney.js';
import { scoreAllFundsUnified } from '../services/scoring.js';
import { calculateInvestAmount } from '../services/invest.js';
import { evaluateTakeProfit, getTakeProfitRule } from '../services/takeProfit.js';
import type { TakeProfitRule, TakeProfitAction } from '../services/takeProfit.js';

// ============================================================
// 持仓数据类型
// ============================================================

interface PortfolioRow {
  id: number;
  code: string;
  name: string;
  amount: number;
  cost_nav: number;
  shares: number;
  added_at: string;
}

interface PortfolioHolding {
  id: number;
  code: string;
  name: string;
  amount: number;
  costNav: number;
  shares: number;
  currentNav: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  score: FundScore;
  signal: SignalResult;
  addedAt: string;
  todayChange?: number;
  todayPnl?: number;
  lastNAV?: number;
  navDate?: string;
  sellSuggestion?: string;
}

// ============================================================
// 定投计算 & 止盈评估 响应类型
// ============================================================

interface InvestCalcResult {
  code: string;
  pePercentile: number;
  baseAmount: number;
  multiplier: number;
  actualAmount: number;
  strategy: string;
}

interface TakeProfitEval {
  code: string;
  fundType: string;
  currentReturn: number;
  holdingDays: number;
  rule: TakeProfitRule;
  evaluation: TakeProfitAction;
}

// ============================================================
// 交易信号生成
// ============================================================

function getSignal(totalScore: number): SignalResult {
  if (totalScore >= 80) {
    return { signal: 'buy', score: totalScore, reason: '综合评分优秀，建议买入', suggestedPosition: '10%-20%' };
  }
  if (totalScore >= 60) {
    return { signal: 'hold', score: totalScore, reason: '综合评分良好，建议持有', suggestedPosition: '维持现有仓位' };
  }
  if (totalScore >= 40) {
    return { signal: 'reduce', score: totalScore, reason: '综合评分偏低，建议减持', suggestedPosition: '减持30%-50%' };
  }
  return { signal: 'sell', score: totalScore, reason: '综合评分较差，建议清仓', suggestedPosition: '全部卖出' };
}

const router = Router();

// ============================================================
// POST /api/portfolio/add — 添加或追加持仓
// ============================================================

router.post('/portfolio/add', (req: Request, res: Response) => {
  try {
    const { code, name, amount, costNav } = req.body;

    if (!code || !name || amount == null || costNav == null) {
      const body: ApiResponse<never> = {
        success: false,
        error: '缺少必填字段: code, name, amount, costNav',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(body);
      return;
    }

    const shares = amount / costNav;
    const db = getDb();

    // 检查是否已存在同名基金
    const existing = db
      .prepare('SELECT id, amount, shares FROM portfolio WHERE code = ?')
      .get(code) as { id: number; amount: number; shares: number } | undefined;

    // 确保基金基础信息已写入 funds 表（满足外键约束）
    db.prepare(`
      INSERT INTO funds (code, name, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(code) DO NOTHING
    `).run(code, name);

    if (existing) {
      // 追加仓位
      const newAmount = existing.amount + amount;
      const newShares = existing.shares + shares;
      const newCostNav = newAmount / newShares;

      db.prepare('UPDATE portfolio SET amount = ?, shares = ?, cost_nav = ?, name = ? WHERE id = ?').run(
        newAmount,
        newShares,
        newCostNav,
        name,
        existing.id,
      );

      const body: ApiResponse<{ holding: { id: number; code: string; name: string; amount: number; costNav: number; shares: number; addedAt: string } }> = {
        success: true,
        data: {
          holding: {
            id: existing.id,
            code,
            name,
            amount: Math.round(newAmount * 100) / 100,
            costNav: Math.round(newCostNav * 10000) / 10000,
            shares: Math.round(newShares * 100) / 100,
            addedAt: new Date().toISOString(),
          },
        },
        timestamp: new Date().toISOString(),
      };
      res.json(body);
    } else {
      // 新建仓位
      const result = db
        .prepare('INSERT INTO portfolio (code, name, amount, cost_nav, shares) VALUES (?, ?, ?, ?, ?)')
        .run(code, name, amount, costNav, shares);

      const body: ApiResponse<{ holding: { id: number; code: string; name: string; amount: number; costNav: number; shares: number; addedAt: string } }> = {
        success: true,
        data: {
          holding: {
            id: Number(result.lastInsertRowid),
            code,
            name,
            amount,
            costNav,
            shares: Math.round(shares * 100) / 100,
            addedAt: new Date().toISOString(),
          },
        },
        timestamp: new Date().toISOString(),
      };
      res.json(body);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[portfolio] add error:', message);
    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

// ============================================================
// GET /api/portfolio/:code/invest — 定投计算
// ============================================================

router.get('/portfolio/:code/invest', (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;
    const pePercentile = parseFloat(req.query.pePercentile as string);
    const monthlyBudget = parseFloat(req.query.monthlyBudget as string);

    if (Number.isNaN(pePercentile) || pePercentile < 0 || pePercentile > 100) {
      const body: ApiResponse<never> = {
        success: false,
        error: '缺少有效参数: pePercentile (0-100)',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(body);
      return;
    }

    if (Number.isNaN(monthlyBudget) || monthlyBudget <= 0) {
      const body: ApiResponse<never> = {
        success: false,
        error: '缺少有效参数: monthlyBudget (> 0)',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(body);
      return;
    }

    // 查一下数据库确认该基金在持仓中
    const db = getDb();
    const holding = db.prepare('SELECT code FROM portfolio WHERE code = ?').get(code);
    if (!holding) {
      const body: ApiResponse<never> = {
        success: false,
        error: `基金 ${code} 不在持仓列表中`,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(body);
      return;
    }

    const result = calculateInvestAmount(monthlyBudget, pePercentile);

    const body: ApiResponse<InvestCalcResult> = {
      success: true,
      data: {
        code,
        pePercentile,
        baseAmount: result.baseAmount,
        multiplier: result.multiplier,
        actualAmount: result.actualAmount,
        strategy: result.strategy,
      },
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[portfolio] invest error:', message);
    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

// ============================================================
// GET /api/portfolio/:code/takeProfit — 止盈评估
// ============================================================

router.get('/portfolio/:code/takeProfit', async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;

    const db = getDb();
    const row = db.prepare('SELECT * FROM portfolio WHERE code = ?').get(code) as PortfolioRow | undefined;
    if (!row) {
      const body: ApiResponse<never> = {
        success: false,
        error: `基金 ${code} 不在持仓列表中`,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(body);
      return;
    }

    // 计算当前收益（使用真实净值，降级为 mock）
    let currentNav = row.cost_nav;
    try {
      const detail = await fetchFundDetail(code);
      if (detail && detail.navHistory.length > 0) {
        currentNav = detail.navHistory[detail.navHistory.length - 1].nav;
      }
    } catch {
      // fall back to mock
    }
    if (currentNav === row.cost_nav) {
      const navData = getMockNAV(code);
      currentNav = navData.length > 0 ? navData[navData.length - 1].nav : row.cost_nav;
    }
    const currentValue = row.shares * currentNav;
    const pnl = currentValue - row.amount;
    const pnlPercent = row.amount > 0 ? (pnl / row.amount) * 100 : 0;

    // 持有天数
    const addedDate = new Date(row.added_at);
    const now = new Date();
    const holdingDays = Math.floor((now.getTime() - addedDate.getTime()) / (1000 * 60 * 60 * 24));

    // 查找基金类型
    const mockFunds = getMockFunds();
    const fundInfo = mockFunds.find((f) => f.code === code);
    const fundType = fundInfo?.type ?? '';

    const rule = getTakeProfitRule(fundType);
    const evaluation = evaluateTakeProfit(fundType, pnlPercent, holdingDays);

    const body: ApiResponse<TakeProfitEval> = {
      success: true,
      data: {
        code,
        fundType,
        currentReturn: Math.round(pnlPercent * 100) / 100,
        holdingDays,
        rule,
        evaluation,
      },
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[portfolio] takeProfit error:', message);
    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

// ============================================================
// DELETE /api/portfolio/:code — 移除持仓
// ============================================================

router.delete('/portfolio/:code', (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM portfolio WHERE code = ?').get(code);
    if (!existing) {
      const body: ApiResponse<never> = {
        success: false,
        error: `基金 ${code} 不在持仓列表中`,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(body);
      return;
    }

    db.prepare('DELETE FROM portfolio WHERE code = ?').run(code);

    const body: ApiResponse<{ removed: string }> = {
      success: true,
      data: { removed: code },
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[portfolio] delete error:', message);
    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

// ============================================================
// GET /api/portfolio — 获取所有持仓（含实时评分与盈亏）
// ============================================================

router.get('/portfolio', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM portfolio ORDER BY added_at DESC').all() as PortfolioRow[];

    // 构建 FundInfo 查找表（mock + 真实基金数据）
    const allRealFunds = await fetchAllFunds();
    const fundMap = new Map<string, FundInfo>();
    for (const f of getMockFunds()) fundMap.set(f.code, f);
    for (const f of allRealFunds) {
      if (!fundMap.has(f.code)) fundMap.set(f.code, f);
      else {
        // 合并：mock 补充 type/manager 等真实数据缺失的字段
        const existing = fundMap.get(f.code)!;
        fundMap.set(f.code, { ...f, ...existing });
      }
    }

    const holdings: PortfolioHolding[] = [];
    let totalValue = 0;
    let totalCost = 0;

    const fundInfos: FundInfo[] = [];
    const navDataByCode = new Map<string, import('../adapters/eastmoney.js').NAVEntry[]>();

    for (const row of rows) {
      let navData = getMockNAV(row.code);
      try {
        const detail = await fetchFundDetail(row.code);
        if (detail && detail.navHistory.length > 0) {
          navData = detail.navHistory;
        }
      } catch {
        // fall back to mock
      }
      navDataByCode.set(row.code, navData);

      // 优先从 fundMap 获取完整 FundInfo，缺失时用数据库记录补底
      const existing = fundMap.get(row.code);
      const fundInfo: FundInfo = existing || {
        code: row.code, name: row.name, type: '', manager: '',
        tenure: '', managerReturn: '', scale: 0, inception: '', company: '',
      };
      fundInfos.push(fundInfo);
    }

    // 批量评分确保与推荐一致的交叉归一化
    const scores = scoreAllFundsUnified(fundInfos, navDataByCode);

    // 并行获取所有持仓的盘中估算净值
    const intradayResults = await Promise.allSettled(
      rows.map(r => estimateIntradayNAV(r.code)),
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const navData = navDataByCode.get(row.code) || [];
      const lastNAV = navData.length > 0 ? navData[navData.length - 1].nav : row.cost_nav;

      // 盘中估算净值（优先），否则用昨收净值
      const intra = intradayResults[i];
      const estimated = (intra.status === 'fulfilled' && intra.value) ? intra.value : null;
      const currentNav = estimated?.estimatedNav ?? lastNAV;
      const todayChange = estimated?.weightedChange ?? 0;
      const navDate = estimated?.navDate ?? (navData.length > 0 ? navData[navData.length - 1].date : '');

      const currentValue = row.shares * currentNav;
      const pnl = currentValue - row.amount;
      const pnlPercent = row.amount > 0 ? (pnl / row.amount) * 100 : 0;
      const todayPnl = row.shares * lastNAV * (todayChange / 100);

      const score = scores.get(row.code) || { momentum: 0, riskControl: 0, riskAdjusted: 0, manager: 0, scale: 0, sectorMatch: 0, total: 0 };
      const signal = getSignal(score.total);

      // 卖出建议：持有满 7 天 + 收益率达标
      const addedDate = new Date(row.added_at);
      const holdingDays = Math.floor((Date.now() - addedDate.getTime()) / 86400000);
      const sellDate = new Date(addedDate);
      sellDate.setDate(sellDate.getDate() + 14);
      const sellSuggestion = pnlPercent >= 5
        ? `收益已达+${pnlPercent.toFixed(1)}%，建议择机止盈`
        : pnlPercent <= -5
          ? '亏损超5%，建议评估是否止损'
          : `目标清仓日 ${sellDate.toISOString().slice(0, 10)}（持有14天）`;

      holdings.push({
        id: row.id,
        code: row.code,
        name: row.name,
        amount: row.amount,
        costNav: row.cost_nav,
        shares: row.shares,
        currentNav: Math.round(currentNav * 10000) / 10000,
        currentValue: Math.round(currentValue * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        score,
        signal,
        addedAt: row.added_at,
        // 扩展字段
        todayChange: Math.round(todayChange * 100) / 100,
        todayPnl: Math.round(todayPnl * 100) / 100,
        lastNAV: Math.round(lastNAV * 10000) / 10000,
        navDate,
        sellSuggestion,
      });

      totalValue += currentValue;
      totalCost += row.amount;
    }

    const totalPnl = totalValue - totalCost;
    const summaryPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    const body: ApiResponse<{
      holdings: PortfolioHolding[];
      summary: { totalValue: number; totalCost: number; totalPnl: number; pnlPercent: number };
    }> = {
      success: true,
      data: {
        holdings,
        summary: {
          totalValue: Math.round(totalValue * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          totalPnl: Math.round(totalPnl * 100) / 100,
          pnlPercent: Math.round(summaryPnlPercent * 100) / 100,
        },
      },
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[portfolio] list error:', message);
    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

export default router;
