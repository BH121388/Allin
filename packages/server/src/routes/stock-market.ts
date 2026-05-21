import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';
import { getStockMarketOverview, type MarketOverview } from '../services/stock-market.js';

const router = Router();

/**
 * GET /api/stocks/market
 *   返回今日A股市场概览：指数行情、板块排名、市场宽度、热门个股。
 *   ?refresh=true 强制刷新。
 */
router.get('/stocks/market', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const data = await getStockMarketOverview(forceRefresh);

    const body: ApiResponse<MarketOverview> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stock-market] 市场概览异常:', message);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

export default router;
