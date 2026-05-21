// ============================================================
// 板块个股路由 — GET /api/stocks/sector?industry=电子
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse, StockScore } from '@allin/shared';
import { fetchAllStocks, getMockStocks, getMockKLine, fetchStockKLine } from '../adapters/stock.js';
import { scoreStock } from '../services/stock-scoring.js';

const router = Router();

router.get('/stocks/sector', async (req: Request, res: Response) => {
  try {
    const industry = (req.query.industry as string || '').trim();
    if (!industry) {
      res.status(400).json({ success: false, error: '请提供行业名称', timestamp: new Date().toISOString() } as ApiResponse<never>);
      return;
    }

    const allStocks = await fetchAllStocks();
    const filtered = allStocks.filter(s => {
      if (s.name.includes('ST') || s.name.includes('*ST')) return false;
      if (s.marketCap < 30 || s.marketCap >= 2000) return false;
      return s.industry.includes(industry);
    });

    const pool = filtered.sort((a, b) => b.marketCap - a.marketCap).slice(0, 30);
    const results: Array<{ code: string; name: string; pe: number; roe: number; marketCap: number; score: StockScore }> = [];

    for (let i = 0; i < pool.length; i += 5) {
      const batch = pool.slice(i, i + 5);
      const klineResults = await Promise.allSettled(batch.map(s => fetchStockKLine(s.code)));
      for (let j = 0; j < batch.length; j++) {
        const k = klineResults[j];
        const klines = (k.status === 'fulfilled' && k.value.length >= 5) ? k.value : getMockKLine(batch[j].code);
        const score = scoreStock(batch[j], klines);
        results.push({ code: batch[j].code, name: batch[j].name, pe: batch[j].pe, roe: batch[j].roe, marketCap: batch[j].marketCap, score });
      }
    }

    results.sort((a, b) => b.score.total - a.score.total);

    res.json({ success: true, data: { industry, stocks: results, count: results.length }, timestamp: new Date().toISOString() } as ApiResponse<{ industry: string; stocks: typeof results; count: number }>);
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

export default router;
