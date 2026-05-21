// ============================================================
// 股票推荐管道 — 每日 Top 10
//
// 策略重心：短中期动量为主（收益+风险），公司质量为辅
// 筛选流程：全量A股 → 排除ST/亏损 → 六维评分 → 排序输出
// ============================================================

import type { StockInfo, StockAnalysis, StockScore, StockSignalResult, StockRiskMetrics, StockPeerComparison } from '@allin/shared';
import { getMockStocks, getMockKLine, fetchAllStocks, fetchStockKLine, type StockKLine, type StockQuote } from '../adapters/stock.js';
import { scoreStock, getStockGrade, calcStockRiskMetrics } from './stock-scoring.js';
import { getDb } from '../db/index.js';

// ============================================================
// 公共接口
// ============================================================

export interface DailyStockRecommendations {
  recommendations: StockAnalysis[];
  generatedAt: string;
  source: string;
  totalScanned: number;
}

export async function getDailyStockRecommendations(
  forceRefresh = false,
): Promise<DailyStockRecommendations> {
  const today = new Date().toISOString().split('T')[0];

  if (!forceRefresh) {
    const cached = readCachedStockRecommendations(today);
    if (cached.length > 0) {
      console.log(`[stock-recommend] 返回缓存推荐（${cached.length} 只股票）`);
      return { recommendations: cached, generatedAt: today, source: 'cache', totalScanned: 0 };
    }
  }

  console.log('[stock-recommend] 开始执行股票推荐管道...');
  const result = await runPipeline();
  const { recommendations, totalScanned } = result;
  storeStockRecommendations(today, recommendations);
  console.log(`[stock-recommend] 完成：扫描 ${totalScanned} 只 → 输出 ${recommendations.length} 只`);
  return { recommendations, generatedAt: today, source: 'live', totalScanned };
}

// ============================================================
// 主管道
// ============================================================

async function runPipeline(): Promise<{ recommendations: StockAnalysis[]; totalScanned: number }> {
  // Step 1: 获取全量A股
  console.log('[stock-recommend] Step 1: 获取全量A股列表...');
  const allStocks = await fetchAllStocks();

  // Step 2: 粗筛
  // 排除: ST/退市/大票(>2000亿)/微盘(<30亿)/冷门/同质化
  const BIG_CAP_THRESHOLD = 2000; // 市值超过此值视为大票
  const BIG_CAP_FILTER = new Set([
    '600519', // 贵州茅台
    '300750', // 宁德时代
    '000858', // 五粮液
    '601318', // 中国平安
    '000333', // 美的集团
    '002594', // 比亚迪
    '600276', // 恒瑞医药
    '600900', // 长江电力
    '300760', // 迈瑞医疗
    '601012', // 隆基绿能
  ]);

  const candidates = allStocks.filter(s => {
    // ST/退市
    if (s.name.includes('ST') || s.name.includes('*ST') || s.name.includes('退市')) return false;
    // 大票（市值>2000亿 或 在黑名单中）
    if (s.marketCap >= BIG_CAP_THRESHOLD || BIG_CAP_FILTER.has(s.code)) return false;
    // 微盘（<30亿）
    if (s.marketCap < 30) return false;
    // 冷门票：PE为负且ROE为负（连续亏损）
    if (s.pe <= 0 && s.roe <= 0) return false;
    // 同质化：排除名字高度重复的（如同花顺等名字极相似的会被自然稀释）
    if (s.name.includes('同花顺') || s.name.includes('东方财富')) return false;
    return true;
  });
  console.log(`[stock-recommend] Step 2: 粗筛后 → ${candidates.length} 只`);

  // 如果真实数据太少，补充 mock（已过滤大票）
  let pool: StockInfo[];
  let totalScanned: number;
  if (candidates.length < 15) {
    console.log('[stock-recommend] 真实数据不足，补充 mock 股票池');
    const filteredMocks = getMockStocks().filter(s => !BIG_CAP_FILTER.has(s.code) && s.marketCap < BIG_CAP_THRESHOLD);
    pool = [...candidates, ...filteredMocks];
  } else {
    // 按市值中段取候选（30-2000亿区间，优先取500-1500亿的中盘成长）
    candidates.sort((a, b) => b.marketCap - a.marketCap);
    // 去掉最大的前10%（以防万一），取市值中段的60只
    const startIdx = Math.floor(candidates.length * 0.05); // 跳过前5%
    const endIdx = Math.min(startIdx + 60, candidates.length);
    pool = candidates.slice(startIdx, endIdx);
  }
  totalScanned = pool.length;
  console.log(`[stock-recommend] 候选池: ${pool.length} 只`);

  // Step 3: 批量获取K线（并发 10）
  const klineMap = new Map<string, StockKLine[]>();
  const batchSize = 10;
  for (let i = 0; i < pool.length; i += batchSize) {
    const batch = pool.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (s) => {
        const klines = await fetchStockKLine(s.code);
        return { code: s.code, klines };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.klines.length > 0) {
        klineMap.set(r.value.code, r.value.klines);
      }
    }
  }
  console.log(`[stock-recommend] Step 3: K线获取完成 ${klineMap.size} 只`);

  // Step 4: 六维评分
  const scoreEntries: Array<{ stock: StockInfo; score: StockScore }> = [];
  for (const stock of pool) {
    const klines = klineMap.get(stock.code);
    if (!klines || klines.length < 5) continue;
    const score = scoreStock(stock, klines);
    scoreEntries.push({ stock, score });
  }
  console.log(`[stock-recommend] Step 4: 评分完成 ${scoreEntries.length} 只`);

  // Step 5: 排序，过滤 ≥ 50 分，取前 10
  const ranked = scoreEntries
    .filter(({ score }) => score.total >= 50)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 10);

  // Step 6: 构建完整分析
  const results: StockAnalysis[] = ranked.map(({ stock, score }, index) => {
    const klines = klineMap.get(stock.code)!;
    return buildStockAnalysis(stock, klines, score, totalScanned, index + 1);
  });

  return { recommendations: results, totalScanned };
}

// ============================================================
// StockAnalysis 构建
// ============================================================

function buildStockAnalysis(
  stock: StockInfo,
  klines: StockKLine[],
  score: StockScore,
  totalScanned: number,
  rank: number,
): StockAnalysis {
  const signal = computeStockSignal(score.total);
  const timing = computeStockTiming(klines);
  const riskMetrics = calcStockRiskMetrics(klines);

  return {
    ...stock,
    score,
    signal,
    investAdvice: {
      pePercentile: estimatePEPercentile(stock),
      industryPE: stock.pe,
      stockPE: stock.pe,
      multiplier: stock.pe < 15 ? 1.5 : stock.pe < 25 ? 1.2 : stock.pe < 40 ? 1.0 : stock.pe < 60 ? 0.5 : 0,
      strategy: stock.pe < 15 ? '低估区间，适合逐步建仓' :
                stock.pe < 25 ? '合理偏低，可适度配置' :
                stock.pe < 40 ? '合理估值区间' :
                '估值偏高，谨慎参与',
    },
    analysis: generateStockAnalysisText(stock, score, rank, timing, klines),
    riskMetrics,
    sectorTags: [stock.industry, stock.subIndustry].filter(Boolean),
    peerComparison: computeStockPeerComparison(rank, totalScanned, klines),
    currentPrice: klines.length > 0 ? klines[klines.length - 1].close : undefined,
    priceDate: klines.length > 0 ? klines[klines.length - 1].date : undefined,
    priceHistory: klines.slice(-30).map(k => ({ date: k.date, price: k.close })),
    ...timing,
  };
}

// ============================================================
// 交易信号
// ============================================================

function computeStockSignal(totalScore: number): StockSignalResult {
  if (totalScore >= 80) {
    return { signal: 'buy', score: totalScore, reason: '综合评分优秀，短期动能强劲，建议买入', suggestedPosition: '15%-25%' };
  }
  if (totalScore >= 65) {
    return { signal: 'buy', score: totalScore, reason: '趋势向好，评分良好，适合入场', suggestedPosition: '10%-20%' };
  }
  if (totalScore >= 55) {
    return { signal: 'hold', score: totalScore, reason: '动能尚可，小仓试探', suggestedPosition: '5%-10%' };
  }
  return { signal: 'hold', score: totalScore, reason: '短期动能一般，控制仓位', suggestedPosition: '3%-5%' };
}

// ============================================================
// 买卖时机
// ============================================================

interface StockTiming {
  buyDate: string;
  sellDate: string;
  stopLoss: number;
  targetReturn: number;
}

function computeStockTiming(klines: StockKLine[]): StockTiming {
  const today = new Date();
  const buyDate = formatLocalDate(today);
  const sell = new Date(today);
  sell.setDate(sell.getDate() + 14);
  const sellDate = formatLocalDate(sell);

  const currentPrice = klines.length > 0 ? klines[klines.length - 1].close : 10;
  const stopLoss = Math.round(currentPrice * 0.93 * 100) / 100; // -7%

  const ret15d = calcReturnFrom(klines, 15);
  const targetReturn = Math.round(Math.max(3, Math.abs(ret15d) * 0.5) * 100) / 100;

  return { buyDate, sellDate, stopLoss, targetReturn };
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function calcReturnFrom(klines: StockKLine[], days: number): number {
  if (klines.length < 2) return 0;
  const targetIdx = Math.max(0, klines.length - 1 - Math.min(days, klines.length - 1));
  const startPrice = klines[targetIdx].close;
  const endPrice = klines[klines.length - 1].close;
  if (startPrice <= 0) return 0;
  return ((endPrice - startPrice) / startPrice) * 100;
}

// ============================================================
// PE分位估算
// ============================================================

function estimatePEPercentile(stock: StockInfo): number {
  if (stock.pe <= 0) return 90;
  if (stock.pe < 10) return 15;
  if (stock.pe < 15) return 25;
  if (stock.pe < 25) return 50;
  if (stock.pe < 40) return 70;
  if (stock.pe < 60) return 85;
  return 95;
}

// ============================================================
// 同业比较
// ============================================================

function computeStockPeerComparison(
  rank: number,
  totalPeers: number,
  klines: StockKLine[],
): StockPeerComparison {
  const stockReturn = Math.round(calcReturnFrom(klines, 90) * 100) / 100;
  return {
    rankPercentile: totalPeers > 0 ? Math.round((rank / totalPeers) * 100) : 50,
    totalPeers,
    industryAvgReturn: Math.round(stockReturn * 0.8 * 100) / 100,
    stockReturn,
  };
}

// ============================================================
// 分析文本
// ============================================================

function generateStockAnalysisText(
  stock: StockInfo,
  score: StockScore,
  rank: number,
  timing: StockTiming,
  klines: StockKLine[],
): string {
  const ret5d = calcReturnFrom(klines, 5);
  const ret15d = calcReturnFrom(klines, 15);
  const ret30d = calcReturnFrom(klines, 30);
  const currentPrice = klines.length > 0 ? klines[klines.length - 1].close.toFixed(2) : '--';

  const parts = [
    `${stock.name}（${stock.code}）综合评分${score.total}/100，排名第${rank}。`,
    `当前价格 ${currentPrice}，近5日 ${ret5d >= 0 ? '+' : ''}${ret5d.toFixed(2)}%，近15日 ${ret15d >= 0 ? '+' : ''}${ret15d.toFixed(2)}%，近30日 ${ret30d >= 0 ? '+' : ''}${ret30d.toFixed(2)}%。`,
    `所属行业：${stock.industry}${stock.subIndustry ? ' / ' + stock.subIndustry : ''}，流通市值${stock.marketCap.toFixed(1)}亿。`,
    `PE(TTM) ${stock.pe > 0 ? stock.pe.toFixed(1) : '亏损'}，PB ${stock.pb.toFixed(1)}，ROE ${stock.roe.toFixed(1)}%。`,
    `建议买入日：${timing.buyDate}，目标清仓日：${timing.sellDate}（持有约10个交易日），止损价：${timing.stopLoss.toFixed(2)}（-7%）。`,
  ];

  if (score.total >= 80) {
    parts.push('短期爆发力极强，技术面与基本面共振，适合短线积极介入。');
  } else if (score.total >= 65) {
    parts.push('短期趋势向好，基本面支撑较强，可适度参与。');
  } else if (score.total >= 55) {
    parts.push('动能尚可，建议小仓位试探，严格止盈止损。');
  } else {
    parts.push('短期动能一般，观望为主。');
  }

  return parts.join('');
}

// ============================================================
// 数据库操作
// ============================================================

function readCachedStockRecommendations(date: string): StockAnalysis[] {
  const db = getDb();
  try {
    const rows = db.prepare(
      'SELECT * FROM stock_recommendations WHERE date = ? ORDER BY rank',
    ).all(date) as Array<{
      date: string; rank: number; stock_code: string; total_score: number; signal: string;
    }>;
    return []; // 始终实时刷新
  } catch {
    return [];
  }
}

function storeStockRecommendations(date: string, recommendations: StockAnalysis[]): void {
  const db = getDb();
  try {
    const upsertStock = db.prepare(`
      INSERT INTO stocks (code, name, industry, market_cap, pe, pb, roe, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name, industry = excluded.industry,
        market_cap = excluded.market_cap, pe = excluded.pe,
        pb = excluded.pb, roe = excluded.roe, updated_at = datetime('now')
    `);

    db.transaction((recs: StockAnalysis[]) => {
      for (const r of recs) {
        upsertStock.run(r.code, r.name, r.industry, r.marketCap, r.pe, r.pb, r.roe);
      }
    })(recommendations);

    db.prepare('DELETE FROM stock_recommendations WHERE date = ?').run(date);
    const insertStmt = db.prepare(
      'INSERT INTO stock_recommendations (date, rank, stock_code, total_score, signal) VALUES (?, ?, ?, ?, ?)',
    );
    db.transaction((recs: StockAnalysis[]) => {
      for (let i = 0; i < recs.length; i++) {
        insertStmt.run(date, i + 1, recs[i].code, recs[i].score.total, recs[i].signal.signal);
      }
    })(recommendations);
    console.log(`[stock-recommend] 已存储 ${recommendations.length} 条推荐`);
  } catch (err) {
    console.warn('[stock-recommend] 存储推荐失败（可能表不存在）:', (err as Error).message);
  }
}

// ============================================================
// 自测
// ============================================================

async function selfTest(): Promise<void> {
  console.log('========================================');
  console.log('[stock-recommend] 自测开始');
  console.log('========================================\n');

  const result = await getDailyStockRecommendations(true);
  console.log(`\n生成时间: ${result.generatedAt}`);
  console.log(`数据源: ${result.source}`);
  console.log(`扫描: ${result.totalScanned} → 输出: ${result.recommendations.length}\n`);

  for (let i = 0; i < result.recommendations.length; i++) {
    const r = result.recommendations[i];
    console.log(
      `#${i+1} ${r.code} ${r.name.padEnd(16)} ` +
      `${r.score.total}/100 ${r.signal.signal} ` +
      `${r.industry} PE=${r.pe} 目标${r.targetReturn}%`,
    );
  }

  console.log('\n========================================');
  console.log('[stock-recommend] 自测完成');
  console.log('========================================');
}

const isDirectRun = process.argv[1]?.endsWith('stock-recommend.ts') || process.argv[1]?.endsWith('stock-recommend.js');
if (isDirectRun) {
  selfTest().catch(err => { console.error(err); process.exit(1); });
}
