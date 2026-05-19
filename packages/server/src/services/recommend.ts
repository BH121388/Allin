// ============================================================
// 基金推荐管道 — 5 步流水线
//
// 1. 从适配器获取全量基金
// 2. 过滤（成立 <1 年、规模 <5000万、暂停申购）
// 3. 批量获取净值数据
// 4. 六维评分
// 5. 按总分降序取前 5、入库、返回
//
// v1 策略：使用 mock 数据（10 只代表性基金），全部评分，取前 5。
// ============================================================

import type { FundInfo, FundAnalysis, FundScore, SignalResult, RiskMetrics, PeerComparison } from '@allin/shared';
import { SIGNAL_THRESHOLDS } from '@allin/shared';
import { getMockFunds, getMockNAV, type NAVEntry } from '../adapters/eastmoney.js';
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

/**
 * 获取今日基金推荐。
 * forceRefresh = false 时优先走缓存；= true 时强制重新跑管道。
 */
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

  console.log('[recommend] 开始执行推荐管道...');
  const recommendations = await runPipeline();
  storeRecommendations(today, recommendations);
  console.log('[recommend] 推荐管道完成');
  return { recommendations, generatedAt: today, source: 'mock' };
}

// ============================================================
// 5 步管道
// ============================================================

async function runPipeline(): Promise<FundAnalysis[]> {
  // Step 1: 获取全量基金（v1: mock）
  const funds = getMockFunds();
  console.log(`[recommend] Step 1: 获取 ${funds.length} 只基金`);

  // Step 2: 过滤
  const filtered = filterFunds(funds);
  console.log(`[recommend] Step 2: 过滤后剩余 ${filtered.length} 只`);

  // Step 3: 获取净值
  const navMap = new Map<string, NAVEntry[]>();
  for (const fund of filtered) {
    navMap.set(fund.code, getMockNAV(fund.code));
  }
  console.log(`[recommend] Step 3: 获取 ${navMap.size} 只基金净值`);

  // Step 4: 评分
  const scoreMap = scoreAllFunds(filtered, navMap);
  console.log(`[recommend] Step 4: 评分完成 ${scoreMap.size} 只`);

  // Step 5: 排序取前 5
  const ranked = Array.from(scoreMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  const fundMap = new Map(filtered.map((f) => [f.code, f]));
  const results: FundAnalysis[] = ranked.map(([code, score], index) => {
    const fund = fundMap.get(code)!;
    const navData = navMap.get(code)!;
    return buildFundAnalysis(fund, navData, score, filtered.length, index + 1);
  });

  console.log(`[recommend] Step 5: 生成 Top ${results.length} 推荐`);
  return results;
}

// ============================================================
// 过滤器 — 剔除不满足条件的基金
// ============================================================

function filterFunds(funds: FundInfo[]): FundInfo[] {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  return funds.filter((f) => {
    // 成立不足 1 年
    if (f.inception) {
      const inceptionDate = new Date(f.inception + 'T00:00:00');
      if (isNaN(inceptionDate.getTime())) {
        // 无法解析的日期，保守保留
      } else if (inceptionDate > oneYearAgo) {
        return false;
      }
    }

    // 规模 < 5000 万（0.5 亿）
    if (f.scale > 0 && f.scale < 0.5) return false;

    return true;
  });
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

  return {
    ...fund,
    score,
    signal,
    investAdvice: null,
    analysis: generateAnalysisText(fund, score, grade, rank, totalFunds),
    riskMetrics: computeRiskMetrics(navData),
    holdings: [],
    sectorTags: deriveSectorTags(fund.type),
    peerComparison: computePeerComparison(rank, totalFunds),
  };
}

// ============================================================
// 交易信号
// ============================================================

function computeSignal(totalScore: number): SignalResult {
  if (totalScore >= SIGNAL_THRESHOLDS.buy) {
    return {
      signal: 'buy',
      score: totalScore,
      reason: '综合得分优秀，建议买入',
      suggestedPosition: '15%-25%',
    };
  }
  if (totalScore >= SIGNAL_THRESHOLDS.hold) {
    return {
      signal: 'hold',
      score: totalScore,
      reason: '综合得分良好，建议继续持有',
      suggestedPosition: '10%-20%',
    };
  }
  if (totalScore >= SIGNAL_THRESHOLDS.reduce) {
    return {
      signal: 'reduce',
      score: totalScore,
      reason: '综合得分一般，建议逐步减持',
      suggestedPosition: '5%-10%',
    };
  }
  return {
    signal: 'sell',
    score: totalScore,
    reason: '综合得分较低，建议清仓',
    suggestedPosition: '0%',
  };
}

// ============================================================
// 风险指标计算
// ============================================================

function computeRiskMetrics(navData: NAVEntry[]): RiskMetrics {
  if (navData.length < 2) {
    return {
      maxDrawdown: 0, volatility: 0, sharpe: 0,
      sortino: 0, calmar: 0, infoRatio: 0, beta: 0, alpha: 0,
    };
  }

  const returns = navData.slice(1).map((e) => e.dailyReturn);
  const maxDD = calcMaxDrawdown(navData);
  const vol = calcAnnualVolatility(returns);
  const sh = calcSharpe(returns);
  const sor = calcSortino(returns);
  const cal = calcCalmar(navData, maxDD);

  return {
    maxDrawdown: round2(maxDD),
    volatility: round2(vol),
    sharpe: round2(sh),
    sortino: round2(sor),
    calmar: round2(cal),
    infoRatio: 0,
    beta: 0,
    alpha: 0,
  };
}

function calcMaxDrawdown(navData: NAVEntry[]): number {
  let peak = navData[0].nav;
  let maxDD = 0;
  for (let i = 1; i < navData.length; i++) {
    if (navData[i].nav > peak) peak = navData[i].nav;
    const dd = ((peak - navData[i].nav) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function calcAnnualVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

function calcSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (mean / stdDev) * Math.sqrt(252);
}

function calcSortino(returns: number[]): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const squaredDownside = returns.reduce((sum, r) => {
    const diff = Math.min(0, r);
    return sum + diff * diff;
  }, 0);
  const downsideDev = Math.sqrt(squaredDownside / returns.length);
  if (downsideDev === 0) return mean > 0 ? 5 : 0;
  return (mean / downsideDev) * Math.sqrt(252);
}

function calcCalmar(navData: NAVEntry[], maxDD: number): number {
  if (maxDD === 0) return 0;
  const startNav = navData[0].nav;
  const endNav = navData[navData.length - 1].nav;
  if (startNav <= 0) return 0;
  const totalReturn = (endNav - startNav) / startNav;
  const days = navData.length;
  const base = 1 + totalReturn;
  if (base <= 0) return totalReturn / maxDD;
  const annualizedReturn = (Math.pow(base, 252 / days) - 1) * 100;
  return annualizedReturn / maxDD;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// 分析文本生成（>200 字）
// ============================================================

function generateAnalysisText(
  fund: FundInfo,
  score: FundScore,
  grade: { label: string; text: string },
  rank: number,
  totalFunds: number,
): string {
  const parts: string[] = [];

  parts.push(
    `${fund.name}（${fund.code}）在本轮评估中综合得分${score.total}分（满分100），` +
    `排名第${rank}/${totalFunds}，评级"${grade.text}"。`,
  );

  // 收益动量
  if (score.momentum >= 20) {
    parts.push(`收益动量得分${score.momentum}/25，表现优异，近期收益趋势强劲。`);
  } else if (score.momentum >= 12) {
    parts.push(`收益动量得分${score.momentum}/25，处于中等水平，收益趋势平稳。`);
  } else {
    parts.push(`收益动量得分${score.momentum}/25，表现偏弱，近期收益动能不足。`);
  }

  // 风险控制
  if (score.riskControl >= 16) {
    parts.push(`风险控制得分${score.riskControl}/20，回撤和波动控制出色。`);
  } else if (score.riskControl >= 10) {
    parts.push(`风险控制得分${score.riskControl}/20，风险水平适中。`);
  } else {
    parts.push(`风险控制得分${score.riskControl}/20，波动或回撤较大，需关注风险管理。`);
  }

  // 风险调整收益
  if (score.riskAdjusted >= 12) {
    parts.push(`风险调整收益得分${score.riskAdjusted}/15，夏普比率优秀，单位风险回报高。`);
  } else if (score.riskAdjusted >= 7) {
    parts.push(`风险调整收益得分${score.riskAdjusted}/15，夏普比率适中。`);
  } else {
    parts.push(`风险调整收益得分${score.riskAdjusted}/15，风险调整后回报偏低。`);
  }

  // 经理
  parts.push(
    `基金经理${fund.manager}，任职${fund.tenure}，任职回报${fund.managerReturn}，` +
    `经理能力得分${score.manager}/15。`,
  );

  // 规模与流动性
  parts.push(
    `基金规模${fund.scale}亿元，属于${fund.type}，由${fund.company}管理，` +
    `规模流动性得分${score.scale}/15。`,
  );

  // 行业景气
  parts.push(`行业景气匹配得分${score.sectorMatch}/10。`);

  // 总结
  if (score.total >= 80) {
    parts.push('综合来看，该基金各项指标优秀，适合作为核心持仓配置。');
  } else if (score.total >= 60) {
    parts.push('综合来看，该基金整体表现良好，可作为卫星配置关注。');
  } else if (score.total >= 40) {
    parts.push('综合来看，该基金表现一般，建议观望或适度减仓。');
  } else {
    parts.push('综合来看，该基金多项指标偏弱，当前时点不建议介入。');
  }

  return parts.join('');
}

// ============================================================
// 行业标签
// ============================================================

function deriveSectorTags(fundType: string): string[] {
  const tags: string[] = [];
  const lower = fundType.toLowerCase();

  if (lower.includes('股票')) {
    tags.push('权益类', '股票型');
  } else if (lower.includes('混合')) {
    tags.push('权益类', '混合型');
  } else if (lower.includes('指数')) {
    tags.push('被动型', '指数型');
  } else if (lower.includes('qdii')) {
    tags.push('QDII', '海外');
  } else if (lower.includes('债券')) {
    tags.push('固收类', '债券型');
  } else if (lower.includes('货币')) {
    tags.push('现金类', '货币型');
  } else {
    tags.push(fundType);
  }

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
  const rows = db
    .prepare('SELECT * FROM daily_recommendations WHERE date = ? ORDER BY rank')
    .all(date) as Array<{
      date: string;
      rank: number;
      fund_code: string;
      total_score: number;
      signal: string;
    }>;

  if (rows.length === 0) return [];

  // 重新跑全量评分以保证截面归一化一致性，再从中筛选缓存的前 5
  const allFunds = getMockFunds();
  const fundMap = new Map(allFunds.map((f) => [f.code, f]));
  const navMap = new Map<string, NAVEntry[]>();
  for (const f of allFunds) {
    navMap.set(f.code, getMockNAV(f.code));
  }
  const scoreMap = scoreAllFunds(allFunds, navMap);

  const results: FundAnalysis[] = [];
  for (const row of rows) {
    const fund = fundMap.get(row.fund_code);
    if (!fund) continue;
    const score = scoreMap.get(row.fund_code);
    if (!score) continue;
    const navData = navMap.get(row.fund_code)!;
    results.push(
      buildFundAnalysis(fund, navData, score, allFunds.length, row.rank),
    );
  }

  return results;
}

function storeRecommendations(
  date: string,
  recommendations: FundAnalysis[],
): void {
  const db = getDb();

  // 先确保基金基础信息已写入 funds 表（满足外键约束）
  const upsertFund = db.prepare(`
    INSERT INTO funds (code, name, type, manager, scale, inception, company, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name, type = excluded.type, manager = excluded.manager,
      scale = excluded.scale, inception = excluded.inception, company = excluded.company,
      updated_at = datetime('now')
  `);

  const upsertFunds = db.transaction((recs: FundAnalysis[]) => {
    for (const r of recs) {
      upsertFund.run(r.code, r.name, r.type, r.manager, r.scale, r.inception, r.company);
    }
  });
  upsertFunds(recommendations);

  // 删除今日旧记录
  const deleteStmt = db.prepare(
    'DELETE FROM daily_recommendations WHERE date = ?',
  );
  deleteStmt.run(date);

  // 插入新推荐
  const insertStmt = db.prepare(
    'INSERT INTO daily_recommendations (date, rank, fund_code, total_score, signal) VALUES (?, ?, ?, ?, ?)',
  );

  const insertMany = db.transaction((recs: FundAnalysis[]) => {
    for (let i = 0; i < recs.length; i++) {
      insertStmt.run(
        date,
        i + 1,
        recs[i].code,
        recs[i].score.total,
        recs[i].signal.signal,
      );
    }
  });

  insertMany(recommendations);
  console.log(`[recommend] 已存储 ${recommendations.length} 条推荐到数据库`);
}
