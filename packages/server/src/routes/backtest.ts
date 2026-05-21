import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';
import { runBacktest, type BacktestResult } from '../services/backtest.js';

const router = Router();

router.get('/stocks/backtest', async (req: Request, res: Response) => {
  try {
    const lookbackDays = parseInt(req.query.days as string) || 30;
    const topN = parseInt(req.query.top as string) || 10;

    const validDays = [30, 60, 90];
    const days = validDays.includes(lookbackDays) ? lookbackDays : 30;
    const n = Math.min(Math.max(topN, 5), 20);

    const result = await runBacktest({ lookbackDays: days, topN: n });

    res.json({ success: true, data: result, timestamp: new Date().toISOString() } as ApiResponse<BacktestResult>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[backtest] error:', message);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

export default router;
