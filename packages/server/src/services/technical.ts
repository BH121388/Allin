// ============================================================
// 技术指标计算器
//
// 提供均线、RSI、MACD 等常用技术指标的计算函数。
// 所有函数均为纯函数，无副作用。
// ============================================================

import type { NAVEntry } from '../adapters/eastmoney.js';

// ============================================================
// 类型
// ============================================================

export interface TrendInfo {
  trend: 'bullish' | 'bearish' | 'neutral';
  ma20: number;
  ma60: number;
  rsi: number;
  macd: {
    dif: number;
    dea: number;
    histogram: number;
  };
  description: string;
}

// ============================================================
// 简单移动平均线 (SMA)
// ============================================================

/**
 * 计算简单移动平均线。
 *
 * @param navData 净值序列（按日期升序）
 * @param period  均线周期（如 20 表示 20 日均线）
 * @returns 与 navData 等长的数组，前 period-1 个元素为 0
 */
export function calcMA(navData: NAVEntry[], period: number): number[] {
  const result: number[] = new Array(navData.length).fill(0);

  if (navData.length < period || period <= 0) return result;

  // 计算第一个完整窗口的和
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += navData[i].nav;
  }
  result[period - 1] = parseFloat((sum / period).toFixed(4));

  // 滑动窗口
  for (let i = period; i < navData.length; i++) {
    sum = sum - navData[i - period].nav + navData[i].nav;
    result[i] = parseFloat((sum / period).toFixed(4));
  }

  return result;
}

// ============================================================
// EMA 辅助
// ============================================================

/**
 * 计算指数移动平均线 (EMA)，返回与数据等长的数组。
 * 前 period-1 个元素为 0。
 */
function calcEMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(0);

  if (values.length < period) return result;

  const multiplier = 2 / (period + 1);

  // 首个 EMA 用 SMA 初始化
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  result[period - 1] = sum / period;

  // 后续 EMA
  for (let i = period; i < values.length; i++) {
    result[i] = (values[i] - result[i - 1]) * multiplier + result[i - 1];
  }

  return result;
}

// ============================================================
// RSI — 相对强弱指标
// ============================================================

/**
 * 计算 RSI（相对强弱指标），使用 Wilder 平滑法。
 *
 * @param navData 净值序列（按日期升序）
 * @param period  RSI 周期，默认 14
 * @returns 最新 RSI 值 (0-100)。数据不足时返回 50（中性）。
 */
export function calcRSI(navData: NAVEntry[], period = 14): number {
  if (navData.length < period + 1) return 50;

  // 提取日涨跌幅序列
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) {
    const r = navData[i].dailyReturn;
    if (typeof r === 'number' && !Number.isNaN(r)) {
      returns.push(r);
    } else {
      // 回退：用单位净值计算
      const prev = navData[i - 1].nav;
      const curr = navData[i].nav;
      if (prev > 0) {
        returns.push(((curr - prev) / prev) * 100);
      } else {
        returns.push(0);
      }
    }
  }

  if (returns.length < period) return 50;

  // Wilder 初始平均涨幅 / 平均跌幅
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (returns[i] > 0) avgGain += returns[i];
    else avgLoss += Math.abs(returns[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder 平滑递推
  for (let i = period; i < returns.length; i++) {
    const gain = returns[i] > 0 ? returns[i] : 0;
    const loss = returns[i] < 0 ? Math.abs(returns[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return parseFloat(rsi.toFixed(2));
}

// ============================================================
// MACD — 异同移动平均线
// ============================================================

/**
 * 计算 MACD(12, 26, 9)。
 *
 * @param navData 净值序列（按日期升序）
 * @returns 最新 DIF、DEA、histogram（柱状图为 2*(DIF-DEA)）
 *          数据不足时返回 0 值。
 */
export function calcMACD(
  navData: NAVEntry[],
): { dif: number; dea: number; histogram: number } {
  if (navData.length < 26 + 9) {
    return { dif: 0, dea: 0, histogram: 0 };
  }

  const prices = navData.map((e) => e.nav);

  // EMA12 和 EMA26
  const ema12Arr = calcEMA(prices, 12);
  const ema26Arr = calcEMA(prices, 26);

  // DIF = EMA12 - EMA26
  const difArr: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (ema12Arr[i] === 0 || ema26Arr[i] === 0) {
      difArr.push(0);
    } else {
      difArr.push(ema12Arr[i] - ema26Arr[i]);
    }
  }

  // DEA = EMA9 of DIF
  const deaArr = calcEMA(difArr, 9);

  // 取最新值
  const dif = parseFloat(difArr[difArr.length - 1].toFixed(4));
  const dea = parseFloat(deaArr[deaArr.length - 1].toFixed(4));
  const histogram = parseFloat((2 * (dif - dea)).toFixed(4));

  return { dif, dea, histogram };
}

// ============================================================
// 趋势判断
// ============================================================

/**
 * 综合 MA20、MA60、RSI、MACD 判断当前趋势。
 *
 * @param navData 净值序列（按日期升序）
 * @returns TrendInfo 包含趋势方向、指标值和中文描述
 */
export function getTrendSignal(navData: NAVEntry[]): TrendInfo {
  const ma20Arr = calcMA(navData, 20);
  const ma60Arr = calcMA(navData, 60);
  const rsi = calcRSI(navData, 14);
  const macd = calcMACD(navData);

  const lastIdx = navData.length - 1;
  const currentPrice = navData.length > 0 ? navData[lastIdx].nav : 0;
  const ma20 = lastIdx >= 0 ? ma20Arr[lastIdx] : 0;
  const ma60 = lastIdx >= 0 ? ma60Arr[lastIdx] : 0;

  // 趋势判断：综合均线排列 + RSI + MACD
  let bullishScore = 0;
  let bearishScore = 0;

  // 均线多头排列：MA20 > MA60 且价格在 MA20 之上
  if (ma20 > 0 && ma60 > 0) {
    if (ma20 > ma60 && currentPrice > ma20) {
      bullishScore += 3;
    } else if (ma20 < ma60 && currentPrice < ma20) {
      bearishScore += 3;
    } else if (currentPrice > ma60) {
      bullishScore += 1;
    } else {
      bearishScore += 1;
    }
  }

  // RSI 判断
  if (rsi >= 60) {
    bullishScore += 2;
  } else if (rsi <= 40) {
    bearishScore += 2;
  }

  // MACD 判断
  if (macd.histogram > 0 && macd.dif > 0) {
    bullishScore += 2;
  } else if (macd.histogram < 0 && macd.dif < 0) {
    bearishScore += 2;
  } else if (macd.dif > macd.dea) {
    bullishScore += 1;
  } else {
    bearishScore += 1;
  }

  let trend: 'bullish' | 'bearish' | 'neutral';
  let description: string;

  if (bullishScore > bearishScore && bullishScore >= 4) {
    trend = 'bullish';
    description = '多头排列，趋势强劲';
  } else if (bearishScore > bullishScore && bearishScore >= 4) {
    trend = 'bearish';
    description = '空头排列，建议谨慎';
  } else {
    trend = 'neutral';
    description = '震荡整理，方向不明';
  }

  // 增强描述
  if (trend === 'bullish' && rsi >= 70) {
    description += '，但RSI显示超买，注意短期回调风险';
  } else if (trend === 'bearish' && rsi <= 30) {
    description += '，但RSI显示超卖，可能出现技术反弹';
  }

  return {
    trend,
    ma20: parseFloat(ma20.toFixed(4)),
    ma60: parseFloat(ma60.toFixed(4)),
    rsi,
    macd,
    description,
  };
}

// ============================================================
// BOLL — 布林带
// ============================================================

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;  // (upper - lower) / middle * 100
  percentB: number;   // (price - lower) / (upper - lower) — 当前价格在带宽中的位置
}

/**
 * 计算布林带 BOLL(20, 2)。
 */
export function calcBollingerBands(navData: NAVEntry[], period = 20, multiplier = 2): BollingerBands | null {
  if (navData.length < period) return null;

  const prices = navData.slice(-period).map(e => e.nav);
  const currentPrice = prices[prices.length - 1];

  // MA20 (中轨)
  const middle = prices.reduce((a, b) => a + b, 0) / period;

  // 标准差
  const variance = prices.reduce((s, p) => s + (p - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + multiplier * stdDev;
  const lower = middle - multiplier * stdDev;
  const bandwidth = middle > 0 ? ((upper - lower) / middle) * 100 : 0;
  const percentB = upper - lower > 0 ? (currentPrice - lower) / (upper - lower) : 0.5;

  return {
    upper: parseFloat(upper.toFixed(4)),
    middle: parseFloat(middle.toFixed(4)),
    lower: parseFloat(lower.toFixed(4)),
    bandwidth: parseFloat(bandwidth.toFixed(2)),
    percentB: parseFloat(percentB.toFixed(4)),
  };
}

// ============================================================
// KDJ — 随机指标
// ============================================================

export interface KDJ {
  k: number;
  d: number;
  j: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  description: string;
}

/**
 * 计算 KDJ(9, 3, 3)。
 *
 * RSV = (C - L9) / (H9 - L9) * 100
 * K = 2/3 * prevK + 1/3 * RSV
 * D = 2/3 * prevD + 1/3 * K
 * J = 3*K - 2*D
 */
export function calcKDJ(navData: NAVEntry[], period = 9): KDJ | null {
  if (navData.length < period + 2) return null;

  const prices = navData.map(e => e.nav);

  // 找最近 period 日的最高价和最低价
  const window = prices.slice(-period);
  const highest = Math.max(...window);
  const lowest = Math.min(...window);
  const current = prices[prices.length - 1];

  // RSV
  const rsv = highest - lowest > 0
    ? ((current - lowest) / (highest - lowest)) * 100
    : 50;

  // 用 Wilder 平滑递推计算 K 和 D（近似取近 3 个 RSV 的加权）
  // 简化：获取前两日的 K/D，如果数据量不够则用 RSV 初始化
  let k = rsv;
  let d = rsv;

  // 递推近 10 个 RSV 来平滑近似 K/D
  if (prices.length >= period + 5) {
    let kVal = 50, dVal = 50;
    for (let i = period; i < prices.length; i++) {
      const win = prices.slice(Math.max(0, i - period + 1), i + 1);
      const h = Math.max(...win);
      const l = Math.min(...win);
      const c = prices[i];
      const r = h - l > 0 ? ((c - l) / (h - l)) * 100 : 50;
      kVal = (2 / 3) * kVal + (1 / 3) * r;
      dVal = (2 / 3) * dVal + (1 / 3) * kVal;
    }
    k = kVal;
    d = dVal;
  }

  const j = 3 * k - 2 * d;

  let signal: KDJ['signal'];
  let description: string;
  if (j > 100) {
    signal = 'overbought'; description = 'J值超买，短期回调风险较大';
  } else if (j < 0) {
    signal = 'oversold'; description = 'J值超卖，可能出现技术反弹';
  } else if (k > 80 && d > 80) {
    signal = 'overbought'; description = 'KD高位钝化，注意回调风险';
  } else if (k < 20 && d < 20) {
    signal = 'oversold'; description = 'KD低位，存在反弹机会';
  } else if (k > d && j > k) {
    signal = 'neutral'; description = 'KDJ多头排列，短期偏强';
  } else if (k < d && j < k) {
    signal = 'neutral'; description = 'KDJ空头排列，短期偏弱';
  } else {
    signal = 'neutral'; description = 'KDJ震荡，方向不明';
  }

  return {
    k: parseFloat(k.toFixed(2)),
    d: parseFloat(d.toFixed(2)),
    j: parseFloat(j.toFixed(2)),
    signal,
    description,
  };
}

// ============================================================
// OBV — 能量潮
// ============================================================

export interface OBVResult {
  latestOBV: number;
  obvMA: number;       // OBV 的 MA20
  divergence: 'bullish' | 'bearish' | 'none';
  description: string;
}

/**
 * 计算 OBV 能量潮指标。
 * 由于 NAV 数据没有成交量，此处用日收益率的绝对值作为"能量"代理。
 *
 * 对于股票（有成交量的 K线数据），应使用真实成交量。
 * 此实现同时支持 NAV 数据和 StockKLine 数据。
 */
export function calcOBV(prices: Array<{ close: number; volume?: number; dailyReturn?: number }>): OBVResult | null {
  if (prices.length < 20) return null;

  // 计算代理成交量：用 |日收益| * 基准量
  const baseVol = 1000000;
  const obv: number[] = [0];

  for (let i = 1; i < prices.length; i++) {
    const prev = obv[i - 1];
    const currPrice = prices[i].close;
    const prevPrice = prices[i - 1].close;

    // 使用真实成交量或代理成交量
    let vol: number;
    const realVol = prices[i].volume ?? 0;
    const dailyRet = prices[i].dailyReturn ?? 0;
    if (realVol > 0) {
      vol = realVol;
    } else if (dailyRet !== 0) {
      vol = Math.abs(dailyRet) * baseVol;
    } else {
      vol = baseVol;
    }

    if (currPrice > prevPrice) {
      obv.push(prev + vol);
    } else if (currPrice < prevPrice) {
      obv.push(prev - vol);
    } else {
      obv.push(prev);
    }
  }

  const latestOBV = obv[obv.length - 1];
  const obvSlice = obv.slice(-20);
  const obvMA = obvSlice.reduce((a, b) => a + b, 0) / obvSlice.length;

  // 背离判断：价格新高但OBV未新高 = 顶背离
  const priceSlice = prices.slice(-20);
  const priceHigh = Math.max(...priceSlice.map(p => p.close));
  const obvHigh = Math.max(...obvSlice);
  const priceLow = Math.min(...priceSlice.map(p => p.close));
  const obvLow = Math.min(...obvSlice);

  let divergence: OBVResult['divergence'] = 'none';
  let description = 'OBV与价格同步，无明显背离';

  const currentPrice = prices[prices.length - 1].close;
  if (currentPrice >= priceHigh * 0.98 && latestOBV < obvHigh * 0.9) {
    divergence = 'bearish'; description = '顶背离：价格高位但OBV未配合，警惕回调';
  } else if (currentPrice <= priceLow * 1.02 && latestOBV > obvLow * 1.1) {
    divergence = 'bullish'; description = '底背离：价格低位但OBV抬升，可能见底';
  }

  return {
    latestOBV: Math.round(latestOBV),
    obvMA: Math.round(obvMA),
    divergence,
    description,
  };
}

// ============================================================
// 自测入口 — 直接执行此文件时运行
// ============================================================

async function selfTest(): Promise<void> {
  const { fetchAllFunds, fetchFundDetail } =
    await import('../adapters/eastmoney.js');

  console.log('========================================');
  console.log('[technical] 自测开始');
  console.log('========================================\n');

  const funds = await fetchAllFunds();
  const fund = funds[0];
  const detail = await fetchFundDetail(fund.code);
  const nav = detail?.navHistory || [];

  console.log(`基金: ${fund.code} ${fund.name}`);
  console.log(`净值条目数: ${nav.length}`);

  // 首尾数据
  if (nav.length > 0) {
    const first = nav[0];
    const last = nav[nav.length - 1];
    console.log(`首日: ${first.date} nav=${first.nav}`);
    console.log(`末日: ${last.date} nav=${last.nav}`);
  }
  console.log('');

  // --- MA ---
  console.log('--- 均线 (MA) ---');
  const ma20Arr = calcMA(nav, 20);
  const ma60Arr = calcMA(nav, 60);
  const lastMa20 = ma20Arr[ma20Arr.length - 1];
  const lastMa60 = ma60Arr[ma60Arr.length - 1];
  const currentPrice = nav[nav.length - 1].nav;
  console.log(`  MA20: ${lastMa20}`);
  console.log(`  MA60: ${lastMa60}`);
  console.log(`  当前价格: ${currentPrice}`);
  console.log(
    `  价格 vs MA20: ${currentPrice > lastMa20 ? '上方' : '下方'} ` +
    `(${(currentPrice - lastMa20).toFixed(4)})`,
  );
  console.log('');

  // --- RSI ---
  console.log('--- RSI (14) ---');
  const rsi = calcRSI(nav, 14);
  console.log(`  RSI(14): ${rsi}`);
  // 验证范围
  console.log(`  范围验证: ${rsi >= 0 && rsi <= 100 ? 'PASS' : 'FAIL'} (0-100)`);
  console.log('');

  // --- MACD ---
  console.log('--- MACD (12, 26, 9) ---');
  const macd = calcMACD(nav);
  console.log(`  DIF: ${macd.dif}`);
  console.log(`  DEA: ${macd.dea}`);
  console.log(`  MACD柱: ${macd.histogram}`);
  console.log(`  结构验证: ${typeof macd.dif === 'number' && typeof macd.dea === 'number' && typeof macd.histogram === 'number' ? 'PASS' : 'FAIL'}`);
  console.log('');

  // --- 趋势 ---
  console.log('--- 趋势判断 ---');
  const trend = getTrendSignal(nav);
  console.log(`  趋势: ${trend.trend}`);
  console.log(`  MA20: ${trend.ma20}`);
  console.log(`  MA60: ${trend.ma60}`);
  console.log(`  RSI: ${trend.rsi}`);
  console.log(`  MACD DIF/DEA/柱: ${trend.macd.dif} / ${trend.macd.dea} / ${trend.macd.histogram}`);
  console.log(`  描述: ${trend.description}`);

  // 再测 3 只不同基金的 RSI 值范围
  console.log('\n--- 多基金 RSI 对比 ---');
  const fundList = (await fetchAllFunds()).slice(0, 5);
  for (const f of fundList) {
    const detail = await fetchFundDetail(f.code);
    const navData = detail?.navHistory || [];
    const rsiVal = calcRSI(navData, 14);
    console.log(`  ${f.code} ${f.name.padEnd(24)} RSI(14): ${rsiVal}`);
  }

  console.log('\n========================================');
  console.log('[technical] 自测完成');
  console.log('========================================');
}

// 判断是否为直接运行
const isDirectRun =
  process.argv[1]?.endsWith('technical.ts') ||
  process.argv[1]?.endsWith('technical.js');

if (isDirectRun) {
  selfTest().catch((err) => {
    console.error('[technical] 自测异常:', err);
    process.exit(1);
  });
}
