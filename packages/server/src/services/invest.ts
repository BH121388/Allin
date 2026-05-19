// ============================================================
// 定投金额计算器
//
// 基于 PE 历史分位的估值定投策略：
//   PE < 20%: 1.5-2.0x 加倍投入
//   PE < 30%: 1.2-1.5x 适度加码
//   PE < 70%: 1.0x 正常投入
//   PE < 90%: 0.5x 减少投入
//   PE >= 90%: 0x 停止定投
//
// 所有计算均为纯函数，无副作用。
// ============================================================

import { INVEST_MULTIPLIERS } from '@allin/shared';

// ============================================================
// 类型
// ============================================================

export interface InvestMultiplierResult {
  /** 解析后的具体倍数值（区间中点） */
  multiplier: number;
  /** 原始倍速区间 */
  multiplierRange: [number, number];
  /** 策略说明（中文） */
  strategy: string;
  /** 建议操作 */
  action: string;
}

export interface InvestAmountResult {
  /** 用户基准月定投额 */
  baseAmount: number;
  /** 解析后的定投倍数 */
  multiplier: number;
  /** 本次实际投入金额 */
  actualAmount: number;
  /** 策略说明 */
  strategy: string;
}

// ============================================================
// 按 PE 分位查找匹配的定投倍数区间
// ============================================================

function findMultiplierTier(pePercentile: number) {
  for (const tier of INVEST_MULTIPLIERS) {
    if (pePercentile < tier.maxPercentile) {
      return tier;
    }
  }
  // 兜底：最后一个区间（PE >= 100%，理论上不会进入）
  return INVEST_MULTIPLIERS[INVEST_MULTIPLIERS.length - 1];
}

// ============================================================
// 根据倍数确定操作文字
// ============================================================

function resolveAction(multiplier: number): string {
  if (multiplier > 1) return '加码买入';
  if (multiplier === 1) return '正常定投';
  if (multiplier > 0) return '减半定投';
  return '暂停定投';
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 根据 PE 历史分位计算定投倍数。
 *
 * 从区间中解析出具体倍数值（取区间中点），
 * 同时在返回结果中保留原始区间供展示。
 *
 * @param pePercentile PE 历史分位（0-100）
 */
export function calculateInvestMultiplier(
  pePercentile: number,
): InvestMultiplierResult {
  const tier = findMultiplierTier(pePercentile);
  const [low, high] = tier.multiplier;
  // 区间中点作为解析后的具体倍数，保留两位小数
  const mid = Math.round(((low + high) / 2) * 100) / 100;

  return {
    multiplier: mid,
    multiplierRange: [low, high],
    strategy: tier.strategy,
    action: resolveAction(mid),
  };
}

/**
 * 根据用户月度预算和 PE 分位，计算本次实际定投金额。
 *
 * @param monthlyBudget 用户每月可用于定投的总资金
 * @param pePercentile  PE 历史分位（0-100）
 */
export function calculateInvestAmount(
  monthlyBudget: number,
  pePercentile: number,
): InvestAmountResult {
  const { multiplier, strategy } = calculateInvestMultiplier(pePercentile);
  const actualAmount = Math.round(monthlyBudget * multiplier * 100) / 100;

  return {
    baseAmount: monthlyBudget,
    multiplier,
    actualAmount,
    strategy,
  };
}

// ============================================================
// 自测入口 — 直接执行此文件时运行
// ============================================================

function selfTest(): void {
  console.log('========================================');
  console.log('[invest] 自测开始');
  console.log('========================================\n');

  const testCases = [
    { pe: 10, budget: 5000, label: '极度低估 (< 20%)' },
    { pe: 25, budget: 5000, label: '低估 (< 30%)' },
    { pe: 50, budget: 5000, label: '合理估值 (< 70%)' },
    { pe: 85, budget: 5000, label: '高估 (< 90%)' },
    { pe: 95, budget: 5000, label: '极度高估 (>= 90%)' },
  ];

  for (const tc of testCases) {
    const mr = calculateInvestMultiplier(tc.pe);
    const ar = calculateInvestAmount(tc.budget, tc.pe);

    console.log(`[${tc.label}] PE分位=${tc.pe}`);
    console.log(`  倍数: ${mr.multiplier}x (区间 ${mr.multiplierRange[0]}-${mr.multiplierRange[1]}x)`);
    console.log(`  策略: ${mr.strategy}`);
    console.log(`  操作: ${mr.action}`);
    console.log(`  投入: 基准${ar.baseAmount} → 实际${ar.actualAmount}`);
    console.log('');
  }

  console.log('========================================');
  console.log('[invest] 自测完成');
  console.log('========================================');
}

// 判断是否为直接运行
const isDirectRun =
  process.argv[1]?.endsWith('invest.ts') ||
  process.argv[1]?.endsWith('invest.js');

if (isDirectRun) {
  selfTest();
}
