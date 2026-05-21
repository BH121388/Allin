// ============================================================
// 股票持仓路由
//
// POST /api/stock-portfolio/add — 添加持仓
// GET  /api/stock-portfolio      — 获取所有持仓（含实时行情+盈亏+评分）
// DELETE /api/stock-portfolio/:code — 移除持仓
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse, StockInfo, StockScore, StockSignalResult } from '@allin/shared';
import { getDb } from '../db/index.js';
import { getMockStocks, getMockKLine, fetchAllStocks, fetchStockKLine, fetchSingleStockQuote } from '../adapters/stock.js';
import { scoreStock } from '../services/stock-scoring.js';
import { evaluateStockTakeProfit } from '../services/stock-takeprofit.js';

const router = Router();

// ============================================================
// 类型
// ============================================================

interface StockPortfolioRow {
  id: number;
  code: string;
  name: string;
  amount: number;
  cost_price: number;
  shares: number;
  added_at: string;
}

interface StockHolding {
  id: number;
  code: string;
  name: string;
  amount: number;
  costPrice: number;
  shares: number;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  score: StockScore;
  signal: StockSignalResult;
  addedAt: string;
  todayChange?: number;
  todayPnl?: number;
  industry?: string;
  sellSuggestion?: string;
}

// ============================================================
// 信号生成（股票版）
// ============================================================

function getStockSignal(totalScore: number): StockSignalResult {
  if (totalScore >= 80) {
    return { signal: 'buy', score: totalScore, reason: '综合评分优秀，建议持有或加仓', suggestedPosition: '15%-25%' };
  }
  if (totalScore >= 60) {
    return { signal: 'hold', score: totalScore, reason: '综合评分良好，建议持有', suggestedPosition: '维持现有仓位' };
  }
  if (totalScore >= 40) {
    return { signal: 'reduce', score: totalScore, reason: '综合评分偏低，建议减持', suggestedPosition: '减持30%-50%' };
  }
  return { signal: 'sell', score: totalScore, reason: '综合评分较差，建议清仓', suggestedPosition: '全部卖出' };
}

// ============================================================
// POST /api/stock-portfolio/add — 添加股票持仓
// ============================================================

router.post('/stock-portfolio/add', (req: Request, res: Response) => {
  try {
    const { code, name, amount, costPrice, shares } = req.body;

    if (!code || !name || amount == null || costPrice == null || shares == null) {
      const body: ApiResponse<never> = {
        success: false,
        error: '缺少必填字段: code, name, amount, costPrice, shares',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(body);
      return;
    }

    const db = getDb();

    // 确保股票基础信息写入 stocks 表
    db.prepare(`
      INSERT INTO stocks (code, name, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(code) DO NOTHING
    `).run(code, name);

    const existing = db.prepare(
      'SELECT id, amount, shares FROM stock_portfolio WHERE code = ?',
    ).get(code) as { id: number; amount: number; shares: number } | undefined;

    if (existing) {
      // 追加仓位
      const newAmount = existing.amount + amount;
      const newShares = existing.shares + shares;
      const newCostPrice = newAmount / newShares;

      db.prepare(
        'UPDATE stock_portfolio SET amount = ?, shares = ?, cost_price = ?, name = ? WHERE id = ?',
      ).run(newAmount, newShares, Math.round(newCostPrice * 10000) / 10000, name, existing.id);

      res.json({
        success: true,
        data: { holding: { id: existing.id, code, name, amount: Math.round(newAmount * 100) / 100, costPrice: Math.round(newCostPrice * 10000) / 10000, shares: newShares } },
        timestamp: new Date().toISOString(),
      } as ApiResponse<{ holding: { id: number; code: string; name: string; amount: number; costPrice: number; shares: number } }>);
    } else {
      const result = db.prepare(
        'INSERT INTO stock_portfolio (code, name, amount, cost_price, shares) VALUES (?, ?, ?, ?, ?)',
      ).run(code, name, amount, costPrice, shares);

      res.json({
        success: true,
        data: { holding: { id: Number(result.lastInsertRowid), code, name, amount, costPrice, shares } },
        timestamp: new Date().toISOString(),
      } as ApiResponse<{ holding: { id: number; code: string; name: string; amount: number; costPrice: number; shares: number } }>);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stock-portfolio] add error:', message);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

// ============================================================
// GET /api/stock-portfolio — 获取所有持仓
// ============================================================

router.get('/stock-portfolio', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM stock_portfolio ORDER BY added_at DESC').all() as StockPortfolioRow[];

    // 获取全量股票列表用于评分交叉比较
    const allStocks = await fetchAllStocks();
    const stockMap = new Map<string, StockInfo>();
    for (const s of allStocks) stockMap.set(s.code, s);
    for (const s of getMockStocks()) {
      if (!stockMap.has(s.code)) stockMap.set(s.code, s);
    }

    const holdings: StockHolding[] = [];
    let totalValue = 0;
    let totalCost = 0;

    // 并行获取实时行情
    const codes = rows.map(r => r.code);
    const quotes = new Map<string, { price: number; changePct: number }>();

    for (let i = 0; i < codes.length; i += 5) {
      const batch = codes.slice(i, i + 5);
      const results = await Promise.allSettled(batch.map(c => fetchSingleStockQuote(c)));
      for (let j = 0; j < results.length; j++) {
        const it = results[j];
        if (it.status === 'fulfilled' && it.value) {
          quotes.set(batch[j], { price: it.value.price, changePct: it.value.changePct });
        }
      }
    }

    // 并行获取所有持仓的K线
    const klineResults = await Promise.allSettled(
      rows.map(r => fetchStockKLine(r.code)),
    );

    // 为每只持仓计算盈亏和评分
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let stock = stockMap.get(row.code);
      if (!stock) {
        stock = getMockStocks().find(s => s.code === row.code);
      }

      // K线数据
      const klineResult = klineResults[i];
      let klines = (klineResult.status === 'fulfilled' && klineResult.value.length >= 5)
        ? klineResult.value
        : getMockKLine(row.code);

      const score = stock ? scoreStock(stock, klines) : { momentum: 0, riskControl: 0, riskAdjusted: 0, companyQuality: 0, valuation: 0, sectorMatch: 0, total: 0 };

      // 实时价格
      const quote = quotes.get(row.code);
      let currentPrice: number;
      let todayChange = 0;

      if (quote && quote.price > 0) {
        currentPrice = quote.price;
        todayChange = quote.changePct;
      } else {
        currentPrice = klines.length > 0 ? klines[klines.length - 1].close : row.cost_price;
      }

      const currentValue = row.shares * currentPrice;
      const pnl = currentValue - row.amount;
      const pnlPercent = row.amount > 0 ? (pnl / row.amount) * 100 : 0;
      const todayPnl = (row.shares * currentPrice * todayChange) / 100;

      const signal = getStockSignal(score.total);

      // 止盈/止损评估
      const tpEval = evaluateStockTakeProfit({
        currentReturnPct: pnlPercent,
        maxReturnPct: pnlPercent, // 简化：用当前收益作为最高收益
        currentScore: score.total,
        entryScore: 65, // 默认买入评分阈值
        priceBelowMA20: false,
        currentPrice,
        highestPrice: Math.max(currentPrice, row.cost_price * 1.1),
      });

      let sellSuggestion: string;
      if (tpEval.shouldAct) {
        sellSuggestion = tpEval.reason;
        if (tpEval.stopPrice) sellSuggestion += `（止损价：${tpEval.stopPrice}）`;
      } else {
        const addedDate = new Date(row.added_at);
        if (pnlPercent >= 10) {
          sellSuggestion = `收益已达+${pnlPercent.toFixed(1)}%，建议分批止盈`;
        } else if (pnlPercent >= 5) {
          sellSuggestion = `收益+${pnlPercent.toFixed(1)}%，可设移动止盈`;
        } else if (pnlPercent <= -10) {
          sellSuggestion = '亏损超10%，建议严格止损';
        } else if (pnlPercent <= -5) {
          sellSuggestion = `亏损${Math.abs(pnlPercent).toFixed(1)}%，关注止损线`;
        } else {
          const sellDate = new Date(addedDate);
          sellDate.setDate(sellDate.getDate() + 14);
          sellSuggestion = `目标清仓日 ${sellDate.toISOString().slice(0, 10)}`;
        }
      }

      holdings.push({
        id: row.id,
        code: row.code,
        name: row.name,
        amount: row.amount,
        costPrice: row.cost_price,
        shares: row.shares,
        currentPrice: Math.round(currentPrice * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        score,
        signal,
        addedAt: row.added_at,
        todayChange: Math.round(todayChange * 100) / 100,
        todayPnl: Math.round(todayPnl * 100) / 100,
        industry: stock?.industry || '',
        sellSuggestion,
      });

      totalValue += currentValue;
      totalCost += row.amount;
    }

    const totalPnl = totalValue - totalCost;
    const summaryPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    // 保存每日快照（用于走势图）
    if (holdings.length > 0) {
      try {
        db.prepare(`INSERT OR REPLACE INTO portfolio_snapshots (date, total_value, total_cost, total_pnl, pnl_percent) VALUES (?, ?, ?, ?, ?)`)
          .run(new Date().toISOString().slice(0, 10), Math.round(totalValue * 100) / 100, totalCost, Math.round(totalPnl * 100) / 100, Math.round(summaryPnlPercent * 100) / 100);
      } catch { /* skip */ }
    }

    // 获取历史快照
    const snapshots = db.prepare('SELECT * FROM portfolio_snapshots ORDER BY date ASC LIMIT 90').all() as Array<{ date: string; total_value: number; total_cost: number; total_pnl: number; pnl_percent: number }>;

    res.json({
      success: true,
      data: {
        holdings,
        snapshots: snapshots.map(s => ({ date: s.date, value: s.total_value, pnl: s.total_pnl })),
        summary: {
          totalValue: Math.round(totalValue * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          totalPnl: Math.round(totalPnl * 100) / 100,
          pnlPercent: Math.round(summaryPnlPercent * 100) / 100,
          count: holdings.length,
        },
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse<{ holdings: StockHolding[]; summary: { totalValue: number; totalCost: number; totalPnl: number; pnlPercent: number; count: number } }>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stock-portfolio] list error:', message);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

// ============================================================
// DELETE /api/stock-portfolio/:code — 移除持仓
// ============================================================

router.delete('/stock-portfolio/:code', (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM stock_portfolio WHERE code = ?').get(code);
    if (!existing) {
      res.status(404).json({
        success: false, error: `股票 ${code} 不在持仓列表中`, timestamp: new Date().toISOString(),
      } as ApiResponse<never>);
      return;
    }

    db.prepare('DELETE FROM stock_portfolio WHERE code = ?').run(code);
    res.json({ success: true, data: { removed: code }, timestamp: new Date().toISOString() } as ApiResponse<{ removed: string }>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stock-portfolio] delete error:', message);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

// GET /api/stock-portfolio/export — CSV export
router.get('/stock-portfolio/export', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM stock_portfolio ORDER BY added_at DESC').all() as StockPortfolioRow[];

    const header = '代码,名称,投入金额,成本价,股数,添加日期';
    const lines = rows.map(r => `${r.code},${r.name},${r.amount},${r.cost_price},${r.shares},${r.added_at}`);
    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=portfolio_${new Date().toISOString().slice(0,10)}.csv`);
    res.send('﻿' + csv); // BOM for Excel
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), timestamp: new Date().toISOString() });
  }
});

export default router;
