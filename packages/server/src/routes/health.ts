import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';
import { getDb } from '../db/index.js';
import { readMCPCache } from '../services/mcp-cache.js';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  let dbStatus = 'ok';
  try { getDb().prepare('SELECT 1').get(); } catch { dbStatus = 'error'; }

  let mcpStatus = 'no_data';
  try {
    const mcp = readMCPCache();
    if (mcp.updatedAt) mcpStatus = `updated_${mcp.updatedAt.slice(0, 10)}`;
  } catch { mcpStatus = 'error'; }

  const body: ApiResponse<{
    status: string; uptime: number; db: string; mcp: string; memory: string; version: string;
  }> = {
    success: true,
    data: {
      status: dbStatus === 'ok' ? 'healthy' : 'degraded',
      uptime: Math.round(process.uptime()),
      db: dbStatus,
      mcp: mcpStatus,
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      version: '1.0.0',
    },
    timestamp: new Date().toISOString(),
  };
  res.json(body);
});

export default router;
