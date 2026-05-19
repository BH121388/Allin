import { Router, Request, Response } from 'express';
import type { ApiResponse, MarketOverview } from '@allin/shared';
import { generateMarketOverview } from '../services/market.js';

const router = Router();

/**
 * GET /api/market/overview
 *   返回今日市场概览：板块排名、新闻事件、机会与风险。
 */
router.get('/market/overview', (_req: Request, res: Response) => {
  try {
    const data = generateMarketOverview();

    const body: ApiResponse<MarketOverview> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[market] 市场概览接口异常:', message);

    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };

    res.status(500).json(body);
  }
});

export default router;
