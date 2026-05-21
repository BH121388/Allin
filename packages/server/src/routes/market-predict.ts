import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';
import { predictMarket, getPredictionStats, type MarketPrediction } from '../services/market-predict.js';

const router = Router();

router.get('/stocks/predict', async (_req: Request, res: Response) => {
  try {
    const forceRefresh = _req.query.refresh === 'true';
    const data = await predictMarket(forceRefresh);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as ApiResponse<MarketPrediction>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[market-predict] error:', message);
    res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

router.get('/stocks/predict/stats', (_req: Request, res: Response) => {
  try {
    const stats = getPredictionStats();
    res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), timestamp: new Date().toISOString() });
  }
});

export default router;
