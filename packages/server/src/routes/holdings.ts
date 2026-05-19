// ============================================================
// 重仓股详情路由 — GET /api/funds/:code/holdings
//
// 返回 HoldingsDetail，包含 Top 10 持仓、加权涨跌幅、
// 板块标签、行业占比和风格判定。
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';
import type { HoldingsDetail } from '../services/holdings.js';
import { generateHoldings } from '../services/holdings.js';
import { fetchAllFunds, getMockFunds } from '../adapters/eastmoney.js';

const router = Router();

router.get('/funds/:code/holdings', async (req: Request, res: Response) => {
  try {
    const code = (req.params.code as string || '').trim();

    if (!code) {
      const body: ApiResponse<never> = {
        success: false,
        error: '请提供基金代码（/api/funds/XXXXXX/holdings）',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(body);
      return;
    }

    // 优先从真实 API 搜索，降级到 mock
    const allFunds = await fetchAllFunds();
    let fund = allFunds.find((f) => f.code === code);
    if (fund) {
      const mockFunds = getMockFunds();
      const mockMatch = mockFunds.find((f) => f.code === code);
      if (mockMatch) fund = { ...fund, ...mockMatch };
    } else {
      const mockFunds = getMockFunds();
      fund = mockFunds.find((f) => f.code === code);
    }

    if (!fund) {
      const body: ApiResponse<never> = {
        success: false,
        error: '基金代码不存在',
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(body);
      return;
    }

    // 生成持仓详情
    const data: HoldingsDetail = generateHoldings(fund);

    const body: ApiResponse<HoldingsDetail> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[holdings] 查询异常:', message);

    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

export default router;
