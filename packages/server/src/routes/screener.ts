// ============================================================
// 动态筛选路由 — GET /api/screener?period=1y
//
// 分周期粗筛 + 五维量化评分，每次请求实时计算。
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';
import { runScreener, type ScreenerPeriod, type ScreenerResult } from '../services/dynamic-screener.js';

const router = Router();

router.get('/screener', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string || '1y').trim() as ScreenerPeriod;

    if (!['1y', '6m', '3m', '3y'].includes(period)) {
      const body: ApiResponse<never> = {
        success: false,
        error: '不支持的筛选周期，可选: 1y, 6m, 3m, 3y',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(body);
      return;
    }

    const result = await runScreener(period);

    const body: ApiResponse<ScreenerResult> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[screener] error:', message);

    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

export default router;
