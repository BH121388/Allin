import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const body: ApiResponse<{ status: string; uptime: number }> = {
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
    },
    timestamp: new Date().toISOString(),
  };
  res.json(body);
});

export default router;
