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
      // 有真实持仓数据
      const rawHoldings = detail.stockCodes.slice(0, 10).map((sc) => {
        const name = lookupStockName(sc) || sc;
        return { stockCode: sc, stockName: name };
      });

      const perWeight = Math.round((100 / rawHoldings.length) * 100) / 100;
      const realHoldings = rawHoldings.map(h => ({
        ...h,
        weight: perWeight,
        changeToday: 0,
      }));

      data = {
        fundCode: code,
        fundName: fund.name || detail.name,
        holdings: realHoldings,
        weightedChange: 0,
        sectorTags: deriveSectorTagsSimple(realHoldings.map(h => h.stockName)),
        sectorBreakdown: [],
        style: '',
        dataDate: detail.dataDate,
        source: '天天基金',
      };
    } else if (detail) {
      // API 有数据但暂未披露持仓（新基金常见）
      data = {
        fundCode: code,
        fundName: fund.name || detail.name,
        holdings: [],
        weightedChange: 0,
        sectorTags: [],
        sectorBreakdown: [],
        style: '',
        dataDate: detail.dataDate,
        source: '暂无持仓披露',
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

// 股票名→板块标签推导（基于关键词匹配）
function deriveSectorTagsSimple(stockNames: string[]): string[] {
  const tags = new Set<string>();
  const mapping: Record<string, string[]> = {
    // 消费
    '茅台': ['消费'], '五粮液': ['消费'], '泸州': ['消费'], '伊利': ['消费'],
    '美的': ['消费'], '格力': ['消费'], '洋河': ['消费'], '海天': ['消费'],
    // 新能源
    '宁德': ['新能源'], '比亚迪': ['新能源', '制造'], '隆基': ['新能源'],
    '阳光电源': ['新能源'], '通威': ['新能源'], '亿纬': ['新能源'],
    '天合': ['新能源'], '晶澳': ['新能源'], '锦浪': ['新能源'],
    '派能': ['新能源'], '固德威': ['新能源'], '禾迈': ['新能源'],
    // 医药
    '迈瑞': ['医药'], '恒瑞': ['医药'], '爱尔': ['医药'], '药明': ['医药'],
    '智飞': ['医药'], '长春高新': ['医药'], '泰格': ['医药'],
    '百济': ['医药'], '君实': ['医药'], '信达': ['医药'],
    '艾力斯': ['医药'], '康希诺': ['医药'], '荣昌': ['医药'],
    // 金融
    '招商银行': ['金融'], '平安': ['金融'], '兴业': ['金融'],
    '工商银行': ['金融'], '建设银行': ['金融'],
    // 科技/TMT
    '海康': ['科技-TMT'], '科大': ['科技-TMT'], '立讯': ['科技-TMT'],
    '腾讯': ['科技-TMT'], '阿里': ['科技-TMT'], '美团': ['科技-TMT'],
    '金山': ['科技-TMT'], '中芯': ['科技-TMT'],
    // AI/CPO/半导体
    '新易盛': ['科技-TMT'], '中际': ['科技-TMT'], '天孚': ['科技-TMT'],
    '源杰': ['科技-TMT'], '寒武纪': ['科技-TMT'], '海光': ['科技-TMT'],
    '景嘉微': ['科技-TMT'], '北方华创': ['科技-TMT'],
    '长电': ['科技-TMT'], '通富': ['科技-TMT'],
    '绿的谐波': ['制造'], '埃斯顿': ['制造'], '拓斯达': ['制造'],
    '机器人': ['制造'], '汇川': ['制造'],
    // 低空
    '中信海直': ['军工'], '万丰': ['军工'], '航天': ['军工'],
    // 公用/能源
    '长江电力': ['公用事业'], '紫金': ['能源材料'],
    '三一': ['制造'], '潍柴': ['制造'],
    '万科': ['金融地产'], '保利': ['金融地产'],
    '歌尔': ['科技-TMT'], '中兴': ['科技-TMT'],
  };
  for (const [keyword, ts] of Object.entries(mapping)) {
    if (stockNames.some(n => n.includes(keyword))) {
      ts.forEach(t => tags.add(t));
    }
  }
  // 兜底：代码匹配不到时给默认标签
  if (tags.size === 0 && stockNames.length > 0) tags.add('混合持仓');
  return Array.from(tags).slice(0, 5);
}

export default router;
