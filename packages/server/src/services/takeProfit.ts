// ============================================================
// 止盈规则引擎
//
// 根据基金类型匹配合适的止盈策略，并对当前持仓进行评估：
//
//   基金类型          目标收益      止盈方式
//   ─────────        ────────      ──────────────────────────
//   偏股 / 股票       8%-15%       分3批止盈，每上涨5%触发一批
//   混合 / 固收       4%-6%        到达目标后卖50%，剩余随涨随卖
//   行业ETF / 主题    15%-25%      动量止盈，跌破20日均线清仓
//   指数 / ETF        10%-20%      阶梯止盈，每涨10%卖1/3
//   其他              10%          固定止盈线
//
// 所有计算均为纯函数，无副作用。
// ============================================================

// ============================================================
// 类型
// ============================================================

export interface TakeProfitRule {
  /** 匹配的基金类型关键词 */
  fundType: string;
  /** 目标收益率区间 */
  targetReturn: { min: number; max: number };
  /** 止盈方法标识 */
  method: 'batch' | 'half_then_trail' | 'momentum' | 'ladder' | 'fixed';
  /** 中文描述 */
  description: string;
  /** 详细步骤（中文） */
  steps: string[];
}

export interface TakeProfitAction {
  /** 是否触发止盈 */
  shouldTakeProfit: boolean;
  /** 当前收益率（%） */
  currentReturn: number;
  /** 目标收益率（%） */
  targetReturn: number;
  /** 止盈方法标识 */
  method: string;
  /** 策略描述 */
  description: string;
  /** 建议保留比率（0-1），0 表示全部卖出 */
  remainingRatio: number;
  /** 本次应执行的具体操作 */
  action: string;
}

// ============================================================
// 止盈规则表（按匹配优先级排序）
// ============================================================

const RULES: TakeProfitRule[] = [
  {
    fundType: '偏股',
    targetReturn: { min: 8, max: 15 },
    method: 'batch',
    description: '偏股/股票型基金：分3批止盈，每上涨5%触发一批',
    steps: [
      '第1批：收益率达8%时卖出1/3',
      '第2批：收益率达13%时卖出1/3',
      '第3批：收益率达15%时清仓',
    ],
  },
  {
    fundType: '股票',
    targetReturn: { min: 8, max: 15 },
    method: 'batch',
    description: '偏股/股票型基金：分3批止盈，每上涨5%触发一批',
    steps: [
      '第1批：收益率达8%时卖出1/3',
      '第2批：收益率达13%时卖出1/3',
      '第3批：收益率达15%时清仓',
    ],
  },
  {
    fundType: '混合',
    targetReturn: { min: 4, max: 6 },
    method: 'half_then_trail',
    description: '混合/固收+型基金：到达目标后卖50%，剩余随涨随卖',
    steps: [
      '第1步：收益率达4%时卖出50%',
      '第2步：剩余仓位随涨随卖，跌破MA10全部卖出',
    ],
  },
  {
    fundType: '固收',
    targetReturn: { min: 4, max: 6 },
    method: 'half_then_trail',
    description: '混合/固收+型基金：到达目标后卖50%，剩余随涨随卖',
    steps: [
      '第1步：收益率达4%时卖出50%',
      '第2步：剩余仓位随涨随卖，跌破MA10全部卖出',
    ],
  },
  {
    fundType: '行业',
    targetReturn: { min: 15, max: 25 },
    method: 'momentum',
    description: '行业/主题ETF：动量止盈，跌破20日均线清仓',
    steps: [
      '持有直到趋势转弱（收盘价跌破20日均线）',
      '跌破20日均线后次日开盘清仓',
    ],
  },
  {
    fundType: '主题',
    targetReturn: { min: 15, max: 25 },
    method: 'momentum',
    description: '行业/主题ETF：动量止盈，跌破20日均线清仓',
    steps: [
      '持有直到趋势转弱（收盘价跌破20日均线）',
      '跌破20日均线后次日开盘清仓',
    ],
  },
  {
    fundType: 'ETF',
    targetReturn: { min: 10, max: 20 },
    method: 'ladder',
    description: '指数/ETF：阶梯止盈，每涨10%卖1/3',
    steps: [
      '第1阶梯：收益率达10%时卖出1/3',
      '第2阶梯：收益率达20%时再卖1/3',
      '第3阶梯：收益率达30%时清仓',
    ],
  },
  {
    fundType: '指数',
    targetReturn: { min: 10, max: 20 },
    method: 'ladder',
    description: '指数/ETF：阶梯止盈，每涨10%卖1/3',
    steps: [
      '第1阶梯：收益率达10%时卖出1/3',
      '第2阶梯：收益率达20%时再卖1/3',
      '第3阶梯：收益率达30%时清仓',
    ],
  },
];

// ============================================================
// 默认止盈规则
// ============================================================

const DEFAULT_RULE: TakeProfitRule = {
  fundType: 'default',
  targetReturn: { min: 10, max: 10 },
  method: 'fixed',
  description: '默认止盈：固定止盈线10%',
  steps: ['收益率达10%时全部卖出'],
};

// ============================================================
// 基金类型匹配
// ============================================================

/**
 * 根据基金类型字符串匹配止盈规则。
 * 使用关键词包含匹配，按规则表顺序返回第一个匹配项。
 */
function matchFundType(fundType: string): TakeProfitRule {
  if (!fundType) return DEFAULT_RULE;

  for (const rule of RULES) {
    if (fundType.includes(rule.fundType)) {
      return rule;
    }
  }
  return DEFAULT_RULE;
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 获取指定基金类型对应的止盈规则。
 *
 * @param fundType 基金类型字符串（如 "偏股混合型"、"指数型"、"ETF" 等）
 */
export function getTakeProfitRule(fundType: string): TakeProfitRule {
  return matchFundType(fundType);
}

/**
 * 根据当前收益和持有天数，评估是否触发止盈。
 *
 * @param fundType      基金类型字符串
 * @param currentReturn 当前收益率（百分比，如 18.5 表示 18.5%）
 * @param holdingDays   已持有天数（v1 保留参数，供后续扩展使用）
 */
export function evaluateTakeProfit(
  fundType: string,
  currentReturn: number,
  _holdingDays: number,
): TakeProfitAction {
  const rule = matchFundType(fundType);
  const targetMin = rule.targetReturn.min;
  const targetMax = rule.targetReturn.max;

  // 未达最低目标：无需止盈
  if (currentReturn < targetMin) {
    return {
      shouldTakeProfit: false,
      currentReturn: Math.round(currentReturn * 100) / 100,
      targetReturn: targetMin,
      method: rule.method,
      description: rule.description,
      remainingRatio: 1,
      action: `暂不止盈，当前收益率 ${currentReturn.toFixed(1)}%，目标收益率 ${targetMin}%`,
    };
  }

  // 已达目标区间，按方法评估
  switch (rule.method) {
    case 'batch':
      return evaluateBatch(targetMin, targetMax, currentReturn, rule);

    case 'half_then_trail':
      return evaluateHalfThenTrail(targetMin, targetMax, currentReturn, rule);

    case 'momentum':
      return evaluateMomentum(targetMin, currentReturn, rule);

    case 'ladder':
      return evaluateLadder(targetMin, targetMax, currentReturn, rule);

    case 'fixed':
    default:
      return evaluateFixed(targetMin, currentReturn, rule);
  }
}

// ============================================================
// 各止盈方法的评估逻辑
// ============================================================

/**
 * 分批止盈：每上涨 5% 触发一批。
 * 目标区间 min=8 max=15，则：
 *   >= 8%  第1批，卖 1/3，剩余 2/3
 *   >= 13% 第2批，再卖 1/3，剩余 1/3
 *   >= 15% 第3批，清仓
 */
function evaluateBatch(
  targetMin: number,
  targetMax: number,
  currentReturn: number,
  rule: TakeProfitRule,
): TakeProfitAction {
  const stepSize = 5; // 每上涨 5% 触发一批
  const step2 = targetMin + stepSize;

  let remainingRatio: number;
  let action: string;

  if (currentReturn >= targetMax) {
    remainingRatio = 0;
    action = `已达最高目标 ${targetMax}%，触发第3批止盈，建议清仓`;
  } else if (currentReturn >= step2) {
    remainingRatio = 1 / 3;
    action = `触发第2批止盈（收益率 ≥ ${step2}%），卖出1/3，剩余1/3`;
  } else {
    remainingRatio = 2 / 3;
    action = `触发第1批止盈（收益率 ≥ ${targetMin}%），卖出1/3，剩余2/3`;
  }

  return {
    shouldTakeProfit: true,
    currentReturn: Math.round(currentReturn * 100) / 100,
    targetReturn: targetMin,
    method: rule.method,
    description: rule.description,
    remainingRatio,
    action,
  };
}

/**
 * 一半后随涨随卖：到达目标后卖 50%，剩余随涨随卖。
 */
function evaluateHalfThenTrail(
  targetMin: number,
  targetMax: number,
  currentReturn: number,
  rule: TakeProfitRule,
): TakeProfitAction {
  let remainingRatio: number;
  let action: string;

  if (currentReturn >= targetMax) {
    // 已达上限，建议清仓
    remainingRatio = 0;
    action = `已达上限收益率 ${targetMax}%，建议清仓`;
  } else {
    remainingRatio = 0.5;
    action = `达到目标收益率 ${targetMin}%，建议卖出50%，剩余随涨随卖（跌破MA10卖出）`;
  }

  return {
    shouldTakeProfit: true,
    currentReturn: Math.round(currentReturn * 100) / 100,
    targetReturn: targetMin,
    method: rule.method,
    description: rule.description,
    remainingRatio,
    action,
  };
}

/**
 * 动量止盈：不设固定止盈价位，持有至趋势转弱。
 * v1 版本根据收益是否达目标区间给出提示，实际卖出依赖于技术指标。
 */
function evaluateMomentum(
  targetMin: number,
  currentReturn: number,
  rule: TakeProfitRule,
): TakeProfitAction {
  return {
    shouldTakeProfit: true,
    currentReturn: Math.round(currentReturn * 100) / 100,
    targetReturn: targetMin,
    method: rule.method,
    description: rule.description,
    remainingRatio: 0,
    action: `行业/主题ETF动量止盈：当前收益率 ${currentReturn.toFixed(1)}% 已达目标区间，建议关注20日均线，跌破即清仓`,
  };
}

/**
 * 阶梯止盈：每涨 10% 卖 1/3。
 * 目标区间 min=10 max=20，则：
 *   >= 10%  第1阶梯，卖 1/3，剩余 2/3
 *   >= 20%  第2阶梯，再卖 1/3，剩余 1/3
 *   >= 30%  第3阶梯，清仓
 */
function evaluateLadder(
  targetMin: number,
  _targetMax: number,
  currentReturn: number,
  rule: TakeProfitRule,
): TakeProfitAction {
  const stepSize = 10;
  let remainingRatio: number;
  let action: string;

  if (currentReturn >= stepSize * 3) {
    remainingRatio = 0;
    action = `第3阶梯触发（收益率 ≥ ${stepSize * 3}%），清仓`;
  } else if (currentReturn >= stepSize * 2) {
    remainingRatio = 1 / 3;
    action = `第2阶梯触发（收益率 ≥ ${stepSize * 2}%），卖出1/3，剩余1/3`;
  } else {
    remainingRatio = 2 / 3;
    action = `第1阶梯触发（收益率 ≥ ${targetMin}%），卖出1/3，剩余2/3`;
  }

  return {
    shouldTakeProfit: true,
    currentReturn: Math.round(currentReturn * 100) / 100,
    targetReturn: targetMin,
    method: rule.method,
    description: rule.description,
    remainingRatio,
    action,
  };
}

/**
 * 固定止盈：到达目标线后全部卖出。
 */
function evaluateFixed(
  targetMin: number,
  currentReturn: number,
  rule: TakeProfitRule,
): TakeProfitAction {
  return {
    shouldTakeProfit: true,
    currentReturn: Math.round(currentReturn * 100) / 100,
    targetReturn: targetMin,
    method: rule.method,
    description: rule.description,
    remainingRatio: 0,
    action: `达到固定止盈线 ${targetMin}%，建议全部卖出`,
  };
}

// ============================================================
// 自测入口 — 直接执行此文件时运行
// ============================================================

function selfTest(): void {
  console.log('========================================');
  console.log('[takeProfit] 自测开始');
  console.log('========================================\n');

  // 测试规则匹配
  const testTypes = [
    '偏股混合型',
    '股票型',
    '混合型',
    '固收+',
    '行业ETF',
    '主题ETF',
    '指数型',
    'ETF',
    '债券型',      // 无匹配 → default
    '',
  ];

  console.log('--- 规则匹配 ---');
  for (const t of testTypes) {
    const rule = getTakeProfitRule(t);
    console.log(`  ${(t || '(空)').padEnd(14)} → ${rule.description}`);
  }

  // 测试评估
  console.log('\n--- 止盈评估 ---');
  const evalCases = [
    // [fundType, currentReturn, holdingDays, label]
    ['偏股混合型', 5, 180, '未达目标'],
    ['偏股混合型', 10, 180, '第1批'],
    ['偏股混合型', 13.5, 180, '第2批'],
    ['偏股混合型', 16, 180, '第3批'],
    ['混合型', 5, 90, '已达目标'],
    ['混合型', 7, 90, '已达上限'],
    ['行业ETF', 18, 120, '动量止盈'],
    ['指数型', 12, 200, '第1阶梯'],
    ['指数型', 25, 200, '第2阶梯'],
    ['指数型', 35, 200, '第3阶梯'],
    ['债券型', 12, 60, '固定止盈'],
    ['偏股混合型', 0, 30, '亏损不触发'],
  ];

  for (const [type, ret, days, label] of evalCases) {
    const result = evaluateTakeProfit(
      type as string,
      ret as number,
      days as number,
    );
    console.log(
      `  [${label}] ${(type as string).padEnd(12)} ` +
      `收益=${String(ret).padStart(5)}% ` +
      `触发=${result.shouldTakeProfit ? 'Y' : 'N'} ` +
      `保留=${(result.remainingRatio * 100).toFixed(0)}% ` +
      `→ ${result.action}`,
    );
  }

  console.log('\n========================================');
  console.log('[takeProfit] 自测完成');
  console.log('========================================');
}

// 判断是否为直接运行
const isDirectRun =
  process.argv[1]?.endsWith('takeProfit.ts') ||
  process.argv[1]?.endsWith('takeProfit.js');

if (isDirectRun) {
  selfTest();
}
