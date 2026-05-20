// ============================================================
// 六维评分引擎
//
// 对基金从六个维度进行评分（总分 0-100）：
//   1. 收益动量 (momentum)     0-25
//   2. 风险控制 (riskControl)   0-20
//   3. 风险调整收益 (riskAdjusted) 0-15
//   4. 经理能力 (manager)       0-15
//   5. 规模流动性 (scale)       0-15
//   6. 行业景气匹配 (sectorMatch) 0-10
//
// 单只基金评分使用固定参考值归一化；
// 批量评分使用全市场截面 min-max 归一化（<3 只时回退为固定参考值）。
// ============================================================

import type { FundInfo, FundScore } from '@allin/shared';
import { SCORE_GRADES } from '@allin/shared';
import type { NAVEntry } from '../adapters/eastmoney.js';

// ============================================================
// 内部类型
// ============================================================

interface RawMetrics {
  ret1m: number;
  ret3m: number;
  ret6m: number;
  ret1y: number;
  retYtd: number;
  rawMomentum: number;
  maxDrawdown: number;
  annualVolatility: number;
  sharpe: number;
  managerReturnPct: number;
  managerYears: number;
}

// ============================================================
// 收益动量子项权重（维度内部分配）
// ============================================================

const MOMENTUM_WEIGHTS = {
  ret1m: 0.25,
  ret3m: 0.25,
  ret6m: 0.20,
  ret1y: 0.15,
  retYtd: 0.15,
} as const;

// ============================================================
// 固定参考值 — 单只基金或少量基金时用于归一化
// ============================================================

const FIXED_REF = {
  /** 加权动量收益，-15% → 0 分，+35% → 满分 */
  momentum: { min: -15, max: 35 },
  /** 最大回撤，3% → 满分，35% → 0 分（反向） */
  maxDrawdown: { min: 3, max: 35 },
  /** 年化波动率，8% → 满分，35% → 0 分（反向） */
  volatility: { min: 8, max: 35 },
  /** 夏普比率，-1 → 0 分，3 → 满分 */
  sharpe: { min: -1, max: 3 },
};

// ============================================================
// 行业景气匹配基础分（按基金类型）
// ============================================================

const SECTOR_BASE: Record<string, number> = {
  '股票型': 7.5,
  '偏股混合型': 6.5,
  '灵活配置型': 5.5,
  '指数型': 7.5,
  'QDII': 5.5,
  '债券型': 4.5,
  '货币型': 3.5,
  '混合型': 6.5,
  'ETF': 7.5,
};

// ============================================================
// 辅助函数 — 日期与查找
// ============================================================

/**
 * 在按日期升序排列的净值列表中，找到最接近 targetDate 的条目索引。
 * targetDate 是 Date 对象（本地时间）。
 */
function findClosestIndex(navData: NAVEntry[], targetDate: Date): number {
  const targetTime = targetDate.getTime();
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < navData.length; i++) {
    const diff = Math.abs(new Date(navData[i].date + 'T00:00:00').getTime() - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}

/**
 * 计算指定回溯天数的区间收益率（%）。
 * lookbackDays = 30 → 近 1 月，90 → 近 3 月，依此类推。
 */
function calcReturn(navData: NAVEntry[], lookbackDays: number): number {
  if (navData.length < 2) return 0;

  const lastDate = new Date(navData[navData.length - 1].date + 'T00:00:00');
  const targetDate = new Date(lastDate);
  targetDate.setDate(targetDate.getDate() - lookbackDays);

  const startIdx = findClosestIndex(navData, targetDate);
  // 确保起点在终点之前
  if (startIdx >= navData.length - 1) return 0;

  const startNav = navData[startIdx].nav;
  const endNav = navData[navData.length - 1].nav;
  if (startNav <= 0) return 0;

  return ((endNav - startNav) / startNav) * 100;
}

/**
 * 计算年内收益率（%）。
 */
function calcYtdReturn(navData: NAVEntry[]): number {
  if (navData.length < 2) return 0;

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  // 如果当年第一天还没有净值，取该年第一条
  const startIdx = findClosestIndex(navData, yearStart);
  if (startIdx >= navData.length - 1) return 0;

  const startNav = navData[startIdx].nav;
  const endNav = navData[navData.length - 1].nav;
  if (startNav <= 0) return 0;

  return ((endNav - startNav) / startNav) * 100;
}

// ============================================================
// 辅助函数 — 风险指标计算
// ============================================================

/**
 * 计算历史最大回撤（%）。
 */
export function calcMaxDrawdown(navData: NAVEntry[]): number {
  if (navData.length < 2) return 0;

  let peak = navData[0].nav;
  let maxDD = 0;

  for (let i = 1; i < navData.length; i++) {
    if (navData[i].nav > peak) {
      peak = navData[i].nav;
    }
    const dd = ((peak - navData[i].nav) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  return maxDD;
}

/**
 * 计算年化波动率（%）。
 */
export function calcAnnualVolatility(navData: NAVEntry[]): number {
  const returns = navData.slice(1).map((e) => e.dailyReturn);
  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;

  return Math.sqrt(variance) * Math.sqrt(252);
}

/**
 * 计算夏普比率。
 */
export function calcSharpe(navData: NAVEntry[]): number {
  const returns = navData.slice(1).map((e) => e.dailyReturn);
  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;
  return (mean / stdDev) * Math.sqrt(252);
}

// ============================================================
// 辅助函数 — 经理字段解析
// ============================================================

/**
 * 解析任职返还字符串（如 "+125.50%" → 125.50）。
 */
function parseManagerReturn(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[+%]/g, '');
  const val = parseFloat(cleaned);
  return Number.isNaN(val) ? 0 : val;
}

/**
 * 解析任职年限字符串（如 "5年又211天" → 5.58 年）。
 */
function parseTenureYears(raw: string): number {
  if (!raw) return 0;
  const yearMatch = raw.match(/(\d+)年/);
  const dayMatch = raw.match(/(\d+)天/);
  const years = yearMatch ? parseInt(yearMatch[1], 10) : 0;
  const days = dayMatch ? parseInt(dayMatch[1], 10) : 0;
  return years + days / 365;
}

// ============================================================
// 辅助函数 — 归一化
// ============================================================

/**
 * 正向 min-max 归一化：值越大 → 分数越高。
 */
function normalizeForward(
  value: number,
  vMin: number,
  vMax: number,
  sMin: number,
  sMax: number,
): number {
  if (vMax <= vMin) return sMin;
  const clamped = Math.max(vMin, Math.min(vMax, value));
  return ((clamped - vMin) / (vMax - vMin)) * (sMax - sMin) + sMin;
}

/**
 * 反向 min-max 归一化：值越小 → 分数越高。
 */
function normalizeInverse(
  value: number,
  vMin: number,
  vMax: number,
  sMin: number,
  sMax: number,
): number {
  if (vMax <= vMin) return sMax;
  const clamped = Math.max(vMin, Math.min(vMax, value));
  return ((vMax - clamped) / (vMax - vMin)) * (sMax - sMin) + sMin;
}

// ============================================================
// 辅助函数 — 确定性哈希（用于行业景气随机扰动）
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

// ============================================================
// 核心 — 计算原始指标
// ============================================================

function computeRawMetrics(fund: FundInfo, navData: NAVEntry[]): RawMetrics {
  const ret1m = calcReturn(navData, 30);
  const ret3m = calcReturn(navData, 90);
  const ret6m = calcReturn(navData, 180);
  const ret1y = calcReturn(navData, 365);
  const retYtd = calcYtdReturn(navData);

  // 负收益不传入加权（钳位到 0 避免负贡献）
  const rawMomentum =
    MOMENTUM_WEIGHTS.ret1m * Math.max(0, ret1m) +
    MOMENTUM_WEIGHTS.ret3m * Math.max(0, ret3m) +
    MOMENTUM_WEIGHTS.ret6m * Math.max(0, ret6m) +
    MOMENTUM_WEIGHTS.ret1y * Math.max(0, ret1y) +
    MOMENTUM_WEIGHTS.retYtd * Math.max(0, retYtd);

  const maxDrawdown = calcMaxDrawdown(navData);
  const annualVolatility = calcAnnualVolatility(navData);
  const sharpe = calcSharpe(navData);

  const managerReturnPct = parseManagerReturn(fund.managerReturn);
  const managerYears = parseTenureYears(fund.tenure);

  return {
    ret1m,
    ret3m,
    ret6m,
    ret1y,
    retYtd,
    rawMomentum,
    maxDrawdown,
    annualVolatility,
    sharpe,
    managerReturnPct,
    managerYears,
  };
}

// ============================================================
// 归一化 — 使用固定参考值
// ============================================================

function normalizeWithFixedRef(raw: RawMetrics, fund: FundInfo, navData: NAVEntry[]): FundScore {
  const momentum = Math.round(
    normalizeForward(
      raw.rawMomentum,
      FIXED_REF.momentum.min,
      FIXED_REF.momentum.max,
      0,
      25,
    ),
  );

  // 风险控制：回撤 50% + 波动率 50%，先各自反向归一化
  const ddScore = normalizeInverse(
    raw.maxDrawdown,
    FIXED_REF.maxDrawdown.min,
    FIXED_REF.maxDrawdown.max,
    0,
    20,
  );
  const volScore = normalizeInverse(
    raw.annualVolatility,
    FIXED_REF.volatility.min,
    FIXED_REF.volatility.max,
    0,
    20,
  );
  const riskControl = Math.round(0.5 * ddScore + 0.5 * volScore);

  const riskAdjusted = Math.round(
    normalizeForward(
      raw.sharpe,
      FIXED_REF.sharpe.min,
      FIXED_REF.sharpe.max,
      0,
      15,
    ),
  );

  const manager = scoreManager(raw.managerReturnPct, raw.managerYears);
  const scale = scoreScale(fund.scale);
  const sectorMatch = scoreSectorMatch(fund);

  // 合并各维度
  let total = momentum + riskControl + riskAdjusted + manager + scale + sectorMatch;

  // 置信度调整：净值数据不足时整体打折
  const confidence = calcConfidence(navData.length);
  total = Math.round(total * confidence);

  return {
    momentum: Math.max(0, Math.min(25, momentum)),
    riskControl: Math.max(0, Math.min(20, riskControl)),
    riskAdjusted: Math.max(0, Math.min(15, riskAdjusted)),
    manager: Math.max(0, Math.min(15, manager)),
    scale: Math.max(0, Math.min(15, scale)),
    sectorMatch: Math.max(0, Math.min(10, sectorMatch)),
    total: Math.max(0, Math.min(100, total)),
  };
}

// ============================================================
// 归一化 — 使用全市场截面数据
// ============================================================

function normalizeWithUniverse(
  raws: Map<string, RawMetrics>,
  fundMap: Map<string, FundInfo>,
  navMap: Map<string, NAVEntry[]>,
): Map<string, FundScore> {
  // 收集原始值用于计算 min / max
  const momentumVals: number[] = [];
  const drawdownVals: number[] = [];
  const volatilityVals: number[] = [];
  const sharpeVals: number[] = [];

  for (const [, raw] of raws) {
    momentumVals.push(raw.rawMomentum);
    drawdownVals.push(raw.maxDrawdown);
    volatilityVals.push(raw.annualVolatility);
    sharpeVals.push(raw.sharpe);
  }

  const mMin = Math.min(...momentumVals);
  const mMax = Math.max(...momentumVals);
  const ddMin = Math.min(...drawdownVals);
  const ddMax = Math.max(...drawdownVals);
  const volMin = Math.min(...volatilityVals);
  const volMax = Math.max(...volatilityVals);
  const sMin = Math.min(...sharpeVals);
  const sMax = Math.max(...sharpeVals);

  const result = new Map<string, FundScore>();

  for (const [code, raw] of raws) {
    const fund = fundMap.get(code);
    const navData = navMap.get(code);
    if (!fund || !navData) continue;

    // 动量
    const momentum = Math.round(
      normalizeForward(raw.rawMomentum, mMin, mMax, 0, 25),
    );

    // 风险控制
    const ddScore = normalizeInverse(raw.maxDrawdown, ddMin, ddMax, 0, 20);
    const volScore = normalizeInverse(raw.annualVolatility, volMin, volMax, 0, 20);
    const riskControl = Math.round(0.5 * ddScore + 0.5 * volScore);

    // 风险调整收益
    const riskAdjusted = Math.round(
      normalizeForward(raw.sharpe, sMin, sMax, 0, 15),
    );

    // 以下三个维度不依赖截面比较
    const manager = scoreManager(raw.managerReturnPct, raw.managerYears);
    const scale = scoreScale(fund.scale);
    const sectorMatch = scoreSectorMatch(fund);

    let total =
      momentum + riskControl + riskAdjusted + manager + scale + sectorMatch;

    const confidence = calcConfidence(navData.length);
    total = Math.round(total * confidence);

    result.set(code, {
      momentum: clamp(momentum, 0, 25),
      riskControl: clamp(riskControl, 0, 20),
      riskAdjusted: clamp(riskAdjusted, 0, 15),
      manager: clamp(manager, 0, 15),
      scale: clamp(scale, 0, 15),
      sectorMatch: clamp(sectorMatch, 0, 10),
      total: clamp(total, 0, 100),
    });
  }

  return result;
}

// ============================================================
// 维度打分 — 经理能力 (0-15)
// ============================================================

function scoreManager(returnPct: number, years: number): number {
  // 任职回报子项 (0-7.5)
  let retScore: number;
  if (returnPct <= 0) {
    retScore = 0;
  } else if (returnPct >= 200) {
    retScore = 7.5;
  } else {
    retScore = (returnPct / 200) * 7.5;
  }

  // 任职年限子项 (0-7.5)，3-8 年最优
  let tenureScore: number;
  if (years <= 0) {
    tenureScore = 0;
  } else if (years < 3) {
    tenureScore = (years / 3) * 7.5;
  } else if (years <= 8) {
    tenureScore = 7.5;
  } else {
    // 超过 8 年缓慢下降
    tenureScore = Math.max(0, 7.5 - (years - 8) * 1.0);
  }

  return Math.round(retScore + tenureScore);
}

// ============================================================
// 维度打分 — 规模流动性 (0-15)
// ============================================================

function scoreScale(scale: number): number {
  // 规模未知，给保守分
  if (scale === 0) return 6;

  if (scale < 5) {
    return Math.round((scale / 5) * 15);
  }
  if (scale <= 30) {
    return 15;
  }
  // > 30 亿：分段线性衰减（收紧边界，惩罚大基金）
  // 30-80 亿: 15 → 12
  // 80-150 亿: 12 → 7
  // 150-300 亿: 7 → 2
  // > 300 亿: 最低 1
  if (scale <= 80) {
    return Math.round(15 - ((scale - 30) / 50) * 3);
  }
  if (scale <= 150) {
    return Math.round(12 - ((scale - 80) / 70) * 5);
  }
  if (scale <= 300) {
    return Math.round(7 - ((scale - 150) / 150) * 5);
  }
  return 1;
}

// ============================================================
// 维度打分 — 行业景气匹配 (0-10)
// ============================================================

function scoreSectorMatch(fund: FundInfo): number {
  const base = SECTOR_BASE[fund.type] ?? 5;
  // 基于基金代码的确定性扰动（-1, 0, 或 1）
  const jitter = (hashCode(fund.code + fund.type) % 3) - 1;
  return clamp(base + jitter, 0, 10);
}

// ============================================================
// 置信度调整
// ============================================================

function calcConfidence(entryCount: number): number {
  if (entryCount >= 60) return 1.0;
  if (entryCount >= 20) {
    return 0.7 + 0.3 * ((entryCount - 20) / 40);
  }
  if (entryCount >= 2) {
    return (entryCount / 20) * 0.7;
  }
  return 0;
}

// ============================================================
// 辅助 — 钳位
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// 公共导出函数
// ============================================================

/**
 * 对单只基金进行六维评分。
 * 使用固定参考值进行归一化。
 */
export function scoreFund(fund: FundInfo, navData: NAVEntry[]): FundScore {
  if (navData.length < 2) {
    return {
      momentum: 0,
      riskControl: 0,
      riskAdjusted: 0,
      manager: scoreManager(
        parseManagerReturn(fund.managerReturn),
        parseTenureYears(fund.tenure),
      ),
      scale: scoreScale(fund.scale),
      sectorMatch: scoreSectorMatch(fund),
      total: 0,
    };
  }

  const raw = computeRawMetrics(fund, navData);
  return normalizeWithFixedRef(raw, fund, navData);
}

/**
 * 批量评分，使用全市场截面 min-max 归一化。
 * 若基金数 < 3，回退为固定参考值归一化。
 */
export function scoreAllFunds(
  funds: FundInfo[],
  navMap: Map<string, NAVEntry[]>,
): Map<string, FundScore> {
  const result = new Map<string, FundScore>();

  if (funds.length < 3) {
    // 少量基金回退为固定参考值
    for (const fund of funds) {
      const navData = navMap.get(fund.code) ?? [];
      result.set(fund.code, scoreFund(fund, navData));
    }
    return result;
  }

  // 第一遍：收集原始指标
  const raws = new Map<string, RawMetrics>();
  const fundMap = new Map<string, FundInfo>();
  for (const fund of funds) {
    fundMap.set(fund.code, fund);
    const navData = navMap.get(fund.code) ?? [];
    if (navData.length < 2) continue;
    raws.set(fund.code, computeRawMetrics(fund, navData));
  }

  // 对没有足够净值数据的基金给 0 分
  for (const fund of funds) {
    if (!raws.has(fund.code)) {
      result.set(fund.code, {
        momentum: 0,
        riskControl: 0,
        riskAdjusted: 0,
        manager: scoreManager(
          parseManagerReturn(fund.managerReturn),
          parseTenureYears(fund.tenure),
        ),
        scale: scoreScale(fund.scale),
        sectorMatch: scoreSectorMatch(fund),
        total: 0,
      });
    }
  }

  // 第二遍：截面归一化
  const crossScores = normalizeWithUniverse(raws, fundMap, navMap);
  for (const [code, score] of crossScores) {
    result.set(code, score);
  }

  return result;
}

/**
 * 根据总分返回评分等级。
 */
export function getGrade(totalScore: number): { label: string; text: string } {
  for (const grade of SCORE_GRADES) {
    if (totalScore >= grade.min) {
      return { label: grade.label, text: grade.text };
    }
  }
  // 兜底：最低等级
  const lowest = SCORE_GRADES[SCORE_GRADES.length - 1];
  return { label: lowest.label, text: lowest.text };
}

// ============================================================
// 自测入口 — 直接执行此文件时运行
// ============================================================

async function selfTest(): Promise<void> {
  // 动态导入以避免循环依赖
  const { getMockFunds, getMockNAV } =
    await import('../adapters/eastmoney.js');

  console.log('========================================');
  console.log('[scoring] 自测开始');
  console.log('========================================\n');

  // --- 单只基金评分 ---
  const fund = getMockFunds()[0]; // 易方达蓝筹精选混合
  const nav = getMockNAV(fund.code);

  console.log(`--- 单只基金: ${fund.code} ${fund.name} ---`);
  console.log(`  类型: ${fund.type}`);
  console.log(`  经理: ${fund.manager} | 任职: ${fund.tenure} | 任职回报: ${fund.managerReturn}`);
  console.log(`  规模: ${fund.scale}亿 | 净值条目数: ${nav.length}`);
  console.log('');

  const score = scoreFund(fund, nav);
  const grade = getGrade(score.total);

  console.log('  六维评分结果:');
  console.log(`    收益动量 (momentum):     ${score.momentum}/25`);
  console.log(`    风险控制 (riskControl):   ${score.riskControl}/20`);
  console.log(`    风险调整 (riskAdjusted):  ${score.riskAdjusted}/15`);
  console.log(`    经理能力 (manager):       ${score.manager}/15`);
  console.log(`    规模流动性 (scale):       ${score.scale}/15`);
  console.log(`    行业景气 (sectorMatch):   ${score.sectorMatch}/10`);
  console.log(`    ─────────────────────────────`);
  console.log(`    综合得分 (total):         ${score.total}/100`);
  console.log(`    等级: ${grade.label} (${grade.text})`);

  // 校验总分
  const sum =
    score.momentum +
    score.riskControl +
    score.riskAdjusted +
    score.manager +
    score.scale +
    score.sectorMatch;
  console.log(`    维度加总: ${sum} (总分: ${score.total})`);

  console.log('');

  // --- 批量评分（全部 10 只 mock 基金）---
  console.log('--- 批量评分 (全部 mock 基金) ---');
  const allFunds = getMockFunds();
  const navMap = new Map<string, typeof nav>();
  for (const f of allFunds) {
    navMap.set(f.code, getMockNAV(f.code));
  }

  const allScores = scoreAllFunds(allFunds, navMap);
  console.log(`共 ${allScores.size} 只基金:\n`);

  // 按总分降序排列
  const ranked = Array.from(allScores.entries()).sort(
    (a, b) => b[1].total - a[1].total,
  );
  for (const [code, s] of ranked) {
    const f = allFunds.find((x) => x.code === code);
    const g = getGrade(s.total);
    console.log(
      `  ${code} ${(f?.name ?? '?').padEnd(24)} ${String(s.total).padStart(3)}/100 ${g.label} ${g.text}`,
    );
  }

  console.log('\n========================================');
  console.log('[scoring] 自测完成');
  console.log('========================================');
}

// 判断是否为直接运行
const isDirectRun =
  process.argv[1]?.endsWith('scoring.ts') ||
  process.argv[1]?.endsWith('scoring.js');

if (isDirectRun) {
  selfTest().catch((err) => {
    console.error('[scoring] 自测异常:', err);
    process.exit(1);
  });
}
