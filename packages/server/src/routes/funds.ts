import { Router, Request, Response } from 'express';
import type { ApiResponse, FundAnalysis } from '@allin/shared';
import { getDailyRecommendations } from '../services/recommend.js';

const router = Router();

/**
 * GET /api/funds/recommend
 *   返回今日基金推荐。
 *   ?refresh=true 强制刷新管道。
 */
router.get('/funds/recommend', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const result = await getDailyRecommendations(forceRefresh);

    const body: ApiResponse<{
      recommendations: FundAnalysis[];
      generatedAt: string;
      source: string;
    }> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[funds] 推荐接口异常:', message);

    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };

    res.status(500).json(body);
  }
});

export default router;
