import { Router, Request, Response } from 'express';
import type { ApiResponse, StockAnalysis } from '@allin/shared';
import { getDailyStockRecommendations } from '../services/stock-recommend.js';

const router = Router();

/**
 * GET /api/stocks/recommend
 *   返回今日股票推荐。
 *   ?refresh=true 强制刷新管道。
 */
router.get('/stocks/recommend', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const result = await getDailyStockRecommendations(forceRefresh);

    const body: ApiResponse<{
      recommendations: StockAnalysis[];
      generatedAt: string;
      source: string;
      totalScanned: number;
    }> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stock-recommend] 推荐接口异常:', message);

    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };

    res.status(500).json(body);
  }
});

export default router;
