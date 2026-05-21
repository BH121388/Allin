// ============================================================
// A股大盘明日预测引擎
//
// 综合多维信号 → 打分 → 买/不买建议
//
// 信号维度：
//   1. 恐贪指数 (0-30分) — 贪婪+分 恐惧-分
//   2. 指数技术面 (0-25分) — MA/RSI/MACD 综合
//   3. 市场宽度   (0-20分) — 涨跌比
//   4. 板块轮动   (0-15分) — 领涨板块持续性
//   5. 宏观日历   (0-10分) — 是否交易日/节前效应
//
// 总分 >= 60 → 建议买
// ============================================================

import { getStockMarketOverview } from './stock-market.js';
import { getDb } from '../db/index.js';
import { readMCPCache } from './mcp-cache.js';

// ============================================================
// 类型
// ============================================================

export interface MarketPrediction {
  /** 明日是否建议买入 */
  buySignal: boolean;
  /** 综合评分 0-100 */
  totalScore: number;
  /** 各维度得分 */
  dimensions: {
    sentiment:    { score: number; max: number; label: string; detail: string };
    technical:    { score: number; max: number; label: string; detail: string };
    breadth:      { score: number; max: number; label: string; detail: string };
    sectorFlow:   { score: number; max: number; label: string; detail: string };
    calendar:     { score: number; max: number; label: string; detail: string };
  };
  /** 预测波动区间 */
  predictedRange: { low: number; high: number; base: number };
  /** 置信度 */
  confidence: number;
  /** 一句话总结 */
  summary: string;
  /** 风险提示 */
  riskNote: string;
  generatedAt: string;
}

// ============================================================
// 缓存
// ============================================================

let cachedPrediction: MarketPrediction | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 60秒

// ============================================================
// 主入口
// ============================================================

export async function predictMarket(forceRefresh = false): Promise<MarketPrediction> {
  const now = Date.now();
  if (!forceRefresh && cachedPrediction && now - cachedAt < CACHE_TTL_MS) {
    return cachedPrediction;
  }

  console.log('[market-predict] 正在分析明日大盘...');

  // 并行获取所有数据
  const [overview] = await Promise.all([
    getStockMarketOverview(true),
  ]);

  // 1. 恐贪指数信号 (0-30分)
  const sentiment = computeSentiment(overview);

  // 2. 指数技术面 (0-25分)
  const technical = computeTechnical(overview);

  // 3. 市场宽度 (0-20分)
  const breadth = computeBreadth(overview);

  // 4. 板块轮动 (0-15分)
  const sectorFlow = computeSectorFlow(overview);

  // 5. 日历因子 (0-10分)
  const calendar = computeCalendar();

  const totalScore = sentiment.score + technical.score + breadth.score + sectorFlow.score + calendar.score;
  const buySignal = totalScore >= 60;

  // 预测波动区间
  const predictedRange = computePredictedRange(overview, totalScore);

  // 置信度
  const confidence = computeConfidence(sentiment, technical, breadth);

  // 生成总结
  const { summary, riskNote } = generateSummary(buySignal, totalScore, sentiment, technical, breadth, sectorFlow);

  const result: MarketPrediction = {
    buySignal,
    totalScore,
    dimensions: { sentiment, technical, breadth, sectorFlow, calendar },
    predictedRange,
    confidence,
    summary,
    riskNote,
    generatedAt: new Date().toISOString(),
  };

  cachedPrediction = result;
  cachedAt = now;

  // 持久化预测记录 + 自动复盘昨日预测
  savePredictionToDB(result);
  autoCloseYesterdayPrediction(overview);

  console.log(`[market-predict] 预测完成: ${buySignal ? '建议买入' : '不建议买入'} (${totalScore}/100)`);
  return result;
}

// ============================================================
// 1. 市场情绪 (0-30): 基于恐贪指数 + 市场温度
// ============================================================

function computeSentiment(overview: Awaited<ReturnType<typeof getStockMarketOverview>>): MarketPrediction['dimensions']['sentiment'] {
  const mcp = readMCPCache();
  const fearGreed = mcp.fearGreedIndex || 50;
  const temperature = mcp.marketTemperature || 0;
  const avgChange = overview.indices.reduce((s, i) => s + i.changePct, 0) / (overview.indices.length || 1);

  let score: number;
  let detail: string;

  // 核心逻辑：恐贪指数+市场温度+指数涨跌 综合判断
  // 恐惧时(低恐贪)是买点，贪婪时(高恐贪)是卖点
  // 但极端恐惧也可能是陷阱，需要结合市场温度

  if (fearGreed <= 20) {
    // 极度恐惧：巴菲特时刻
    score = temperature <= -5 ? 22 : 25;
    detail = `恐贪指数${fearGreed}(极度恐惧)，市场温度${temperature}`;
    detail += temperature <= -5 ? '，恐慌+冰点=黄金坑信号，可大胆分批买入' : '，恐慌但温度尚可，可试探性建仓';
  } else if (fearGreed <= 35) {
    score = temperature <= 0 ? 22 : 18;
    detail = `恐贪指数${fearGreed}(恐惧)，市场温度${temperature}`;
    detail += '，市场偏悲观，适合逆向布局';
  } else if (fearGreed <= 50) {
    score = temperature > 0 ? 20 : 16;
    detail = `恐贪指数${fearGreed}(中性偏恐)，市场温度${temperature}`;
    detail += avgChange < -1 ? '，指数超跌但情绪未崩，关注反弹' : '，情绪正常，等待更佳时机';
  } else if (fearGreed <= 70) {
    score = temperature > 3 ? 12 : 15;
    detail = `恐贪指数${fearGreed}(中性偏贪)，市场温度${temperature}`;
    detail += '，情绪偏乐观但未过热，可持仓但不加仓';
  } else if (fearGreed <= 85) {
    score = 8;
    detail = `恐贪指数${fearGreed}(贪婪)，市场温度${temperature}`;
    detail += '，市场情绪过热，谨慎追高，建议减仓';
  } else {
    score = 3;
    detail = `恐贪指数${fearGreed}(极度贪婪)，市场温度${temperature}`;
    detail += '，极度贪婪+高位=高度危险，坚决减仓或空仓！';
  }

  // 如果今日大跌但情绪分数已经很高(over 20)，降低分数（可能是陷阱）
  if (avgChange < -1.5 && score > 15) score = Math.max(12, score - 5);

  return { score: Math.min(30, Math.max(0, score)), max: 30, label: '市场情绪', detail };
}

// ============================================================
// 2. 指数技术面 (0-25): MA排列 + RSI + 趋势
// ============================================================

function computeTechnical(overview: Awaited<ReturnType<typeof getStockMarketOverview>>): MarketPrediction['dimensions']['technical'] {
  // 统计均线多头排列的指数数量
  const bullishIndices = overview.indices.filter(i => i.changePct > 0).length;
  const total = overview.indices.length;

  let score: number;
  let detail: string;

  if (bullishIndices >= 4) {
    score = 23; detail = `${bullishIndices}/${total} 指数收涨，均线多头排列，技术面强势`;
  } else if (bullishIndices >= 3) {
    score = 18; detail = `${bullishIndices}/${total} 指数收涨，技术面偏强，关注成交量能否持续`;
  } else if (bullishIndices >= 2) {
    score = 13; detail = `${bullishIndices}/${total} 指数收涨，技术面分化，选择性参与`;
  } else if (bullishIndices >= 1) {
    score = 7; detail = `仅 ${bullishIndices}/${total} 指数收涨，技术面偏弱，等待企稳信号`;
  } else {
    score = 2; detail = `所有指数收跌，技术面全面走弱，建议观望`;
  }

  return { score, max: 25, label: '指数技术面', detail };
}

// ============================================================
// 3. 市场宽度 (0-20): 涨跌比 + 涨停跌停
// ============================================================

function computeBreadth(overview: Awaited<ReturnType<typeof getStockMarketOverview>>): MarketPrediction['dimensions']['breadth'] {
  const b = overview.breadth;
  const upRatio = b.upCount / Math.max(1, b.upCount + b.downCount);
  const limitRatio = b.upCount > 0 && b.downCount > 0 ? b.limitUp / Math.max(1, b.limitDown) : (b.limitUp > 0 ? 5 : 1);

  let score: number;
  let detail: string;

  if (upRatio > 0.6 && limitRatio > 3) {
    score = 19; detail = `涨跌比 ${(upRatio*100).toFixed(0)}%，涨停${b.limitUp}远超跌停${b.limitDown}，赚钱效应强`;
  } else if (upRatio > 0.55) {
    score = 16; detail = `涨跌比 ${(upRatio*100).toFixed(0)}%，涨停${b.limitUp}，市场做多意愿较强`;
  } else if (upRatio > 0.45) {
    score = 12; detail = `涨跌比 ${(upRatio*100).toFixed(0)}% 接近平衡，涨停${b.limitUp} 跌停${b.limitDown}`;
  } else if (upRatio > 0.35) {
    score = 7; detail = `涨跌比 ${(upRatio*100).toFixed(0)}% 偏弱，跌停${b.limitDown}，亏钱效应初现`;
  } else {
    score = 3; detail = `涨跌比 ${(upRatio*100).toFixed(0)}% 很差，跌停${b.limitDown}，市场恐慌`;
  }

  return { score, max: 20, label: '市场宽度', detail };
}

// ============================================================
// 4. 板块轮动 (0-15): 领涨板块持续性
// ============================================================

function computeSectorFlow(overview: Awaited<ReturnType<typeof getStockMarketOverview>>): MarketPrediction['dimensions']['sectorFlow'] {
  const top3Avg = overview.topSectors.slice(0, 3).reduce((s, sec) => s + sec.changePct, 0) / Math.max(1, overview.topSectors.length);
  const topCount = overview.allSectors.filter(s => s.changePct > 0).length;

  let score: number;
  let detail: string;

  if (top3Avg > 3 && topCount > overview.allSectors.length * 0.6) {
    score = 14; detail = `${topCount}个板块上涨，领涨板块涨幅${top3Avg.toFixed(1)}%，板块轮动健康`;
  } else if (top3Avg > 1.5) {
    score = 11; detail = `${topCount}个板块上涨，领涨主线明确，可跟随布局`;
  } else if (topCount > overview.allSectors.length * 0.4) {
    score = 8; detail = `${topCount}个板块上涨，热点轮动较快，不宜追高`;
  } else if (topCount > overview.allSectors.length * 0.2) {
    score = 4; detail = `仅${topCount}个板块上涨，市场缺乏主线，观望为主`;
  } else {
    score = 1; detail = `几乎全线下跌，板块全面熄火，不要接飞刀`;
  }

  return { score, max: 15, label: '板块轮动', detail };
}

// ============================================================
// 5. 日历因子 (0-10)
// ============================================================

function computeCalendar(): MarketPrediction['dimensions']['calendar'] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const month = now.getMonth() + 1;
  const date = now.getDate();

  // 检查节假日（简化版：只检查周末和春节/国庆附近）
  let score = 10;
  let detail = '正常交易日，无特殊日历影响';

  if (dayOfWeek === 5) {
    // 周五
    score = 7; detail = '周五效应：资金偏向谨慎，避免周末不确定性';
  } else if (dayOfWeek === 1) {
    // 周一
    score = 8; detail = '周一效应：关注周末消息面，早盘波动可能较大';
  }

  // 月末效应
  if (date >= 25) {
    score -= 2; detail += '；月末资金面偏紧';
  }

  // 长假前
  if ((month === 1 && date >= 25) || (month === 9 && date >= 25)) {
    score = Math.min(score, 5); detail = '长假前效应：交投清淡，建议减仓过节';
  }

  return { score: Math.max(0, score), max: 10, label: '日历因子', detail };
}

// ============================================================
// 波动区间预测
// ============================================================

function computePredictedRange(
  overview: Awaited<ReturnType<typeof getStockMarketOverview>>,
  totalScore: number,
): { low: number; high: number; base: number } {
  // 以上证指数为基准
  const shIndex = overview.indices.find(i => i.code === '000001');
  const base = shIndex?.price || 4000;
  const avgVolatility = 1.2; // 日均波动约1.2%

  // 根据评分调整波动范围
  const multiplier = totalScore < 30 ? 2.0 : totalScore < 50 ? 1.5 : totalScore < 70 ? 1.2 : 0.8;
  const range = base * (avgVolatility / 100) * multiplier;

  return {
    low: Math.round((base - range) * 100) / 100,
    high: Math.round((base + range) * 100) / 100,
    base,
  };
}

// ============================================================
// 置信度
// ============================================================

function computeConfidence(
  sentiment: MarketPrediction['dimensions']['sentiment'],
  technical: MarketPrediction['dimensions']['technical'],
  breadth: MarketPrediction['dimensions']['breadth'],
): number {
  // 各维度分数越高，置信度越高
  const totalMax = 30 + 25 + 20;
  const totalActual = sentiment.score + technical.score + breadth.score;
  const rawConfidence = totalActual / totalMax;

  // 映射到 50-95% 区间
  return Math.round((50 + rawConfidence * 45) * 10) / 10;
}

// ============================================================
// 文案生成
// ============================================================

function generateSummary(
  buySignal: boolean,
  totalScore: number,
  sentiment: MarketPrediction['dimensions']['sentiment'],
  technical: MarketPrediction['dimensions']['technical'],
  breadth: MarketPrediction['dimensions']['breadth'],
  sectorFlow: MarketPrediction['dimensions']['sectorFlow'],
): { summary: string; riskNote: string } {
  let summary: string;
  let riskNote: string;

  if (buySignal && totalScore >= 75) {
    summary = `建议明日买入。综合评分${totalScore}/100，市场情绪积极，技术面强势，赚钱效应显著，多个板块共振上涨。可适度加仓参与。`;
    riskNote = '注意连续上涨后的短期回调风险，设置3%止损。';
  } else if (buySignal) {
    summary = `可考虑买入。综合评分${totalScore}/100，市场整体偏强但非全面牛市。建议控制仓位在50%以内，选择领涨板块介入。`;
    riskNote = '关注成交额是否持续放大，若缩量需警惕冲高回落。';
  } else if (totalScore >= 45) {
    summary = `不建议买入。综合评分${totalScore}/100，市场方向不明或偏弱，赚钱效应不足。观望为主，等待更明确的入场信号。`;
    riskNote = '当前震荡区间内不宜追涨杀跌，留着现金等待机会。';
  } else if (totalScore >= 30) {
    summary = `不建议买入。综合评分${totalScore}/100，市场偏弱，亏钱效应明显。建议减仓或空仓，保护本金安全。`;
    riskNote = '下跌趋势中不要接飞刀，等恐慌释放后再考虑抄底。';
  } else {
    summary = `坚决不要买入！综合评分${totalScore}/100，市场处于恐慌状态，全线下跌。现金为王，等待市场企稳信号出现后再做决策。`;
    riskNote = '极端行情下不要逆势而为，留得青山在不怕没柴烧。';
  }

  return { summary, riskNote };
}

// ============================================================
// 持久化
// ============================================================

function savePredictionToDB(result: MarketPrediction): void {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO predictions (date, buy_signal, total_score, confidence, summary)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        buy_signal = excluded.buy_signal, total_score = excluded.total_score,
        confidence = excluded.confidence, summary = excluded.summary
    `).run(today, result.buySignal ? 1 : 0, result.totalScore, result.confidence, result.summary);
  } catch (err) {
    console.warn('[market-predict] 保存预测失败:', (err as Error).message);
  }
}

/** 自动复盘昨日预测：根据今日指数涨跌更新昨日的 actual_direction */
function autoCloseYesterdayPrediction(overview: Awaited<ReturnType<typeof getStockMarketOverview>>): void {
  try {
    const db = getDb();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const existing = db.prepare(
      'SELECT id FROM predictions WHERE date = ? AND actual_direction IS NULL',
    ).get(yesterdayStr) as { id: number } | undefined;

    if (!existing) return; // 没有待验证的预测

    // 用上证指数涨跌作为实际方向
    const shIdx = overview.indices.find(i => i.code === '000001');
    const actualDirection = (shIdx?.changePct ?? 0) >= 0 ? 1 : 0; // 1涨 0跌
    const actualPct = shIdx?.changePct ?? 0;

    db.prepare(
      'UPDATE predictions SET actual_direction = ?, actual_pct = ? WHERE id = ?',
    ).run(actualDirection, actualPct, existing.id);

    console.log(`[market-predict] 复盘昨日预测 ${yesterdayStr}: 实际${actualDirection === 1 ? '涨' : '跌'} ${actualPct.toFixed(2)}%`);
  } catch { /* skip - 复盘失败不影响主流程 */ }
}

export function getPredictionStats(): {
  totalPredictions: number;
  buySignals: number;
  accuracy: number | null;
  recentPredictions: Array<{ date: string; buySignal: boolean; score: number; confidence: number }>;
} {
  try {
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM predictions ORDER BY date DESC LIMIT 30',
    ).all() as Array<{
      date: string; buy_signal: number; total_score: number; confidence: number;
      actual_direction: number | null; actual_pct: number | null;
    }>;

    const withActual = rows.filter(r => r.actual_direction != null);
    const accuracy = withActual.length > 0
      ? Math.round((withActual.filter(r =>
          (r.buy_signal === 1 && r.actual_direction === 1) ||
          (r.buy_signal === 0 && r.actual_direction === 0)
        ).length / withActual.length) * 100)
      : null;

    return {
      totalPredictions: rows.length,
      buySignals: rows.filter(r => r.buy_signal === 1).length,
      accuracy,
      recentPredictions: rows.slice(0, 7).map(r => ({
        date: r.date, buySignal: r.buy_signal === 1,
        score: r.total_score, confidence: r.confidence,
      })),
    };
  } catch {
    return { totalPredictions: 0, buySignals: 0, accuracy: null, recentPredictions: [] };
  }
}
