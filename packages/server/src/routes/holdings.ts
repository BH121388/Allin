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
import { fetchAllFunds, getMockFunds, fetchFundDetail, lookupStockName } from '../adapters/eastmoney.js';

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

    // 尝试获取真实持仓数据
    const detail = await fetchFundDetail(code);
    let data: HoldingsDetail;

    if (detail && detail.stockCodes.length > 0) {
      // 使用真实持仓代码 + 股票名称映射
      // 代码已由 fetchFundDetail 清洗，直接使用
      const rawHoldings = detail.stockCodes.slice(0, 10).map((sc) => {
        const name = lookupStockName(sc);
        return { stockCode: sc, stockName: name };
      }).filter(h => h.stockName);

      // 等权分配（真实权重需从季报API获取）
      const perWeight = rawHoldings.length > 0 ? Math.round((100 / rawHoldings.length) * 100) / 100 : 0;
      const realHoldings = rawHoldings.map(h => ({
        ...h,
        weight: perWeight,
        changeToday: 0, // 实时行情需额外API
      }));

      data = {
        fundCode: code,
        fundName: fund.name || detail.name,
        holdings: realHoldings.length > 0 ? realHoldings : generateHoldings(fund).holdings,
        weightedChange: 0,
        sectorTags: realHoldings.length > 0 ? deriveSectorTagsSimple(realHoldings.map(h => h.stockName)) : [],
        sectorBreakdown: [],
        style: '',
        dataDate: detail.dataDate,
        source: '天天基金',
      };
    } else {
      data = generateHoldings(fund);
      data.source = '模拟数据';
    }

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

// 简单的股票名→板块标签推导（基于关键词）
function deriveSectorTagsSimple(stockNames: string[]): string[] {
  const tags = new Set<string>();
  const mapping: Record<string, string[]> = {
    '茅台': ['消费'], '五粮液': ['消费'], '泸州': ['消费'], '伊利': ['消费'],
    '宁德': ['新能源'], '比亚迪': ['新能源', '制造'], '隆基': ['新能源'],
    '迈瑞': ['医药'], '恒瑞': ['医药'], '爱尔': ['医药'], '药明': ['医药'],
    '招商银行': ['金融'], '平安': ['金融'], '兴业': ['金融'],
    '海康': ['科技-TMT'], '科大': ['科技-TMT'], '立讯': ['科技-TMT'],
    '腾讯': ['科技-TMT'], '阿里': ['科技-TMT'], '美团': ['科技-TMT'],
    '金山': ['科技-TMT'], '中芯': ['科技-TMT'],
    '长江电力': ['公用事业'], '紫金': ['能源材料'],
    '美的': ['消费'], '格力': ['消费'], '洋河': ['消费'],
    '三一': ['制造'], '潍柴': ['制造'],
    '万科': ['金融地产'], '保利': ['金融地产'],
  };
  for (const [keyword, ts] of Object.entries(mapping)) {
    if (stockNames.some(n => n.includes(keyword))) {
      ts.forEach(t => tags.add(t));
    }
  }
  return Array.from(tags).slice(0, 5);
}

export default router;
