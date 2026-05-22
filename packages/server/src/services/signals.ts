// ============================================================
// 交易信号生成器
//
// 根据基金评分生成买卖信号和建议持仓比例。
// 信号逻辑基于综合评分阈值：
//   >= 80: 买入
//   60-79: 持有
//   40-59: 减持
//   < 40:  清仓
// ============================================================

import type { FundInfo, FundScore, SignalResult, TradeSignal } from '@allin/shared';
import { SIGNAL_THRESHOLDS } from '@allin/shared';
import type { NAVEntry } from '../adapters/eastmoney.js';

// ============================================================
// 类型
// ============================================================

export interface SignalSummary {
  buyCount: number;
  holdCount: number;
  reduceCount: number;
  sellCount: number;
  dominantSignal: TradeSignal;
  summary: string;
}

// ============================================================
// 信号生成
// ============================================================

/**
 * 根据基金的综合评分和维度得分生成交易信号。
 *
 * @param fund    基金基本信息
 * @param score   六维评分结果
 * @param navData 历史净值（v1 暂用于增强 reason）
 */
export function generateSignal(
  fund: FundInfo,
  score: FundScore,
  navData: NAVEntry[],
): SignalResult {
  const total = score.total;

  // 根据阈值确定信号
  let signal: TradeSignal;
  let suggestedPosition: string;

  if (total >= SIGNAL_THRESHOLDS.buy) {
    signal = 'buy';
    suggestedPosition = '建议投入可用资金的10%-20%';
  } else if (total >= SIGNAL_THRESHOLDS.hold) {
    signal = 'hold';
    suggestedPosition = '维持现有仓位';
  } else if (total >= SIGNAL_THRESHOLDS.reduce) {
    signal = 'reduce';
    suggestedPosition = '建议减持现有仓位的30%-50%';
  } else {
    signal = 'sell';
    suggestedPosition = '建议卖出全部持仓';
  }

  // 构建中文理由
  const reason = buildReason(fund, score, signal, navData);

  return {
    signal,
    score: total,
    reason,
    suggestedPosition,
  };
}

// ============================================================
// 理由生成
// ============================================================

function buildReason(
  fund: FundInfo,
  score: FundScore,
  signal: TradeSignal,
  _navData: NAVEntry[],
): string {
  const parts: string[] = [];

  // 总分描述
  parts.push(`${fund.name}综合得分${score.total}分（满分100）。`);

  // 各维度简述
  if (score.momentum >= 20) {
    parts.push('收益动量强劲，');
  } else if (score.momentum >= 12) {
    parts.push('收益动量平稳，');
  } else {
    parts.push('收益动量偏弱，');
  }

  if (score.riskControl >= 16) {
    parts.push('风险控制优秀，');
  } else if (score.riskControl >= 10) {
    parts.push('风险控制适中，');
  } else {
    parts.push('风险控制待改善，');
  }

  if (score.manager >= 12) {
    parts.push('经理能力突出。');
  } else if (score.manager >= 8) {
    parts.push('经理能力良好。');
  } else {
    parts.push('经理能力一般。');
  }

  // 信号结论
  switch (signal) {
    case 'buy':
      parts.push('综合评估优秀，建议择机买入。');
      break;
    case 'hold':
      parts.push('综合评估良好，建议继续持有并关注后续表现。');
      break;
    case 'reduce':
      parts.push('综合评估一般，建议逐步减仓控制风险。');
      break;
    case 'sell':
      parts.push('综合评估较差，建议清仓规避下行风险。');
      break;
  }

  return parts.join('');
}

// ============================================================
// 持仓信号汇总
// ============================================================

/**
 * 对多个持仓的信号进行汇总统计，返回整体信号概览。
 */
export function getSignalSummary(
  holdings: Array<{ signal: SignalResult }>,
): SignalSummary {
  let buyCount = 0;
  let holdCount = 0;
  let reduceCount = 0;
  let sellCount = 0;

  for (const h of holdings) {
    switch (h.signal.signal) {
      case 'buy':
        buyCount++;
        break;
      case 'hold':
        holdCount++;
        break;
      case 'reduce':
        reduceCount++;
        break;
      case 'sell':
        sellCount++;
        break;
    }
  }

  // 确定主导信号（按优先级：数量最多的，同数量时取偏负面的）
  const dominantSignal = resolveDominant(buyCount, holdCount, reduceCount, sellCount);

  // 生成中文摘要
  const summary = buildSummary(buyCount, holdCount, reduceCount, sellCount);

  return {
    buyCount,
    holdCount,
    reduceCount,
    sellCount,
    dominantSignal,
    summary,
  };
}

function resolveDominant(
  buyCount: number,
  holdCount: number,
  reduceCount: number,
  sellCount: number,
): TradeSignal {
  const counts: Array<{ signal: TradeSignal; count: number }> = [
    { signal: 'buy', count: buyCount },
    { signal: 'hold', count: holdCount },
    { signal: 'reduce', count: reduceCount },
    { signal: 'sell', count: sellCount },
  ];

  counts.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // 相同数量时优先偏负面
    const priority: Record<TradeSignal, number> = {
      sell: 4,
      reduce: 3,
      hold: 2,
      buy: 1,
    };
    return priority[b.signal] - priority[a.signal];
  });

  return counts[0].signal;
}

function buildSummary(
  buyCount: number,
  holdCount: number,
  reduceCount: number,
  sellCount: number,
): string {
  const total = buyCount + holdCount + reduceCount + sellCount;
  if (total === 0) return '暂无持仓信号';

  const parts: string[] = [];

  // 偏积极的组合判断
  const positiveCount = buyCount + holdCount;
  const negativeCount = reduceCount + sellCount;

  if (positiveCount > negativeCount) {
    parts.push('持仓整体偏积极，');
  } else if (negativeCount > positiveCount) {
    parts.push('持仓整体偏谨慎，');
  } else {
    parts.push('持仓信号分化，');
  }

  const details: string[] = [];
  if (buyCount > 0) details.push(`${buyCount}只建议买入`);
  if (holdCount > 0) details.push(`${holdCount}只建议持有`);
  if (reduceCount > 0) details.push(`${reduceCount}只建议减持`);
  if (sellCount > 0) details.push(`${sellCount}只建议卖出`);

  parts.push(details.join('，'));

  return parts.join('');
}

// ============================================================
// 自测入口 — 直接执行此文件时运行
// ============================================================

async function selfTest(): Promise<void> {
  const { fetchAllFunds, fetchFundDetail } =
    await import('../adapters/eastmoney.js');
  const { scoreFund } = await import('./scoring.js');

  console.log('========================================');
  console.log('[signals] 自测开始');
  console.log('========================================\n');

  // 获取真实基金并评分
  const funds = await fetchAllFunds();
  const signals: SignalResult[] = [];

  for (const fund of funds.slice(0, 5)) {
    const detail = await fetchFundDetail(fund.code);
    const nav = detail?.navHistory || [];
    const score = scoreFund(fund, nav);
    const signal = generateSignal(fund, score, nav);
    signals.push(signal);

    console.log(
      `${fund.code} ${fund.name.padEnd(24)} ` +
      `总分:${String(score.total).padStart(3)} ` +
      `信号:${signal.signal.padEnd(6)} ` +
      `建议:${signal.suggestedPosition}`,
    );
    console.log(`  理由: ${signal.reason}`);
    console.log('');
  }

  // 汇总
  const holdings = signals.map((s) => ({ signal: s }));
  const summary = getSignalSummary(holdings);
  console.log('--- 信号汇总 ---');
  console.log(`  买入: ${summary.buyCount} | 持有: ${summary.holdCount} | 减持: ${summary.reduceCount} | 卖出: ${summary.sellCount}`);
  console.log(`  主导信号: ${summary.dominantSignal}`);
  console.log(`  摘要: ${summary.summary}`);

  console.log('\n========================================');
  console.log('[signals] 自测完成');
  console.log('========================================');
}

// 判断是否为直接运行
const isDirectRun =
  process.argv[1]?.endsWith('signals.ts') ||
  process.argv[1]?.endsWith('signals.js');

if (isDirectRun) {
  selfTest().catch((err) => {
    console.error('[signals] 自测异常:', err);
    process.exit(1);
  });
}
