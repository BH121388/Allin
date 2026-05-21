// ============================================================
// 股票止盈/止损规则引擎
//
// 基于收益率 + 评分变化 + 技术信号的止盈止损决策
// ============================================================

export interface StockTakeProfitRule {
  method: 'trailing' | 'target' | 'score_drop' | 'technical';
  description: string;
}

export interface StockTakeProfitAction {
  shouldAct: boolean;
  action: 'hold' | 'reduce_half' | 'sell_all' | 'trailing_stop';
  reason: string;
  stopPrice?: number;
}

const RULES: StockTakeProfitRule[] = [
  { method: 'trailing', description: '移动止盈：从最高点回落8%即卖出' },
  { method: 'target', description: '目标止盈：收益达15%分批卖出' },
  { method: 'score_drop', description: '评分下降：评分从高点跌超15分减仓' },
  { method: 'technical', description: '技术止损：连续3日跌破MA20清仓' },
];

export function getStockTakeProfitRules(): StockTakeProfitRule[] {
  return RULES;
}

export function evaluateStockTakeProfit(params: {
  currentReturnPct: number;
  maxReturnPct: number;        // 持仓期间最高收益
  currentScore: number;
  entryScore: number;          // 买入时评分
  priceBelowMA20: boolean;     // 是否连续跌破MA20
  currentPrice: number;
  highestPrice: number;        // 期间最高价
}): StockTakeProfitAction {
  const { currentReturnPct, maxReturnPct, currentScore, entryScore, priceBelowMA20, currentPrice, highestPrice } = params;

  // 1. 技术止损（最高优先级）：连续3日跌破MA20
  if (priceBelowMA20 && currentReturnPct < 0) {
    return { shouldAct: true, action: 'sell_all', reason: '连续跌破MA20且浮亏，技术面恶化，建议清仓止损' };
  }

  // 2. 评分大幅下降
  const scoreDrop = entryScore - currentScore;
  if (scoreDrop > 15 && currentReturnPct > 5) {
    return { shouldAct: true, action: 'reduce_half', reason: `评分从${entryScore}降至${currentScore}(-${scoreDrop})，基本面恶化，建议减半仓` };
  }
  if (scoreDrop > 20) {
    return { shouldAct: true, action: 'sell_all', reason: `评分暴跌${scoreDrop}分，基本面严重恶化，建议清仓` };
  }

  // 3. 移动止盈：从最高点回落超过8%
  const drawdownFromHigh = highestPrice > 0 ? ((highestPrice - currentPrice) / highestPrice) * 100 : 0;
  if (maxReturnPct > 10 && drawdownFromHigh > 8) {
    const stopPrice = Math.round(highestPrice * 0.92 * 100) / 100;
    return { shouldAct: true, action: 'trailing_stop', reason: `从高点${highestPrice.toFixed(2)}回落${drawdownFromHigh.toFixed(1)}%，触发移动止盈，止损价${stopPrice}`, stopPrice };
  }

  // 4. 目标止盈：达到15%收益
  if (currentReturnPct >= 20) {
    return { shouldAct: true, action: 'sell_all', reason: `收益已达+${currentReturnPct.toFixed(1)}%，达到20%目标，建议清仓锁定利润` };
  }
  if (currentReturnPct >= 15) {
    return { shouldAct: true, action: 'reduce_half', reason: `收益已达+${currentReturnPct.toFixed(1)}%，达到15%第一目标，建议卖出50%` };
  }
  if (currentReturnPct >= 10 && maxReturnPct >= 15) {
    return { shouldAct: true, action: 'trailing_stop', reason: `曾达+${maxReturnPct.toFixed(1)}%现回落至+${currentReturnPct.toFixed(1)}%，建议设移动止盈保护利润` };
  }

  // 5. 止损：亏损超10%
  if (currentReturnPct <= -10) {
    return { shouldAct: true, action: 'sell_all', reason: `亏损${Math.abs(currentReturnPct).toFixed(1)}%超10%，严格执行止损，保护本金` };
  }
  if (currentReturnPct <= -7 && scoreDrop > 5) {
    return { shouldAct: true, action: 'reduce_half', reason: `亏损${Math.abs(currentReturnPct).toFixed(1)}%且评分下降，建议减仓控制风险` };
  }

  return { shouldAct: false, action: 'hold', reason: `当前收益${currentReturnPct >= 0 ? '+' : ''}${currentReturnPct.toFixed(1)}%，继续持有` };
}
