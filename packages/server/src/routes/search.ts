// ============================================================
// 基金查询路由 — GET /api/funds/search?code=XXXXXX
//
// 返回完整的 FundAnalysis 报告，包含评分、信号、风险指标、
// 持仓、行业标签、同业比较和分析文本。
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse, FundAnalysis, RiskMetrics, TopHolding, PeerComparison, FundScore } from '@allin/shared';
import { fetchAllFunds, getMockFunds, getMockNAV, type NAVEntry } from '../adapters/eastmoney.js';
import { scoreFund, scoreAllFunds, calcMaxDrawdown, calcAnnualVolatility, calcSharpe } from '../services/scoring.js';
import { generateSignal } from '../services/signals.js';
import { getTrendSignal } from '../services/technical.js';
import { calculateInvestMultiplier } from '../services/invest.js';
import { getTakeProfitRule } from '../services/takeProfit.js';

const router = Router();

// ============================================================
// 路由
// ============================================================

router.get('/funds/search', async (_req: Request, res: Response) => {
  try {
    const code = (_req.query.code as string || '').trim();

    if (!code) {
      const body: ApiResponse<never> = {
        success: false,
        error: '请提供基金代码（?code=XXXXXX）',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(body);
      return;
    }

    // 1. 查找基金：优先从真实 API 搜索，降级到 mock
    const allFunds = await fetchAllFunds();
    let fund = allFunds.find((f) => f.code === code);

    // 真实数据中的 FundInfo 缺少部分字段，用 mock 数据补全
    if (fund) {
      const mockFunds = getMockFunds();
      const mockMatch = mockFunds.find((f) => f.code === code);
      if (mockMatch) {
        fund = { ...fund, ...mockMatch }; // mock 数据覆盖缺失字段
      }
    } else {
      // 真实 API 中没找到，尝试 mock（兼容之前的行为）
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

    // 2. 获取净值数据
    const navData = getMockNAV(code);

    // 3. 六维评分 — 使用与推荐一致的批量交叉归一化
    const mockFunds = getMockFunds();
    const navMap = new Map<string, NAVEntry[]>();
    navMap.set(code, navData);
    // 补全 mock 基金池的净值数据用于归一化
    for (const mf of mockFunds) {
      if (mf.code !== code) navMap.set(mf.code, getMockNAV(mf.code));
    }
    const allScores = scoreAllFunds(mockFunds, navMap);
    const score = allScores.get(code) || scoreFund(fund, navData);

    // 4. 交易信号
    const signal = generateSignal(fund, score, navData);

    // 5. 技术指标（趋势信号）
    const trendInfo = getTrendSignal(navData);

    // 6. 定投建议（默认 PE=50 分位）
    const investResult = calculateInvestMultiplier(50);
    const investAdvice = {
      pePercentile: 50,
      multiplier: investResult.multiplier,
      strategy: investResult.strategy,
    };

    // 7. 止盈规则
    const takeProfit = getTakeProfitRule(fund.type);

    // 8. 风险指标
    const riskMetrics = computeRiskMetrics(navData);

    // 9. 持仓（mock）
    const holdings = generateHoldings(fund.code, fund.name, fund.type);

    // 10. 行业标签
    const sectorTags = deriveSectorTags(fund.name, fund.type);

    // 11. 同业比较
    const peerComparison = estimatePeerComparison(fund, navData, score);

    // 12. 生成分析文本（200+ 字中文）
    const analysis = buildAnalysisText(
      fund,
      score,
      signal,
      navData,
      riskMetrics,
      trendInfo,
      takeProfit,
      sectorTags,
      peerComparison,
    );

    // 13. 组装响应
    const data: FundAnalysis = {
      // FundInfo 字段
      code: fund.code,
      name: fund.name,
      type: fund.type,
      manager: fund.manager,
      tenure: fund.tenure,
      managerReturn: fund.managerReturn,
      scale: fund.scale,
      inception: fund.inception,
      company: fund.company,
      // 评分
      score,
      // 信号
      signal,
      // 定投建议
      investAdvice,
      // 分析文本
      analysis,
      // 风险指标
      riskMetrics,
      // 持仓
      holdings,
      // 行业标签
      sectorTags,
      // 同业比较
      peerComparison,
    };

    const body: ApiResponse<FundAnalysis> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[search] 查询异常:', message);

    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

// ============================================================
// 风险指标计算
// ============================================================

function computeRiskMetrics(navData: NAVEntry[]): RiskMetrics {
  const maxDrawdown = calcMaxDrawdown(navData);
  const volatility = calcAnnualVolatility(navData);
  const sharpe = calcSharpe(navData);
  const sortino = calcSortino(navData);
  const annualReturn = calcAnnualizedReturn(navData);
  const calmar = maxDrawdown > 0 ? Math.round((annualReturn / maxDrawdown) * 100) / 100 : 0;

  // Beta 估值：基于波动率估算，范围 0.7-1.3
  const beta = Math.round((0.75 + (volatility / 35) * 0.55) * 100) / 100;
  // Alpha: Jensen 模型估算（无风险利率 2.5%，市场收益 8%）
  const riskFreeRate = 2.5;
  const marketReturn = 8.0;
  const alpha = Math.round((annualReturn - riskFreeRate - beta * (marketReturn - riskFreeRate)) * 100) / 100;
  // 信息比率：基于夏普比率估算（无基准情况）
  const infoRatio = Math.round(sharpe * 0.65 * 100) / 100;

  return {
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    volatility: Math.round(volatility * 100) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
    sortino: Math.round(sortino * 100) / 100,
    calmar,
    infoRatio,
    beta,
    alpha,
  };
}

/**
 * 计算索提诺比率（年化收益 / 下行标准差）。
 */
function calcSortino(navData: NAVEntry[]): number {
  const returns = navData.slice(1).map((e) => e.dailyReturn).filter((r) => typeof r === 'number' && !Number.isNaN(r));
  if (returns.length < 10) return 0;

  const negReturns = returns.filter((r) => r < 0);
  if (negReturns.length < 3) return 0;

  const meanNeg = negReturns.reduce((a, b) => a + b, 0) / negReturns.length;
  const variance = negReturns.reduce((sum, r) => sum + (r - meanNeg) ** 2, 0) / negReturns.length;
  const downsideDev = Math.sqrt(variance) * Math.sqrt(252);

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualReturn = meanReturn * 252;

  return downsideDev > 0 ? annualReturn / downsideDev : 0;
}

/**
 * 计算年化收益率（基于日收益均值 * 252）。
 */
function calcAnnualizedReturn(navData: NAVEntry[]): number {
  const returns = navData.slice(1).map((e) => e.dailyReturn).filter((r) => typeof r === 'number' && !Number.isNaN(r));
  if (returns.length < 2) return 0;
  const meanDaily = returns.reduce((a, b) => a + b, 0) / returns.length;
  return meanDaily * 252;
}

/**
 * 计算截止最新日期的回溯区间收益率（百分比）。
 */
function calcReturnFrom(navData: NAVEntry[], lookbackDays: number): number {
  if (navData.length < 2) return 0;
  const targetIdx = Math.max(0, navData.length - 1 - Math.min(lookbackDays, navData.length - 1));
  const startNav = navData[targetIdx].nav;
  const endNav = navData[navData.length - 1].nav;
  if (startNav <= 0) return 0;
  return ((endNav - startNav) / startNav) * 100;
}

// ============================================================
// Mock 持仓生成
// ============================================================

interface StockTemplate {
  code: string;
  name: string;
  baseWeight: number;
}

const HOLDING_TEMPLATES: Record<string, StockTemplate[]> = {
  // 蓝筹/消费类
  bluechip: [
    { code: '600519', name: '贵州茅台', baseWeight: 9.2 },
    { code: '000858', name: '五粮液', baseWeight: 7.8 },
    { code: '000568', name: '泸州老窖', baseWeight: 5.6 },
    { code: '600887', name: '伊利股份', baseWeight: 4.3 },
    { code: '002415', name: '海康威视', baseWeight: 3.8 },
  ],
  // 新能源/制造
  newEnergy: [
    { code: '300750', name: '宁德时代', baseWeight: 9.5 },
    { code: '002594', name: '比亚迪', baseWeight: 7.2 },
    { code: '601012', name: '隆基绿能', baseWeight: 6.1 },
    { code: '300274', name: '阳光电源', baseWeight: 4.8 },
    { code: '600438', name: '通威股份', baseWeight: 3.5 },
  ],
  // 医药
  medical: [
    { code: '300760', name: '迈瑞医疗', baseWeight: 8.5 },
    { code: '600276', name: '恒瑞医药', baseWeight: 7.0 },
    { code: '300015', name: '爱尔眼科', baseWeight: 5.8 },
    { code: '300122', name: '智飞生物', baseWeight: 4.6 },
    { code: '600196', name: '复星医药', baseWeight: 3.2 },
  ],
  // 科技
  tech: [
    { code: '002230', name: '科大讯飞', baseWeight: 7.5 },
    { code: '688111', name: '金山办公', baseWeight: 6.2 },
    { code: '300124', name: '汇川技术', baseWeight: 5.0 },
    { code: '002475', name: '立讯精密', baseWeight: 4.8 },
    { code: '300661', name: '圣邦股份', baseWeight: 3.6 },
  ],
  // 金融/大盘
  financial: [
    { code: '601318', name: '中国平安', baseWeight: 8.0 },
    { code: '600036', name: '招商银行', baseWeight: 7.0 },
    { code: '601166', name: '兴业银行', baseWeight: 5.5 },
    { code: '600030', name: '中信证券', baseWeight: 4.2 },
    { code: '601398', name: '工商银行', baseWeight: 3.0 },
  ],
  // 白酒消费
  baijiu: [
    { code: '600519', name: '贵州茅台', baseWeight: 14.5 },
    { code: '000858', name: '五粮液', baseWeight: 12.8 },
    { code: '000568', name: '泸州老窖', baseWeight: 9.5 },
    { code: '002304', name: '洋河股份', baseWeight: 6.8 },
    { code: '000596', name: '古井贡酒', baseWeight: 4.2 },
  ],
  // 默认
  default: [
    { code: '600519', name: '贵州茅台', baseWeight: 6.0 },
    { code: '601318', name: '中国平安', baseWeight: 5.0 },
    { code: '000858', name: '五粮液', baseWeight: 4.5 },
    { code: '300750', name: '宁德时代', baseWeight: 4.0 },
    { code: '600036', name: '招商银行', baseWeight: 3.5 },
  ],
};

function pickTemplate(code: string, name: string, type: string): StockTemplate[] {
  const combined = `${name}${type}`;
  if (combined.includes('白酒')) return HOLDING_TEMPLATES.baijiu;
  if (combined.includes('蓝筹') || combined.includes('精选')) return HOLDING_TEMPLATES.bluechip;
  if (combined.includes('能源') || combined.includes('新能源')) return HOLDING_TEMPLATES.newEnergy;
  if (combined.includes('医疗') || combined.includes('医药')) return HOLDING_TEMPLATES.medical;
  if (combined.includes('创新') || combined.includes('科技') || combined.includes('成长')) return HOLDING_TEMPLATES.tech;
  if (combined.includes('50') || combined.includes('沪深300') || combined.includes('价值')) return HOLDING_TEMPLATES.financial;
  if (type.includes('QDII')) return HOLDING_TEMPLATES.tech;
  return HOLDING_TEMPLATES.default;
}

function generateHoldings(code: string, name: string, type: string): TopHolding[] {
  const template = pickTemplate(code, name, type);
  // 基于基金代码的确定性随机种子
  const seed = hashCode(code);
  const rng = createRNG(seed);

  return template.map((t) => ({
    stockCode: t.code,
    stockName: t.name,
    weight: Math.round((t.baseWeight + (rng() - 0.5) * 2) * 100) / 100, // ±1% 扰动
    changeToday: Math.round((rngNormal(rng) * 2.5) * 100) / 100, // 今日涨跌幅
  }));
}

// ============================================================
// 行业标签推导
// ============================================================

function deriveSectorTags(name: string, type: string): string[] {
  const combined = `${name}${type}`.toLowerCase();
  const tags: string[] = [];

  if (combined.includes('白酒')) { tags.push('食品饮料', '白酒'); }
  if (combined.includes('蓝筹') || combined.includes('精选')) { tags.push('食品饮料', '金融', '医药生物', '电子'); }
  if (combined.includes('能源') || combined.includes('新能源')) { tags.push('电力设备', '新能源', '有色金属'); }
  if (combined.includes('医疗') || combined.includes('医药')) { tags.push('医药生物', '医疗器械', '医疗服务'); }
  if (combined.includes('创新') || combined.includes('科技')) { tags.push('电子', '计算机', '通信'); }
  if (combined.includes('50')) { tags.push('银行', '非银金融', '食品饮料'); }
  if (combined.includes('价值')) { tags.push('银行', '房地产', '建筑装饰'); }
  if (combined.includes('qdii')) { tags.push('互联网', '科技', '消费'); }
  if (combined.includes('稳健')) { tags.push('银行', '公用事业', '交通运输'); }
  if (combined.includes('成长') && tags.length === 0) { tags.push('电子', '医药生物', '计算机'); }

  // 兜底
  if (tags.length === 0) {
    if (type.includes('股票')) tags.push('医药生物', '电子', '食品饮料');
    else if (type.includes('混合')) tags.push('食品饮料', '金融', '电力设备');
    else if (type.includes('指数')) tags.push('银行', '非银金融', '食品饮料');
    else tags.push('食品饮料', '电子', '金融');
  }

  return [...new Set(tags)].slice(0, 5); // 去重取前5
}

// ============================================================
// 同业比较估算
// ============================================================

function estimatePeerComparison(
  fund: { type: string; scale: number },
  navData: NAVEntry[],
  score: FundScore,
): PeerComparison {
  // 根据基金类型估算同类基金数量
  const peerCounts: Record<string, number> = {
    '偏股混合型': 1800,
    '灵活配置型': 2200,
    '股票型': 950,
    '指数型': 1400,
    'QDII': 300,
    '混合型': 2800,
  };
  let totalPeers = 1000;
  for (const [key, count] of Object.entries(peerCounts)) {
    if (fund.type.includes(key)) {
      totalPeers = count;
      break;
    }
  }

  // 排名百分位基于评分推算：score 越高排名越靠前
  const rankPercentile = Math.max(1, Math.min(99, Math.round(100 - score.total)));

  // 同类平均收益估算（%）
  const categoryAvgReturn = Math.round((calcReturnFrom(navData, 90) * 0.8) * 100) / 100;

  // 该基金收益（近3月）
  const fundReturn = Math.round(calcReturnFrom(navData, 90) * 100) / 100;

  return {
    rankPercentile,
    totalPeers,
    categoryAvgReturn,
    fundReturn,
  };
}

// ============================================================
// 分析文本生成（200+ 中文字符）
// ============================================================

function buildAnalysisText(
  fund: { name: string; type: string },
  score: FundScore,
  signal: { signal: string },
  navData: NAVEntry[],
  risk: RiskMetrics,
  trendInfo: { trend: string; description: string },
  takeProfit: { description: string; method: string },
  sectorTags: string[],
  peer: PeerComparison,
): string {
  const ret1m = calcReturnFrom(navData, 22);
  const ret3m = calcReturnFrom(navData, 66);

  // 收益表现评价
  let performanceLabel: string;
  if (ret3m > 10) performanceLabel = '偏强';
  else if (ret3m > 0) performanceLabel = '中等偏强';
  else if (ret3m > -5) performanceLabel = '中等';
  else performanceLabel = '偏弱';

  // 收益来源判断
  let incomeSource: string;
  if (score.momentum >= 20) incomeSource = '选股能力与市场Beta共振';
  else if (score.riskAdjusted >= 12) incomeSource = '优秀的风险调整能力';
  else if (score.sectorMatch >= 7) incomeSource = '行业配置';
  else incomeSource = '市场Beta驱动';

  // 风险水平评价
  let riskLevel: string;
  if (risk.sharpe > 1.5) riskLevel = '风险调整收益优秀，下行风险控制出色';
  else if (risk.sharpe > 0.8) riskLevel = '风险调整收益良好，波动处于可接受范围';
  else if (risk.sharpe > 0.3) riskLevel = '风险收益基本匹配，需关注市场下行风险';
  else riskLevel = '风险调整收益偏弱，波动较大，建议严格控制仓位';

  // 持仓风格描述
  let styleDesc: string;
  if (fund.type.includes('指数')) styleDesc = '被动跟踪指数，持仓偏向大盘权重股';
  else if (fund.type.includes('偏股')) styleDesc = '主动偏股型，持仓偏向大盘成长与价值均衡风格';
  else if (fund.type.includes('灵活配置')) styleDesc = '灵活配置型，持仓风格灵活切换，偏向中盘均衡';
  else if (fund.type.includes('股票')) styleDesc = '高仓位运行，持仓偏向中大盘成长风格';
  else if (fund.type.includes('QDII')) styleDesc = 'QDII跨境投资，持仓偏向海外中概科技成长';
  else styleDesc = '持仓偏向大盘价值与成长均衡风格';

  // 行业景气判断
  const primarySector = sectorTags[0] || '核心持仓行业';
  const sectorCycle = score.sectorMatch >= 7 ? '景气上行' : '调整修复';
  const concentrationLabel = sectorTags.length <= 2 ? '集中' : sectorTags.length <= 4 ? '相对均衡' : '分散';

  // 同类比较评语
  let peerComment: string;
  if (peer.rankPercentile <= 20) peerComment = '表现优异，排名同类前列';
  else if (peer.rankPercentile <= 40) peerComment = '表现良好，处于同类中上水平';
  else if (peer.rankPercentile <= 60) peerComment = '表现中规中矩，居于同类中等水平';
  else peerComment = '表现偏弱，排名同类中下游，需谨慎跟踪';

  // 定投/止盈综合建议
  const strategyNote = `止盈策略采用${takeProfit.method === 'batch' ? '分批止盈' : takeProfit.method === 'half_then_trail' ? '半仓跟踪止盈' : takeProfit.method === 'momentum' ? '动量止盈' : takeProfit.method === 'ladder' ? '阶梯止盈' : '固定止盈'}法，${takeProfit.description}。`;

  const parts = [
    `业绩归因：${fund.name}近1月收益率为${ret1m.toFixed(2)}%，近3月收益率为${ret3m.toFixed(2)}%，在同类基金中表现${performanceLabel}。收益主要来源于${incomeSource}。`,
    `风险提示：最大回撤为${risk.maxDrawdown.toFixed(1)}%，年化波动率为${risk.volatility.toFixed(1)}%，夏普比率为${risk.sharpe.toFixed(2)}，${riskLevel}。`,
    `持仓风格：该基金为${fund.type}，${styleDesc}。`,
    `行业配置：重仓行业包括${sectorTags.slice(0, 3).join('、') || '多元行业'}，当前${primarySector}行业处于${sectorCycle}周期，整体行业配置${concentrationLabel}。`,
    `同类比较：在同类${peer.totalPeers}只基金中排名约前${peer.rankPercentile}%，同类近3月平均收益${peer.categoryAvgReturn.toFixed(2)}%，该基金${peer.fundReturn.toFixed(2)}%。${peerComment}。`,
    `技术信号：当前趋势${trendInfo.trend === 'bullish' ? '偏多' : trendInfo.trend === 'bearish' ? '偏空' : '震荡'}，${trendInfo.description}。综合评分${score.total}/100，建议${signal.signal === 'buy' ? '买入' : signal.signal === 'hold' ? '持有' : signal.signal === 'reduce' ? '减持' : '卖出'}。${strategyNote}`,
  ];

  return parts.join('');
}

// ============================================================
// 工具函数 — 确定性随机数
// ============================================================

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function createRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngNormal(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  const safeU1 = u1 === 0 ? 0.0001 : u1;
  return Math.sqrt(-2 * Math.log(safeU1)) * Math.cos(2 * Math.PI * u2);
}

export default router;
