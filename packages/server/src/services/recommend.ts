// ============================================================
// 短期动量推荐管道 — 每日 Top 10
//
// 策略重心：近 5-15 日收益动量占 70%，风险调整 15%，
// 技术趋势 10%，波动率惩罚 5%。附带买入/清仓时机。
// ============================================================

import type { FundInfo, FundAnalysis, FundScore, SignalResult, RiskMetrics, PeerComparison, TopHolding } from '@allin/shared';
import { SIGNAL_THRESHOLDS } from '@allin/shared';
import { getMockFunds, getMockNAV, fetchFundDetail, type NAVEntry } from '../adapters/eastmoney.js';
import { scoreAllFunds, getGrade } from './scoring.js';
import { getDb } from '../db/index.js';

// ============================================================
// 公共接口
// ============================================================

export interface DailyRecommendations {
  recommendations: FundAnalysis[];
  generatedAt: string;
  source: string;
}

export async function getDailyRecommendations(
  forceRefresh = false,
): Promise<DailyRecommendations> {
  const today = new Date().toISOString().split('T')[0];

  if (!forceRefresh) {
    const cached = readCachedRecommendations(today);
    if (cached.length > 0) {
      console.log(`[recommend] 返回缓存推荐（${cached.length} 只基金）`);
      return { recommendations: cached, generatedAt: today, source: 'cache' };
    }
  }

  console.log('[recommend] 开始执行短期动量推荐管道...');
  const recommendations = await runPipeline();
  storeRecommendations(today, recommendations);
  console.log(`[recommend] 推荐管道完成，输出 ${recommendations.length} 只基金`);
  return { recommendations, generatedAt: today, source: 'live' };
}

// ============================================================
// 短期动量管道
// ============================================================

async function runPipeline(): Promise<FundAnalysis[]> {
  // Step 1: 获取基金池
  const funds = getMockFunds();
  console.log(`[recommend] Step 1: 基金池 ${funds.length} 只`);

  // Step 2: 获取净值（优先真实 API，降级 mock）
  const navMap = new Map<string, NAVEntry[]>();
  for (const fund of funds) {
    let navData = getMockNAV(fund.code);
    try {
      const detail = await fetchFundDetail(fund.code);
      if (detail && detail.navHistory.length > 0) {
        navData = detail.navHistory;
      }
    } catch {
      // 降级
    }
    navMap.set(fund.code, navData);
  }
  console.log(`[recommend] Step 2: 净值获取完成 ${navMap.size} 只`);

  // Step 3: 短期动量评分（替代六维评分）
  const scoreMap = scoreShortTerm(funds, navMap);
  console.log(`[recommend] Step 3: 短期动量评分完成 ${scoreMap.size} 只`);

  // Step 4: 排序取前 10
  const ranked = Array.from(scoreMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  const fundMap = new Map(funds.map((f) => [f.code, f]));
  const results: FundAnalysis[] = ranked.map(([code, score], index) => {
    const fund = fundMap.get(code)!;
    const navData = navMap.get(code)!;
    return buildFundAnalysis(fund, navData, score, funds.length, index + 1);
  });

  return results;
}

// ============================================================
// 短期动量评分（满分 100）
//
// 权重分配：
//   - 5 日收益   35%  （短期爆发力）
//   - 15 日收益  35%  （半月趋势）
//   - 30 日收益  15%  （月度确认）
//   - 夏普比率   10%  （风险调整）
//   - 波动率惩罚  5%  （波动越小越好）
// ============================================================

function scoreShortTerm(
  funds: FundInfo[],
  navMap: Map<string, NAVEntry[]>,
): Map<string, FundScore> {
  const allMetrics: Array<{
    code: string;
    ret5d: number;
    ret15d: number;
    ret30d: number;
    sharpe: number;
    volatility: number;
  }> = [];

  for (const fund of funds) {
    const nav = navMap.get(fund.code) || [];
    const ret5d = calcReturnFrom(nav, 5);
    const ret15d = calcReturnFrom(nav, 15);
    const ret30d = calcReturnFrom(nav, 30);
    const sharpe = calcShortSharpe(nav);
    const volatility = calcVolatility(nav);
    allMetrics.push({ code: fund.code, ret5d, ret15d, ret30d, sharpe, volatility });
  }

  // 交叉归一化
  const ret5dVals = allMetrics.map(m => m.ret5d);
  const ret15dVals = allMetrics.map(m => m.ret15d);
  const ret30dVals = allMetrics.map(m => m.ret30d);
  const sharpeVals = allMetrics.map(m => m.sharpe);
  const volVals = allMetrics.map(m => m.volatility);

  const r5Min = Math.min(...ret5dVals), r5Max = Math.max(...ret5dVals);
  const r15Min = Math.min(...ret15dVals), r15Max = Math.max(...ret15dVals);
  const r30Min = Math.min(...ret30dVals), r30Max = Math.max(...ret30dVals);
  const shMin = Math.min(...sharpeVals), shMax = Math.max(...sharpeVals);
  const voMin = Math.min(...volVals), voMax = Math.max(...volVals);

  const result = new Map<string, FundScore>();

  for (const m of allMetrics) {
    // 各维度归一化到 0-100 再乘权重
    const s5 = norm(m.ret5d, r5Min, r5Max) * 35;
    const s15 = norm(m.ret15d, r15Min, r15Max) * 35;
    const s30 = norm(m.ret30d, r30Min, r30Max) * 15;
    const sSh = norm(m.sharpe, shMin, shMax) * 10;
    const sVo = (1 - norm(m.volatility, voMin, voMax)) * 5; // 波动率越低越好

    let total = Math.round(s5 + s15 + s30 + sSh + sVo);
    total = Math.max(0, Math.min(100, total));

    result.set(m.code, {
      momentum: Math.round(s5 + s15 + s30),
      riskControl: Math.round(sVo),
      riskAdjusted: Math.round(sSh),
      manager: 7,  // 短期不看重经理
      scale: 7,
      sectorMatch: 5,
      total,
    });
  }

  return result;
}

function norm(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/** 计算指定天数的区间收益率 (%) */
function calcReturnFrom(navData: NAVEntry[], days: number): number {
  if (navData.length < 2) return 0;
  const targetIdx = Math.max(0, navData.length - 1 - Math.min(days, navData.length - 1));
  const startNav = navData[targetIdx].nav;
  const endNav = navData[navData.length - 1].nav;
  if (startNav <= 0) return 0;
  return ((endNav - startNav) / startNav) * 100;
}

/** 简化夏普比率（基于日收益率） */
function calcShortSharpe(navData: NAVEntry[]): number {
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) {
    returns.push(navData[i].dailyReturn || 0);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  return std > 0 ? (mean / std) * Math.sqrt(252) : 0;
}

/** 年化波动率 (%) */
function calcVolatility(navData: NAVEntry[]): number {
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) {
    returns.push(navData[i].dailyReturn || 0);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

// ============================================================
// FundAnalysis 构建
// ============================================================

function buildFundAnalysis(
  fund: FundInfo,
  navData: NAVEntry[],
  score: FundScore,
  totalFunds: number,
  rank: number,
): FundAnalysis {
  const signal = computeSignal(score.total);
  const grade = getGrade(score.total);
  const timing = computeTiming(navData);

  return {
    ...fund,
    score,
    signal,
    investAdvice: null,
    analysis: generateShortTermText(fund, score, grade, rank, timing, navData),
    riskMetrics: computeRiskMetrics(navData),
    holdings: [],
    sectorTags: deriveSectorTags(fund.type),
    peerComparison: computePeerComparison(rank, totalFunds),
    currentNav: navData.length > 0 ? navData[navData.length - 1].nav : undefined,
    navDate: navData.length > 0 ? navData[navData.length - 1].date : undefined,
    ...timing,
  };
}

// ============================================================
// 买卖时机计算
// ============================================================

interface Timing {
  buyDate: string;
  sellDate: string;
  stopLoss: number;
  targetReturn: number;
}

function computeTiming(navData: NAVEntry[]): Timing {
  const today = new Date();

  // 买入日期：今天
  const buyDate = formatLocalDate(today);

  // 清仓日期：+14 个自然日（≈10 个交易日）
  const sell = new Date(today);
  sell.setDate(sell.getDate() + 14);
  const sellDate = formatLocalDate(sell);

  // 止损价：当前净值 × 0.95
  const currentNav = navData.length > 0 ? navData[navData.length - 1].nav : 1;
  const stopLoss = Math.round(currentNav * 0.95 * 10000) / 10000;

  // 目标收益率：基于近 15 日收益折半（保守估计）
  const ret15d = calcReturnFrom(navData, 15);
  const targetReturn = Math.round(Math.max(2, ret15d * 0.5) * 100) / 100;

  return { buyDate, sellDate, stopLoss, targetReturn };
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ============================================================
// 交易信号
// ============================================================

function computeSignal(totalScore: number): SignalResult {
  if (totalScore >= 80) {
    return { signal: 'buy', score: totalScore, reason: '短期动量强劲，建议立即买入', suggestedPosition: '15%-25%' };
  }
  if (totalScore >= 65) {
    return { signal: 'buy', score: totalScore, reason: '短期趋势良好，适合入场', suggestedPosition: '10%-20%' };
  }
  if (totalScore >= 50) {
    return { signal: 'hold', score: totalScore, reason: '短期动能一般，可小仓试探', suggestedPosition: '5%-10%' };
  }
  return { signal: 'reduce', score: totalScore, reason: '短期动能不足，暂不建议介入', suggestedPosition: '0%-5%' };
}

// ============================================================
// 风险指标
// ============================================================

function computeRiskMetrics(navData: NAVEntry[]): RiskMetrics {
  if (navData.length < 2) {
    return { maxDrawdown: 0, volatility: 0, sharpe: 0, sortino: 0, calmar: 0, infoRatio: 0, beta: 0, alpha: 0 };
  }
  const returns = navData.slice(1).map(e => e.dailyReturn);
  const maxDD = calcMaxDrawdown(navData);
  const vol = calcVolatility(navData);
  const sh = calcShortSharpe(navData);
  return {
    maxDrawdown: round2(maxDD),
    volatility: round2(vol),
    sharpe: round2(sh),
    sortino: 0, calmar: 0, infoRatio: 0, beta: 0, alpha: 0,
  };
}

function calcMaxDrawdown(navData: NAVEntry[]): number {
  let peak = navData[0]?.nav ?? 0;
  let maxDD = 0;
  for (const e of navData) {
    if (e.nav > peak) peak = e.nav;
    const dd = ((peak - e.nav) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// 短期分析文本
// ============================================================

function generateShortTermText(
  fund: FundInfo,
  score: FundScore,
  grade: { label: string; text: string },
  rank: number,
  timing: Timing,
  navData: NAVEntry[],
): string {
  const ret5d = calcReturnFrom(navData, 5);
  const ret15d = calcReturnFrom(navData, 15);
  const ret30d = calcReturnFrom(navData, 30);
  const currentNav = navData.length > 0 ? navData[navData.length - 1].nav.toFixed(4) : '--';

  const parts = [
    `${fund.name}（${fund.code}）短期动量评分${score.total}/100，排名第${rank}，评级"${grade.text}"。`,
    `当前净值 ${currentNav}，近5日收益 ${ret5d >= 0 ? '+' : ''}${ret5d.toFixed(2)}%，近15日收益 ${ret15d >= 0 ? '+' : ''}${ret15d.toFixed(2)}%，近30日收益 ${ret30d >= 0 ? '+' : ''}${ret30d.toFixed(2)}%。`,
    `建议买入日：${timing.buyDate}，目标清仓日：${timing.sellDate}（持有约10个交易日）。`,
    `止损价：${timing.stopLoss.toFixed(4)}（-5%），目标收益率：${timing.targetReturn >= 0 ? '+' : ''}${timing.targetReturn.toFixed(2)}%。`,
    `基金类型${fund.type}，由${fund.company}管理。`,
  ];

  if (score.total >= 80) {
    parts.push('短期爆发力极强，趋势明确，适合短线积极介入。');
  } else if (score.total >= 65) {
    parts.push('短期趋势向好，可适度参与，注意控制仓位。');
  } else if (score.total >= 50) {
    parts.push('短期动能尚可，建议小仓位试探，严格止盈止损。');
  } else {
    parts.push('短期动能偏弱，风险收益比不佳，建议观望。');
  }

  return parts.join('');
}

// ============================================================
// 行业标签
// ============================================================

function deriveSectorTags(fundType: string): string[] {
  const lower = fundType.toLowerCase();
  if (lower.includes('股票')) return ['权益类', '股票型'];
  if (lower.includes('混合')) return ['权益类', '混合型'];
  if (lower.includes('指数')) return ['被动型', '指数型'];
  if (lower.includes('qdii')) return ['QDII', '海外'];
  if (lower.includes('债券')) return ['固收类', '债券型'];
  if (lower.includes('货币')) return ['现金类', '货币型'];
  return [fundType];
}

// ============================================================
// 同业比较
// ============================================================

function computePeerComparison(rank: number, totalFunds: number): PeerComparison {
  return {
    rankPercentile: totalFunds > 0 ? Math.round((rank / totalFunds) * 100) : 50,
    totalPeers: totalFunds,
    categoryAvgReturn: 0,
    fundReturn: 0,
  };
}

// ============================================================
// 数据库操作
// ============================================================

function readCachedRecommendations(date: string): FundAnalysis[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM daily_recommendations WHERE date = ? ORDER BY rank').all(date) as Array<{
    date: string; rank: number; fund_code: string; total_score: number; signal: string;
  }>;
  if (rows.length === 0) return [];

  const allFunds = getMockFunds();
  const fundMap = new Map(allFunds.map(f => [f.code, f]));
  const navMap = new Map<string, NAVEntry[]>();
  for (const f of allFunds) navMap.set(f.code, getMockNAV(f.code));
  const scoreMap = scoreAllFunds(allFunds, navMap);

  const results: FundAnalysis[] = [];
  for (const row of rows) {
    const fund = fundMap.get(row.fund_code);
    if (!fund) continue;
    const score = scoreMap.get(row.fund_code);
    if (!score) continue;
    const navData = navMap.get(row.fund_code)!;
    results.push(buildFundAnalysis(fund, navData, score, allFunds.length, row.rank));
  }
  return results;
}

function storeRecommendations(date: string, recommendations: FundAnalysis[]): void {
  const db = getDb();

  const upsertFund = db.prepare(`
    INSERT INTO funds (code, name, type, manager, scale, inception, company, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name, type = excluded.type, manager = excluded.manager,
      scale = excluded.scale, inception = excluded.inception, company = excluded.company,
      updated_at = datetime('now')
  `);

  const upsertFunds = db.transaction((recs: FundAnalysis[]) => {
    for (const r of recs) upsertFund.run(r.code, r.name, r.type, r.manager, r.scale, r.inception, r.company);
  });
  upsertFunds(recommendations);

  db.prepare('DELETE FROM daily_recommendations WHERE date = ?').run(date);

  const insertStmt = db.prepare(
    'INSERT INTO daily_recommendations (date, rank, fund_code, total_score, signal) VALUES (?, ?, ?, ?, ?)',
  );
  const insertMany = db.transaction((recs: FundAnalysis[]) => {
    for (let i = 0; i < recs.length; i++) {
      insertStmt.run(date, i + 1, recs[i].code, recs[i].score.total, recs[i].signal.signal);
    }
  });
  insertMany(recommendations);
  console.log(`[recommend] 已存储 ${recommendations.length} 条推荐到数据库`);
}
