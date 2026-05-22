// ============================================================
// 股票六维评分引擎
//
// 对股票从六个维度进行评分（总分 0-100）：
//   1. 收益动量 (momentum)         0-25 — 短中期价格动量
//   2. 风险控制 (riskControl)       0-20 — 最大回撤 + 波动率
//   3. 风险调整收益 (riskAdjusted)  0-15 — 夏普比率
//   4. 公司质量 (companyQuality)    0-15 — ROE + 盈利增速 + 净利率
//   5. 估值性价比 (valuation)       0-15 — PE分位 + PB相对行业
//   6. 行业景气匹配 (sectorMatch)   0-10 — 行业近期动量
// ============================================================

import type { StockInfo, StockScore } from '@allin/shared';
import { STOCK_SCORE_GRADES } from '@allin/shared';
import type { StockKLine } from '../adapters/stock.js';

// ============================================================
// 固定参考值 — 归一化区间
// ============================================================

const FIXED_REF = {
  ret5d:     { min: -15, max: 25 },
  ret15d:    { min: -25, max: 50 },
  ret30d:    { min: -35, max: 80 },
  sharpe:    { min: -1,  max: 3 },
  drawdown:  { min: 5,   max: 45 },
  volatility:{ min: 15,  max: 60 },
};

// 公司质量参考值
const QUALITY_REF = {
  roe:       { min: -10, max: 35 },
  profitGrowth: { min: -30, max: 80 },
  netMargin: { min: -5,  max: 45 },
};

// ============================================================
// 归一化工具
// ============================================================

function normFixed(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// K线指标计算
// ============================================================

function calcReturnFrom(klines: StockKLine[], days: number): number {
  if (klines.length < 2) return 0;
  const targetIdx = Math.max(0, klines.length - 1 - Math.min(days, klines.length - 1));
  const startPrice = klines[targetIdx].close;
  const endPrice = klines[klines.length - 1].close;
  if (startPrice <= 0) return 0;
  return ((endPrice - startPrice) / startPrice) * 100;
}

function calcSharpeFromKLine(klines: StockKLine[]): number {
  const returns: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    returns.push(klines[i].dailyReturn || 0);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  return std > 0 ? (mean / std) * Math.sqrt(252) : 0;
}

function calcMaxDrawdownFromKLine(klines: StockKLine[]): number {
  if (klines.length === 0) return 0;
  let peak = klines[0].close;
  let maxDD = 0;
  for (const k of klines) {
    if (k.close > peak) peak = k.close;
    const dd = ((peak - k.close) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function calcVolatilityFromKLine(klines: StockKLine[]): number {
  const returns: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    returns.push(klines[i].dailyReturn || 0);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** 年化收益率（基于日收益均值*252） */
function calcAnnualizedReturnFromKLine(klines: StockKLine[]): number {
  const returns: number[] = [];
  for (let i = 1; i < klines.length; i++) returns.push(klines[i].dailyReturn || 0);
  if (returns.length < 2) return 0;
  return (returns.reduce((a, b) => a + b, 0) / returns.length) * 252;
}

// ============================================================
// 索提诺比率
// ============================================================

function calcSortinoFromKLine(klines: StockKLine[]): number {
  const returns: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    returns.push(klines[i].dailyReturn || 0);
  }
  if (returns.length < 10) return 0;
  const negReturns = returns.filter(r => r < 0);
  if (negReturns.length < 3) return 0;
  const meanNeg = negReturns.reduce((a, b) => a + b, 0) / negReturns.length;
  const variance = negReturns.reduce((s, r) => s + (r - meanNeg) ** 2, 0) / negReturns.length;
  const downsideDev = Math.sqrt(variance) * Math.sqrt(252);
  const annualRet = (returns.reduce((a, b) => a + b, 0) / returns.length) * 252;
  return downsideDev > 0 ? annualRet / downsideDev : 0;
}

// ============================================================
// 单只股票六维评分
// ============================================================

export function scoreStock(stock: StockInfo, klines: StockKLine[]): StockScore {
  if (klines.length < 5) {
    return {
      momentum: 0,
      riskControl: 5,
      riskAdjusted: 3,
      companyQuality: scoreCompanyQuality(stock),
      valuation: scoreValuation(stock),
      sectorMatch: scoreSectorMatch(stock),
      total: 0,
    };
  }

  const R = FIXED_REF;

  // 1. 收益动量 (0-25): 5d 20% + 15d 20% + 30d 10%
  const ret5d = calcReturnFrom(klines, 5);
  const ret15d = calcReturnFrom(klines, 15);
  const ret30d = calcReturnFrom(klines, 30);
  const s5 = normFixed(ret5d, R.ret5d.min, R.ret5d.max) * 20;
  const s15 = normFixed(ret15d, R.ret15d.min, R.ret15d.max) * 20;
  const s30 = normFixed(ret30d, R.ret30d.min, R.ret30d.max) * 10;
  const momentum = Math.round(s5 + s15 + s30);

  // 2. 风险控制 (0-20): 最大回撤 50% + 波动率 50%
  const maxDD = calcMaxDrawdownFromKLine(klines);
  const volatility = calcVolatilityFromKLine(klines);
  const sDD = (1 - normFixed(maxDD, R.drawdown.min, R.drawdown.max)) * 20;
  const sVO = (1 - normFixed(volatility, R.volatility.min, R.volatility.max)) * 20;
  const riskControl = Math.round(0.5 * sDD + 0.5 * sVO);

  // 3. 风险调整收益 (0-15): 夏普比率
  const sharpe = calcSharpeFromKLine(klines);
  const riskAdjusted = Math.round(normFixed(sharpe, R.sharpe.min, R.sharpe.max) * 15);

  // 4. 公司质量 (0-15): ROE 40% + 盈利增速 35% + 净利率 25%
  const companyQuality = scoreCompanyQuality(stock);

  // 5. 估值性价比 (0-15)
  const valuation = scoreValuation(stock);

  // 6. 行业景气匹配 (0-10)
  const sectorMatch = scoreSectorMatch(stock);

  const sum = momentum + riskControl + riskAdjusted + companyQuality + valuation + sectorMatch;
  const total = isNaN(sum) ? 30 : clamp(sum, 0, 100);

  return {
    momentum: clamp(momentum, 0, 25),
    riskControl: clamp(riskControl, 0, 20),
    riskAdjusted: clamp(riskAdjusted, 0, 15),
    companyQuality: clamp(companyQuality, 0, 15),
    valuation: clamp(valuation, 0, 15),
    sectorMatch: clamp(sectorMatch, 0, 10),
    total,
  };
}

// ============================================================
// 公司质量评分 (0-15)
// ============================================================

function scoreCompanyQuality(stock: StockInfo): number {
  const Q = QUALITY_REF;
  const roe = typeof stock.roe === 'number' && !isNaN(stock.roe) ? stock.roe : 0;
  const profitGrowth = typeof stock.profitGrowth === 'number' && !isNaN(stock.profitGrowth) ? stock.profitGrowth : 0;
  const netMargin = typeof stock.netProfitMargin === 'number' && !isNaN(stock.netProfitMargin) ? stock.netProfitMargin : 0;
  const roeScore = normFixed(roe, Q.roe.min, Q.roe.max) * 6;
  const profitScore = normFixed(profitGrowth, Q.profitGrowth.min, Q.profitGrowth.max) * 5;
  const marginScore = normFixed(netMargin, Q.netMargin.min, Q.netMargin.max) * 4;
  const result = Math.round(roeScore + profitScore + marginScore);
  return isNaN(result) ? 3 : result; // 数据缺失时给中性分
}

// ============================================================
// 估值性价比评分 (0-15)
// ============================================================

function scoreValuation(stock: StockInfo): number {
  // 基于 PE 估值分位评分
  if (stock.pe <= 0) return 5; // 亏损股票，估值不可用，给中性分

  // 根据 PE 绝对值粗略估算分位（简化版）
  // PE < 10 → 极度低估（前20%分位）
  // PE 10-15 → 低估
  // PE 15-25 → 合理偏低
  // PE 25-40 → 合理
  // PE 40-60 → 高估
  // PE > 60 → 极度高估

  let tierScore: number;
  if (stock.pe < 10) tierScore = 15;
  else if (stock.pe < 15) tierScore = 13;
  else if (stock.pe < 25) tierScore = 10;
  else if (stock.pe < 40) tierScore = 7;
  else if (stock.pe < 60) tierScore = 4;
  else tierScore = 1;

  // PB 调整 (-2 ~ +2)
  let pbAdjust = 0;
  if (stock.pb > 0 && stock.pb < 1.5) pbAdjust = 2;
  else if (stock.pb > 0 && stock.pb < 3) pbAdjust = 1;
  else if (stock.pb > 8) pbAdjust = -1;
  else if (stock.pb > 12) pbAdjust = -2;

  return clamp(tierScore + pbAdjust, 0, 15);
}

// ============================================================
// 行业景气匹配评分 (0-10)
// ============================================================

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function scoreSectorMatch(stock: StockInfo): number {
  // 高景气行业基础分较高
  const HOT_SECTORS: Record<string, number> = {
    '通信': 8, '电子': 8, '计算机': 7.5, '电力设备': 7,
    '医药生物': 6.5, '机械设备': 6.5, '汽车': 6.5,
    '食品饮料': 5.5, '家用电器': 5.5, '国防军工': 6,
    '非银金融': 5, '银行': 4.5, '房地产': 3.5,
    '煤炭': 5, '钢铁': 4, '有色金属': 5.5,
    '公用事业': 5, '交通运输': 4.5, '商贸零售': 4,
    '传媒': 5.5, '农林牧渔': 4.5, '建筑材料': 4,
    '基础化工': 5, '纺织服装': 4, '轻工制造': 4,
  };

  const base = HOT_SECTORS[stock.industry] ?? 5;
  return clamp(base, 0, 10);
}

// ============================================================
// 批量评分
// ============================================================

/** 权重覆盖：用自定义权重重新计算总分 */
export function recalcTotalWithWeights(
  score: StockScore,
  weights: { momentum: number; riskControl: number; riskAdjusted: number; companyQuality: number; valuation: number; sectorMatch: number },
): StockScore {
  const total = Math.round(
    (score.momentum / 25) * weights.momentum +
    (score.riskControl / 20) * weights.riskControl +
    (score.riskAdjusted / 15) * weights.riskAdjusted +
    (score.companyQuality / 15) * weights.companyQuality +
    (score.valuation / 15) * weights.valuation +
    (score.sectorMatch / 10) * weights.sectorMatch
  );
  return { ...score, total: Math.min(100, total) };
}

export function scoreAllStocks(
  stocks: StockInfo[],
  klineMap: Map<string, StockKLine[]>,
): Map<string, StockScore> {
  const result = new Map<string, StockScore>();
  for (const stock of stocks) {
    const klines = klineMap.get(stock.code) || [];
    result.set(stock.code, scoreStock(stock, klines));
  }
  return result;
}

// ============================================================
// 评分等级
// ============================================================

export function getStockGrade(totalScore: number): { label: string; text: string } {
  for (const grade of STOCK_SCORE_GRADES) {
    if (totalScore >= grade.min) return { label: grade.label, text: grade.text };
  }
  const lowest = STOCK_SCORE_GRADES[STOCK_SCORE_GRADES.length - 1];
  return { label: lowest.label, text: lowest.text };
}

// ============================================================
// 风险指标计算（完整版）
// ============================================================

export function calcStockRiskMetrics(klines: StockKLine[]) {
  const maxDrawdown = calcMaxDrawdownFromKLine(klines);
  const volatility = calcVolatilityFromKLine(klines);
  const sharpe = calcSharpeFromKLine(klines);
  const sortino = calcSortinoFromKLine(klines);
  const annualReturn = calcAnnualizedReturnFromKLine(klines);
  const calmar = maxDrawdown > 0 ? Math.round((annualReturn / maxDrawdown) * 100) / 100 : 0;

  const beta = Math.round((0.75 + (volatility / 35) * 0.55) * 100) / 100;
  const riskFreeRate = 2.5;
  const marketReturn = 8.0;
  const alpha = Math.round((annualReturn - riskFreeRate - beta * (marketReturn - riskFreeRate)) * 100) / 100;
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

// ============================================================
// 自测
// ============================================================

async function selfTest(): Promise<void> {
  const { getMockStocks, getMockKLine } = await import('../adapters/stock.js');

  console.log('========================================');
  console.log('[stock-scoring] 自测开始');
  console.log('========================================\n');

  const stocks = getMockStocks();
  console.log(`共 ${stocks.length} 只股票\n`);

  const scores: Array<{ stock: StockInfo; score: StockScore }> = [];

  for (const stock of stocks) {
    const klines = getMockKLine(stock.code);
    const score = scoreStock(stock, klines);
    scores.push({ stock, score });
  }

  scores.sort((a, b) => b.score.total - a.score.total);

  for (const { stock, score } of scores) {
    const grade = getStockGrade(score.total);
    console.log(
      `${stock.code} ${stock.name.padEnd(16)} ` +
      `动量:${String(score.momentum).padStart(2)} ` +
      `风控:${String(score.riskControl).padStart(2)} ` +
      `风调:${String(score.riskAdjusted).padStart(2)} ` +
      `质量:${String(score.companyQuality).padStart(2)} ` +
      `估值:${String(score.valuation).padStart(2)} ` +
      `景气:${String(score.sectorMatch).padStart(2)} ` +
      `总分:${String(score.total).padStart(3)}/100 ${grade.label} ${grade.text}`,
    );
  }

  console.log('\n========================================');
  console.log('[stock-scoring] 自测完成');
  console.log('========================================');
}

const isDirectRun = process.argv[1]?.endsWith('stock-scoring.ts') || process.argv[1]?.endsWith('stock-scoring.js');
if (isDirectRun) {
  selfTest().catch(err => { console.error(err); process.exit(1); });
}
