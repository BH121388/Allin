// ============================================================
// 股票对比路由 — GET /api/stocks/compare?codes=A,B,C
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse, StockInfo, StockScore } from '@allin/shared';
import { getMockStocks, getMockKLine, fetchAllStocks, fetchStockKLine, fetchSingleStockQuote } from '../adapters/stock.js';
import { scoreStock } from '../services/stock-scoring.js';
import { calcBollingerBands, calcKDJ, calcOBV, getTrendSignal, type BollingerBands, type KDJ, type OBVResult } from '../services/technical.js';

const router = Router();

interface StockCompareItem {
  code: string;
  name: string;
  industry: string;
  currentPrice: number;
  changePct: number;
  marketCap: number;
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  score: StockScore;
  ret5d: number;
  ret30d: number;
  maxDrawdown: number;
  sharpe: number;
  volatility: number;
  boll: BollingerBands | null;
  kdj: KDJ | null;
  obv: OBVResult | null;
  trend: string;
}

interface ComparisonResult {
  stocks: StockCompareItem[];
  bestPick: { code: string; name: string; reason: string };
  analysis: string;
}

router.get('/stocks/compare', async (req: Request, res: Response) => {
  try {
    const codesStr = (req.query.codes as string || '').trim();
    const codes = codesStr.split(',').map(c => c.trim()).filter(c => /^\d{6}$/.test(c));

    if (codes.length < 2 || codes.length > 3) {
      res.status(400).json({ success: false, error: '请提供2-3个股票代码（用逗号分隔）', timestamp: new Date().toISOString() } as ApiResponse<never>);
      return;
    }

    // 获取股票信息
    const allStocks = await fetchAllStocks();
    const stockMap = new Map<string, StockInfo>();
    for (const s of allStocks) stockMap.set(s.code, s);
    for (const s of getMockStocks()) { if (!stockMap.has(s.code)) stockMap.set(s.code, s); }

    const items: StockCompareItem[] = [];

    for (const code of codes) {
      const stock = stockMap.get(code);
      if (!stock) continue;

      // K线
      let klines = await fetchStockKLine(code);
      if (klines.length < 5) klines = getMockKLine(code);

      const score = scoreStock(stock, klines);

      // 实时行情
      let currentPrice = klines.length > 0 ? klines[klines.length - 1].close : 0;
      let changePct = 0;
      try {
        const q = await fetchSingleStockQuote(code);
        if (q && q.price > 0) { currentPrice = q.price; changePct = q.changePct; }
      } catch { /* skip */ }

      // 技术指标
      const navAdapter = klines.map(k => ({ date: k.date, nav: k.close, accNav: k.close, dailyReturn: k.dailyReturn }));
      const boll = calcBollingerBands(navAdapter);
      const kdj = calcKDJ(navAdapter);
      const obvData = klines.map(k => ({ close: k.close, volume: k.volume }));
      const obv = calcOBV(obvData);
      const trend = getTrendSignal(navAdapter);

      // K线指标
      const ret5d = calcReturn(klines, 5);
      const ret30d = calcReturn(klines, 30);
      const maxDrawdown = calcMaxDrawdown(klines);
      const sharpe = calcSharpe(klines);
      const volatility = calcVolatility(klines);

      items.push({
        code, name: stock.name, industry: stock.industry,
        currentPrice, changePct, marketCap: stock.marketCap,
        pe: stock.pe, pb: stock.pb, roe: stock.roe,
        revenueGrowth: stock.revenueGrowth, profitGrowth: stock.profitGrowth,
        score, ret5d, ret30d, maxDrawdown, sharpe, volatility,
        boll, kdj, obv,
        trend: trend.trend === 'bullish' ? '多头' : trend.trend === 'bearish' ? '空头' : '震荡',
      });
    }

    if (items.length < 2) {
      res.status(404).json({ success: false, error: '未找到有效股票', timestamp: new Date().toISOString() } as ApiResponse<never>);
      return;
    }

    // 选出最优
    const sorted = [...items].sort((a, b) => b.score.total - a.score.total);
    const best = sorted[0];
    const bestPick = {
      code: best.code,
      name: best.name,
      reason: `${best.name}综合得分${best.score.total}/100最高，` +
        `收益动量${best.score.momentum}/25，风险控制${best.score.riskControl}/20，` +
        `公司质量${best.score.companyQuality}/15。` +
        (best.score.total >= 70 ? '各方面表现均衡，建议优先考虑。' :
         best.score.total >= 55 ? '整体表现良好，可作为重点关注对象。' : '当前评分一般，建议等待更好的时机。'),
    };

    // 生成对比分析
    const analysis = generateCompareAnalysis(items);

    res.json({
      success: true,
      data: { stocks: items, bestPick, analysis },
      timestamp: new Date().toISOString(),
    } as ApiResponse<ComparisonResult>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stock-compare] error:', message);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

// ============================================================
// K线指标计算
// ============================================================

function calcReturn(klines: Array<{ close: number; dailyReturn: number }>, days: number): number {
  if (klines.length < 2) return 0;
  const idx = Math.max(0, klines.length - 1 - Math.min(days, klines.length - 1));
  const start = klines[idx].close;
  const end = klines[klines.length - 1].close;
  if (start <= 0) return 0;
  return ((end - start) / start) * 100;
}

function calcMaxDrawdown(klines: Array<{ close: number }>): number {
  let peak = klines[0]?.close ?? 0;
  let maxDD = 0;
  for (const k of klines) { if (k.close > peak) peak = k.close; const dd = ((peak - k.close) / peak) * 100; if (dd > maxDD) maxDD = dd; }
  return maxDD;
}

function calcSharpe(klines: Array<{ dailyReturn: number }>): number {
  const returns = klines.slice(1).map(k => k.dailyReturn || 0);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  return std > 0 ? (mean / std) * Math.sqrt(252) : 0;
}

function calcVolatility(klines: Array<{ dailyReturn: number }>): number {
  return Math.sqrt((() => {
    const r = klines.slice(1).map(k => k.dailyReturn || 0);
    if (r.length < 2) return 0;
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    return r.reduce((s, v) => s + (v - m) ** 2, 0) / r.length;
  })()) * Math.sqrt(252);
}

function generateCompareAnalysis(items: StockCompareItem[]): string {
  const names = items.map(i => i.name).join('、');
  const best = items.reduce((a, b) => a.score.total > b.score.total ? a : b);
  const parts = [ `${names}三只股票对比分析：` ];

  // 评分对比
  parts.push(`综合评分方面，${best.name}以${best.score.total}分领先。`);

  // 估值对比
  const cheapestPE = items.filter(i => i.pe > 0).reduce((a, b) => a.pe < b.pe ? a : b, items[0]);
  if (cheapestPE.pe > 0) parts.push(`估值方面，${cheapestPE.name}PE最低为${cheapestPE.pe.toFixed(1)}。`);

  // 成长对比
  const highestGrowth = items.reduce((a, b) => a.profitGrowth > b.profitGrowth ? a : b);
  parts.push(`成长性方面，${highestGrowth.name}净利润增速${highestGrowth.profitGrowth.toFixed(1)}%最高。`);

  // 风险对比
  const lowestDD = items.reduce((a, b) => a.maxDrawdown < b.maxDrawdown ? a : b);
  parts.push(`风险控制方面，${lowestDD.name}最大回撤${lowestDD.maxDrawdown.toFixed(1)}%最小。`);

  // 结论
  parts.push(`综合考虑评分、估值、成长和风险，${best.name}是当前最优选择。`);

  return parts.join('');
}

export default router;
