// ============================================================
// 策略回测引擎
//
// 在历史时点模拟评分 → 追踪后续收益 → 验证策略有效性
// ============================================================

import type { StockInfo, StockScore } from '@allin/shared';
import { getMockStocks, getMockKLine, fetchAllStocks, fetchStockKLine, type StockKLine } from '../adapters/stock.js';
import { scoreStock } from './stock-scoring.js';

// ============================================================
// 类型
// ============================================================

export interface BacktestRequest {
  lookbackDays: number;  // 回看天数 (30/60/90)
  topN: number;          // 取前N只 (5/10)
}

export interface BacktestPick {
  rank: number;
  code: string;
  name: string;
  industry: string;
  scoreAtPick: number;      // 入选时评分
  priceAtPick: number;       // 入选时价格
  priceNow: number;          // 当前价格
  returnPct: number;         // 期间收益%
  maxDrawdownDuring: number; // 期间最大回撤%
  holdingDays: number;       // 持有天数
  hitTarget: boolean;        // 是否达到目标收益(>5%)
}

export interface BacktestResult {
  lookbackDays: number;
  topN: number;
  asOfDate: string;
  endDate: string;
  picks: BacktestPick[];
  summary: {
    totalPicks: number;
    winners: number;          // 正收益的股票数
    winRate: number;          // 胜率%
    avgReturn: number;        // 平均收益%
    bestReturn: number;       // 最佳收益%
    worstReturn: number;      // 最差收益%
    avgMaxDrawdown: number;   // 期间平均最大回撤%
    benchmarkReturn: number;  // 同期指数收益%(上证)
    alpha: number;            // 超额收益%
  };
  scoreValidated: boolean;    // 评分是否有效（高分→高收益）
  conclusion: string;
}

// ============================================================
// 主入口
// ============================================================

export async function runBacktest(params: BacktestRequest): Promise<BacktestResult> {
  const { lookbackDays = 30, topN = 10 } = params;
  const endDate = new Date();
  const asOfDate = new Date(endDate);
  asOfDate.setDate(asOfDate.getDate() - lookbackDays);

  const asOfStr = formatDate(asOfDate);
  const endStr = formatDate(endDate);

  console.log(`[backtest] 回测: ${asOfStr} → ${endStr} (${lookbackDays}天), Top ${topN}`);

  // 获取股票池
  const allStocks = await fetchAllStocks();
  const candidates = allStocks.filter(s => {
    if (s.name.includes('ST') || s.name.includes('*ST') || s.name.includes('退市')) return false;
    if (s.marketCap >= 2000 || s.marketCap < 30) return false;
    return true;
  });

  // 取候选（50只，保证性能）
  const pool = candidates.sort((a, b) => b.marketCap - a.marketCap).slice(0, 50);
  console.log(`[backtest] 候选池: ${pool.length} 只`);

  // 获取完整K线数据（包含回测期间及之后的数据）
  const klineMap = new Map<string, StockKLine[]>();
  for (let i = 0; i < pool.length; i += 10) {
    const batch = pool.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map(s => fetchStockKLine(s.code, 200)));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value.length >= lookbackDays + 5) {
        klineMap.set(batch[j].code, r.value);
      }
    }
  }
  console.log(`[backtest] K线获取: ${klineMap.size} 只`);

  // 对每个候选，用截至 asOfDate 的数据评分
  const scored: Array<{ stock: StockInfo; score: StockScore; pickPrice: number; remainingKlines: StockKLine[] }> = [];

  for (const stock of pool) {
    const fullKlines = klineMap.get(stock.code);
    if (!fullKlines) continue;

    // 找到最接近 asOfDate 的K线索引
    const asOfIdx = findClosestDate(fullKlines, asOfStr);
    if (asOfIdx < 20) continue; // 需要至少20条数据来评分

    // 截取截至 asOfDate 的数据
    const historicalKlines = fullKlines.slice(0, asOfIdx + 1);
    const remainingKlines = fullKlines.slice(asOfIdx + 1);

    if (historicalKlines.length < 5 || remainingKlines.length < 2) continue;

    const score = scoreStock(stock, historicalKlines);
    const pickPrice = historicalKlines[historicalKlines.length - 1].close;

    scored.push({ stock, score, pickPrice, remainingKlines });
  }

  // 按评分排序取 Top N
  scored.sort((a, b) => b.score.total - a.score.total);
  const topPicks = scored.slice(0, topN);

  // 计算后续收益
  const picks: BacktestPick[] = topPicks.map((p, i) => {
    const endPrice = p.remainingKlines[p.remainingKlines.length - 1].close;
    const returnPct = p.pickPrice > 0 ? ((endPrice - p.pickPrice) / p.pickPrice) * 100 : 0;
    const maxDD = calcDD(p.remainingKlines, p.pickPrice);

    return {
      rank: i + 1,
      code: p.stock.code,
      name: p.stock.name,
      industry: p.stock.industry,
      scoreAtPick: p.score.total,
      priceAtPick: Math.round(p.pickPrice * 100) / 100,
      priceNow: Math.round(endPrice * 100) / 100,
      returnPct: Math.round(returnPct * 100) / 100,
      maxDrawdownDuring: Math.round(maxDD * 100) / 100,
      holdingDays: p.remainingKlines.length,
      hitTarget: returnPct > 5,
    };
  });

  // 汇总统计
  const returns = picks.map(p => p.returnPct);
  const winners = picks.filter(p => p.returnPct > 0).length;
  const winRate = Math.round((winners / picks.length) * 100);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const bestReturn = Math.max(...returns);
  const worstReturn = Math.min(...returns);
  const avgMaxDD = picks.reduce((a, p) => a + p.maxDrawdownDuring, 0) / picks.length;

  // 基准收益：取所有候选的平均收益作为市场基准近似
  const allReturns = scored.map(p => {
    const endP = p.remainingKlines.length > 0 ? p.remainingKlines[p.remainingKlines.length - 1].close : p.pickPrice;
    return p.pickPrice > 0 ? ((endP - p.pickPrice) / p.pickPrice) * 100 : 0;
  });
  const benchmarkReturn = allReturns.length > 0
    ? Math.round((allReturns.reduce((a, b) => a + b, 0) / allReturns.length) * 100) / 100
    : 0;
  const alpha = Math.round((avgReturn - benchmarkReturn) * 100) / 100;

  // 验证评分有效性：高分股票的平均收益是否显著高于低分
  const topHalfReturns = picks.slice(0, Math.floor(picks.length / 2)).map(p => p.returnPct);
  const bottomHalfReturns = picks.slice(Math.floor(picks.length / 2)).map(p => p.returnPct);
  const topAvg = topHalfReturns.reduce((a, b) => a + b, 0) / topHalfReturns.length;
  const bottomAvg = bottomHalfReturns.reduce((a, b) => a + b, 0) / bottomHalfReturns.length;
  const scoreValidated = topAvg > bottomAvg;

  // 结论
  let conclusion: string;
  if (winRate >= 70) {
    conclusion = `策略验证有效！胜率${winRate}%，平均收益${avgReturn.toFixed(1)}%，显著跑赢基准。评分模型在当前市场环境下具有较好的选股能力。`;
  } else if (winRate >= 55) {
    conclusion = `策略基本有效。胜率${winRate}%，平均收益${avgReturn.toFixed(1)}%。评分模型有一定选股能力，但需结合仓位管理。`;
  } else if (winRate >= 40) {
    conclusion = `策略效果一般。胜率${winRate}%，超额收益不明显。建议优化评分权重或结合更多因子。`;
  } else {
    conclusion = `策略暂时失效。胜率仅${winRate}%，市场环境可能不适合当前策略，建议暂停使用等待市场回暖。`;
  }

  return {
    lookbackDays,
    topN,
    asOfDate: asOfStr,
    endDate: endStr,
    picks,
    summary: {
      totalPicks: picks.length,
      winners,
      winRate,
      avgReturn: Math.round(avgReturn * 100) / 100,
      bestReturn: Math.round(bestReturn * 100) / 100,
      worstReturn: Math.round(worstReturn * 100) / 100,
      avgMaxDrawdown: Math.round(avgMaxDD * 100) / 100,
      benchmarkReturn,
      alpha,
    },
    scoreValidated,
    conclusion,
  };
}

// ============================================================
// 辅助函数
// ============================================================

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function findClosestDate(klines: StockKLine[], targetDate: string): number {
  const target = new Date(targetDate + 'T00:00:00').getTime();
  let bestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < klines.length; i++) {
    const diff = Math.abs(new Date(klines[i].date + 'T00:00:00').getTime() - target);
    if (diff < minDiff) { minDiff = diff; bestIdx = i; }
  }
  return bestIdx;
}

function calcDD(klines: StockKLine[], entryPrice: number): number {
  let peak = entryPrice;
  let maxDD = 0;
  for (const k of klines) {
    if (k.close > peak) peak = k.close;
    const dd = ((peak - k.close) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}
