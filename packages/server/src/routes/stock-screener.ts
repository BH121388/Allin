import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';
import { runStockScreener, type StockScreenerFilters, type StockScreenerResult } from '../services/stock-screener.js';

const router = Router();

/**
 * GET /api/stocks/screener
 *   多条件股票筛选 + 六维评分排序。
 *
 *   Query params:
 *     minPE, maxPE          — PE 范围
 *     minMarketCap, maxMarketCap — 市值范围（亿）
 *     industry              — 行业关键词
 *     minROE                — 最低 ROE
 *     minRevenueGrowth      — 最低营收增速
 */
router.get('/stocks/screener', async (req: Request, res: Response) => {
  try {
    const filters: StockScreenerFilters = {};

    const minPE = parseFloat(req.query.minPE as string);
    const maxPE = parseFloat(req.query.maxPE as string);
    const minMarketCap = parseFloat(req.query.minMarketCap as string);
    const maxMarketCap = parseFloat(req.query.maxMarketCap as string);
    const minROE = parseFloat(req.query.minROE as string);
    const minRevenueGrowth = parseFloat(req.query.minRevenueGrowth as string);
    const industry = (req.query.industry as string || '').trim();

    if (!isNaN(minPE)) filters.minPE = minPE;
    if (!isNaN(maxPE)) filters.maxPE = maxPE;
    if (!isNaN(minMarketCap)) filters.minMarketCap = minMarketCap;
    if (!isNaN(maxMarketCap)) filters.maxMarketCap = maxMarketCap;
    if (industry) filters.industry = industry;
    if (!isNaN(minROE)) filters.minROE = minROE;
    if (!isNaN(minRevenueGrowth)) filters.minRevenueGrowth = minRevenueGrowth;

    const result = await runStockScreener(filters);

    const body: ApiResponse<StockScreenerResult> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stock-screener] error:', message);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

export default router;
