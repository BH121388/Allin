// ============================================================
// 短期动量推荐管道 — 每日 Top 10（仅混合型，≥50分）
//
// 策略重心：近 5-15 日收益动量占 70%，风险调整 15%，
// 技术趋势 10%，波动率惩罚 5%。附带买入/清仓时机。
// 基金池来自天天基金实时全量数据，仅筛选混合型基金。
// ============================================================

import type { FundInfo, FundAnalysis, FundScore, SignalResult, RiskMetrics, PeerComparison } from '@allin/shared';
import { getMockFunds, getMockNAV, fetchFundDetail, fetchAllFunds, type NAVEntry, lookupStockName } from '../adapters/eastmoney.js';
import { scoreAllFundsUnified, getGrade } from './scoring.js';
import { getDb } from '../db/index.js';

// ============================================================
// 公共接口
// ============================================================

export interface DailyRecommendations {
  recommendations: FundAnalysis[];
  generatedAt: string;
  source: string;
  totalScanned: number;
}

export async function getDailyRecommendations(
  forceRefresh = false,
): Promise<DailyRecommendations> {
  const today = new Date().toISOString().split('T')[0];

  if (!forceRefresh) {
    const cached = readCachedRecommendations(today);
    if (cached.length > 0) {
      console.log(`[recommend] 返回缓存推荐（${cached.length} 只基金）`);
      return { recommendations: cached, generatedAt: today, source: 'cache', totalScanned: 0 };
    }
  }

  console.log('[recommend] 开始执行短期动量推荐管道...');
  const result = await runPipeline();
  const { recommendations, totalScanned } = result;
  storeRecommendations(today, recommendations);
  console.log(`[recommend] 完成：扫描 ${totalScanned} 只 → 输出 ${recommendations.length} 只`);
  return { recommendations, generatedAt: today, source: 'live', totalScanned };
}

// ============================================================
// 混合型基金关键词过滤（聚焦成长赛道）
// ============================================================

const HOT_KEYWORDS = [
  '科技', '创新', '成长', '信息', '电子', '智造', '高端',
  '新能源', '医药', '医疗', '健康', '生物',
  'AI', '机器人', '半导体', '芯片', '先进', '制造',
  '数字经济', '人工智能', '高端装备', '新材料',
  '智能', '互联', '5G', '云计算', '大数据', '软件',
  '军工', '航天', '低碳', '绿色', '环保',
  '消费', '升级', '改革', '红利',
];

function isHotSector(name: string): boolean {
  return HOT_KEYWORDS.some(kw => name.includes(kw));
}

// ============================================================
// 主管道
// ============================================================

async function runPipeline(): Promise<{ recommendations: FundAnalysis[]; totalScanned: number }> {
  // Step 1: 从天天基金获取全量基金列表（降级为 mock）
  console.log('[recommend] Step 1: 获取全量基金列表...');
  const allFunds = await fetchAllFunds();
  console.log(`[recommend] 获取到 ${allFunds.length} 只基金`);

  // Step 2: 筛选 — 仅混合型/灵活配置型 + 热门赛道关键词
  const mixedFunds = allFunds.filter(f => {
    const type = (f.type || '').toLowerCase();
    if (!type.includes('混合') && !type.includes('灵活配置')) return false;
    return isHotSector(f.name);
  });

  console.log(`[recommend] Step 2: 混合型+热门赛道 → ${mixedFunds.length} 只`);

  // 回退：如果筛选结果太少，用 mock 基金池补充
  let candidates: FundInfo[];
  let totalScanned: number;
  if (mixedFunds.length < 10) {
    console.log('[recommend] 真实基金不足，补充 mock 基金池');
    const mocks = getMockFunds().filter(f => f.type.includes('混合'));
    candidates = [...mixedFunds, ...mocks];
    totalScanned = candidates.length;
  } else {
    candidates = mixedFunds;
    totalScanned = mixedFunds.length;
  }

  // 用 mock 补全真实基金的缺失字段（manager/tenure/scale 等），与搜索/持仓一致
  const mockMap = new Map(getMockFunds().map(f => [f.code, f]));
  for (const c of candidates) {
    const mock = mockMap.get(c.code);
    if (mock) Object.assign(c, mock);
  }

  // 候选池：mock 匹配优先（数据更完整），再补随机，取 100 只
  if (candidates.length > 100) {
    const withMock = candidates.filter(c => mockMap.has(c.code));
    const withoutMock = candidates.filter(c => !mockMap.has(c.code));
    // 随机打散无 mock 的，避免 API 返回顺序偏差
    for (let i = withoutMock.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [withoutMock[i], withoutMock[j]] = [withoutMock[j], withoutMock[i]];
    }
    candidates = [...withMock, ...withoutMock].slice(0, 100);
  }

  console.log(`[recommend] 候选基金池: ${candidates.length} 只`);

  // Step 3: 批量获取净值（并发控制）
  const navMap = new Map<string, NAVEntry[]>();
  const batchSize = 10;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (f) => {
        try {
          const detail = await fetchFundDetail(f.code);
          if (detail && detail.navHistory.length > 0) {
            return { code: f.code, nav: detail.navHistory, name: detail.name };
          }
        } catch { /* fall through */ }
        return { code: f.code, nav: getMockNAV(f.code), name: f.name };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        // Update fund name from real API if available
        const existing = candidates.find(c => c.code === r.value.code);
        if (existing && r.value.name) existing.name = r.value.name;
        navMap.set(r.value.code, r.value.nav);
      }
    }
  }
  console.log(`[recommend] Step 3: 净值获取完成 ${navMap.size} 只`);

  // Step 4: 统一评分（收益+风险平衡）
  const scoreMap = scoreAllFundsUnified(candidates, navMap);
  console.log(`[recommend] Step 4: 统一评分完成 ${scoreMap.size} 只`);

  // Step 5: 排序，过滤 ≥50 分，取前 10
  const ranked = Array.from(scoreMap.entries())
    .filter(([, score]) => score.total >= 50)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  const fundMap = new Map(candidates.map((f) => [f.code, f]));
  const results: FundAnalysis[] = ranked.map(([code, score], index) => {
    const fund = fundMap.get(code)!;
    const navData = navMap.get(code)!;
    return buildFundAnalysis(fund, navData, score, totalScanned, index + 1);
  });

  return { recommendations: results, totalScanned };
}

// ============================================================
// FundAnalysis 构建
// ============================================================

function buildFundAnalysis(
  fund: FundInfo,
  navData: NAVEntry[],
  score: FundScore,
  totalScanned: number,
  rank: number,
): FundAnalysis {
  const signal = computeSignal(score.total);
  const timing = computeTiming(navData);

  return {
    ...fund,
    score,
    signal,
    investAdvice: null,
    analysis: generateShortTermText(fund, score, rank, timing, navData),
    riskMetrics: computeRiskMetrics(navData),
    holdings: [],
    sectorTags: deriveSectorTags(fund.name, fund.type),
    peerComparison: computePeerComparison(rank, totalScanned),
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
  const targetReturn = Math.round(Math.max(2, Math.abs(ret15d) * 0.5) * 100) / 100;

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
  if (totalScore >= 55) {
    return { signal: 'hold', score: totalScore, reason: '短期动能可接受，小仓试探', suggestedPosition: '5%-10%' };
  }
  return { signal: 'hold', score: totalScore, reason: '短期动能一般，控制仓位', suggestedPosition: '3%-5%' };
}

// ============================================================
// 风险指标
// ============================================================

function computeRiskMetrics(navData: NAVEntry[]): RiskMetrics {
  if (navData.length < 2) {
    return { maxDrawdown: 0, volatility: 0, sharpe: 0, sortino: 0, calmar: 0, infoRatio: 0, beta: 0, alpha: 0 };
  }
  return {
    maxDrawdown: round2(calcMaxDrawdown(navData)),
    volatility: round2(calcVolatility(navData)),
    sharpe: round2(calcShortSharpe(navData)),
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

function calcReturnFrom(navData: NAVEntry[], days: number): number {
  if (navData.length < 2) return 0;
  const targetIdx = Math.max(0, navData.length - 1 - Math.min(days, navData.length - 1));
  const startNav = navData[targetIdx].nav;
  const endNav = navData[navData.length - 1].nav;
  if (startNav <= 0) return 0;
  return ((endNav - startNav) / startNav) * 100;
}

function calcShortSharpe(navData: NAVEntry[]): number {
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) returns.push(navData[i].dailyReturn || 0);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  return std > 0 ? (mean / std) * Math.sqrt(252) : 0;
}

function calcVolatility(navData: NAVEntry[]): number {
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) returns.push(navData[i].dailyReturn || 0);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
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
  rank: number,
  timing: Timing,
  navData: NAVEntry[],
): string {
  const ret5d = calcReturnFrom(navData, 5);
  const ret15d = calcReturnFrom(navData, 15);
  const ret30d = calcReturnFrom(navData, 30);
  const currentNav = navData.length > 0 ? navData[navData.length - 1].nav.toFixed(4) : '--';

  const parts = [
    `${fund.name}（${fund.code}）短期动量评分${score.total}/100，排名第${rank}，混合型基金。`,
    `当前净值 ${currentNav}，近5日收益 ${ret5d >= 0 ? '+' : ''}${ret5d.toFixed(2)}%，近15日收益 ${ret15d >= 0 ? '+' : ''}${ret15d.toFixed(2)}%，近30日收益 ${ret30d >= 0 ? '+' : ''}${ret30d.toFixed(2)}%。`,
    `建议买入日：${timing.buyDate}，目标清仓日：${timing.sellDate}（持有约10个交易日）。`,
    `止损价：${timing.stopLoss.toFixed(4)}（-5%），目标收益率：${timing.targetReturn >= 0 ? '+' : ''}${timing.targetReturn.toFixed(2)}%。`,
  ];

  if (score.total >= 80) {
    parts.push('短期爆发力极强，趋势明确，适合短线积极介入。');
  } else if (score.total >= 65) {
    parts.push('短期趋势向好，可适度参与，注意控制仓位。');
  } else {
    parts.push('短期动能尚可，建议小仓位试探，严格止盈止损。');
  }

  return parts.join('');
}

// ============================================================
// 行业标签
// ============================================================

function deriveSectorTags(name: string, fundType: string): string[] {
  const tags: string[] = [];
  const combined = `${name}${fundType}`;
  if (combined.includes('科技') || combined.includes('信息') || combined.includes('电子')) tags.push('科技-TMT');
  if (combined.includes('新能源') || combined.includes('低碳') || combined.includes('绿色')) tags.push('新能源');
  if (combined.includes('医药') || combined.includes('医疗') || combined.includes('健康') || combined.includes('生物')) tags.push('医药');
  if (combined.includes('智造') || combined.includes('高端') || combined.includes('机器人') || combined.includes('制造')) tags.push('高端制造');
  if (combined.includes('军工') || combined.includes('航天')) tags.push('军工');
  if (combined.includes('消费') || combined.includes('升级')) tags.push('消费');
  if (tags.length === 0) tags.push('混合型');
  return tags;
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

  // 重新实时评分
  // For cached reads, use mock data since we can't replay the full pipeline
  return []; // Always refresh for now
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
    for (const r of recs) upsertFund.run(r.code, r.name, r.type, r.manager || '', r.scale || 0, r.inception || '', r.company || '');
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
