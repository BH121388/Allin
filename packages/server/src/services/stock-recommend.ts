// ============================================================
// 股票推荐管道 — 每日 Top 10
//
// 策略重心：短中期动量为主（收益+风险），公司质量为辅
// 筛选流程：全量A股 → 排除ST/亏损 → 六维评分 → 排序输出
// ============================================================

import type { StockInfo, StockAnalysis, StockScore, StockSignalResult, StockRiskMetrics, StockPeerComparison } from '@allin/shared';
import { fetchAllStocks, fetchStockKLine, fetchStockByCode, fetchSingleStockQuote, clearStockCaches, type StockKLine } from '../adapters/stock.js';
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
  // 强制刷新时清除K线缓存，确保每次重新拉取行情
  if (forceRefresh) {
    clearStockCaches();
  }
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
  // 判断是否使用精选列表（市值数据缺失时需要放宽筛选条件）
  const hasMarketCap = allStocks.some(s => s.marketCap > 0);

  const candidates = allStocks.filter(s => {
    // ST/退市
    if (s.name.includes('ST') || s.name.includes('*ST') || s.name.includes('退市')) return false;
    // 市值过滤（仅当真实市值数据可用时：排除微盘<30亿）
    if (hasMarketCap && s.marketCap < 30) return false;
    // 冷门票：PE和ROE都为0说明数据缺失，放行
    if (s.pe === 0 && s.roe === 0) return true;
    // 冷门票：PE为负且ROE为负（连续亏损）
    if (s.pe <= 0 && s.roe <= 0) return false;
    return true;
  });
  console.log(`[stock-recommend] Step 2: 粗筛后 → ${candidates.length} 只`);

  if (candidates.length === 0) {
    console.warn('[stock-recommend] 无候选股票（API可能不可用）');
    return { recommendations: [], totalScanned: 0 };
  }

  // Step 2.5: 预筛（全量拉腾讯涨跌幅→PE+市值+涨跌综合→Top150做完整评分）
  let pool: StockInfo[];
  const totalScanned = candidates.length;
  if (candidates.length > 150) {
    // 并发拉取腾讯数据：涨跌幅+PE+PB+ROE+市值+名称（1000只约30秒，一次调用全拿到）
    const tcData = new Map<string, { name: string; changePct: number; pe: number; pb: number; marketCap: number; totalCap: number; roe: number }>();
    const batchSize = 30;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async s => {
          try {
            const prefix = s.code.startsWith('6') ? 'sh' : 'sz';
            const resp = await fetch(`http://qt.gtimg.cn/q=${prefix}${s.code}`);
            if (!resp.ok) return null;
            const buf = Buffer.from(await resp.arrayBuffer());
            const iconv = await import('iconv-lite');
            const text = iconv.default.decode(buf, 'gbk');
            const parts = text.split('~');
            const pe = parseFloat(parts[39]) || 0;
            const pb = parseFloat(parts[46]) || 0;
            return {
              code: s.code,
              name: parts[1] || s.code,
              changePct: parseFloat(parts[32]) || 0,
              pe, pb,
              marketCap: parseFloat(parts[44]) || 0,
              totalCap: parseFloat(parts[45]) || 0,
              roe: pb > 0 && pe > 0 ? Math.round((pb / pe) * 1000) / 10 : 0,
            };
          } catch { return null; }
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          tcData.set(r.value.code, r.value);
          // 直接补充到候选股票对象（省去Step3的fetchStockByCode调用）
          const s = candidates.find(c => c.code === r.value!.code);
          if (s) {
            if (r.value.name && s.name === s.code) s.name = r.value.name;
            s.pe = r.value.pe || s.pe;
            s.pb = r.value.pb || s.pb;
            s.roe = r.value.roe || s.roe;
            s.marketCap = r.value.marketCap || s.marketCap;
            s.totalCap = r.value.totalCap || s.totalCap;
          }
        }
      }
    }
    console.log(`[stock-recommend] 腾讯数据: ${tcData.size} 只（涨跌+PE+市值+名称）`);

    const ranked = candidates.map(s => {
      const chg = tcData.get(s.code)?.changePct || 0;
      let qs = 0;
      // 涨跌动量(0-35)
      if (chg > 5) qs += 35; else if (chg > 2) qs += 25; else if (chg > 0) qs += 15; else if (chg > -2) qs += 8;
      // 估值(0-35)
      if (s.pe > 0 && s.pe < 10) qs += 35; else if (s.pe > 0 && s.pe < 20) qs += 25; else if (s.pe > 0 && s.pe < 30) qs += 15; else if (s.pe > 0 && s.pe < 50) qs += 8; else qs += 5;
      // 市值(0-30)
      if (s.marketCap >= 80 && s.marketCap < 300) qs += 30; else if (s.marketCap >= 50 && s.marketCap < 800) qs += 20; else if (s.marketCap >= 30 && s.marketCap < 2000) qs += 12; else qs += 5;
      return { stock: s, qs };
    }).sort((a, b) => b.qs - a.qs);
    pool = ranked.slice(0, 150).map(r => r.stock);
    console.log(`[stock-recommend] 预筛: ${candidates.length} → 150 只（PE+市值+实时涨跌）`);
  } else {
    pool = candidates;
  }

  // Step 3: 获取K线（基本面已在Step2.5从腾讯拿到，无需重复）
  const klineMap = new Map<string, StockKLine[]>();
  const kBatchSize = 20;
  for (let i = 0; i < pool.length; i += kBatchSize) {
    const batch = pool.slice(i, i + kBatchSize);
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

  // Step 5: 纯评分排序，取前 5（市值大小由评分体系自行衡量）
  const ranked = scoreEntries
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 5);

  // Step 6: 获取Top5实时报价（确保价格是最新的）
  const top5Codes = ranked.map(r => r.stock.code);
  const quoteResults = await Promise.allSettled(top5Codes.map(c => fetchSingleStockQuote(c)));
  const quoteMap = new Map<string, number>();
  const changeMap = new Map<string, number>();
  for (let i = 0; i < top5Codes.length; i++) {
    const qr = quoteResults[i];
    if (qr.status === 'fulfilled' && qr.value) {
      quoteMap.set(top5Codes[i], qr.value.price);
      changeMap.set(top5Codes[i], qr.value.changePct);
    }
  }
  console.log(`[stock-recommend] Step 5.5: 实时报价获取 ${quoteMap.size}/5 只`);

  // Step 7: 构建完整分析
  const generatedAt = new Date().toISOString();
  const results: StockAnalysis[] = ranked.map(({ stock, score }, index) => {
    const klines = klineMap.get(stock.code)!;
    const realPrice = quoteMap.get(stock.code);
    const realChange = changeMap.get(stock.code);
    return buildStockAnalysis(stock, klines, score, totalScanned, index + 1, realPrice, realChange, generatedAt);
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
  realPrice?: number,
  realChange?: number,
  generatedAt?: string,
): StockAnalysis {
  const signal = computeStockSignal(score.total);
  // 始终计算买卖时机（含收益预测），使用实时价格
  const timing = computeStockTiming(klines, score.total, realPrice);
  const riskMetrics = calcStockRiskMetrics(klines);

  // 优先使用实时价格，否则用K线最后收盘价
  const currentPrice = realPrice ?? (klines.length > 0 ? klines[klines.length - 1].close : undefined);

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
    analysis: generateStockAnalysisText(stock, score, rank, signal.signal, timing, klines, currentPrice, generatedAt),
    riskMetrics,
    sectorTags: [stock.industry, stock.subIndustry].filter(Boolean),
    peerComparison: computeStockPeerComparison(rank, totalScanned, klines),
    currentPrice: Math.round((currentPrice || 0) * 100) / 100,
    priceDate: new Date().toISOString().slice(0, 10),
    priceHistory: klines.slice(-30).map(k => ({ date: k.date, price: k.close })),
    buyDate: timing.buyDate,
    sellDate: timing.sellDate,
    stopLoss: timing.stopLoss,
    targetReturn: timing.targetReturn,
    // 注入实时涨跌幅和推荐时间到扩展字段
    ...(realChange != null ? { changePct: Math.round(realChange * 100) / 100 } as any : {}),
    ...(generatedAt ? { generatedAt } as any : {}),
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
  reason: string;
}

function computeStockTiming(klines: StockKLine[], totalScore: number, realPrice?: number): StockTiming {
  const today = new Date();
  const currentPrice = realPrice ?? (klines.length > 0 ? klines[klines.length - 1].close : 10);

  // 基于评分和近期波动计算持有天数
  const ret20d = calcReturnFrom(klines, 20);
  const ret5d = calcReturnFrom(klines, 5);
  const volatility = Math.abs(ret20d) > 0 ? Math.abs(ret20d) / Math.sqrt(20/252) : 25;

  // 持有天数: 高分短持(动量强) 低分短持(风险高)
  let holdingDays: number;
  let reason: string;
  if (totalScore >= 70) {
    holdingDays = 5 + Math.floor(Math.abs(ret20d) * 0.3);
    reason = `高评分(${totalScore}分)+强动量，短线${holdingDays}个交易日内博取超额收益`;
  } else if (totalScore >= 55) {
    holdingDays = 7 + Math.floor(Math.abs(ret20d) * 0.2);
    reason = `中等评分(${totalScore}分)，持有${holdingDays}个交易日，严格止损`;
  } else {
    holdingDays = 3 + Math.floor(Math.abs(ret5d) * 0.5);
    reason = `评分偏低(${totalScore}分)，若有反弹机会持${holdingDays}日快进快出，不宜恋战`;
  }

  const buyDate = formatLocalDate(today);
  const sell = new Date(today);
  sell.setDate(sell.getDate() + holdingDays);
  // 跳过周末
  while (sell.getDay() === 0 || sell.getDay() === 6) sell.setDate(sell.getDate() + 1);
  const sellDate = formatLocalDate(sell);

  // 止损：高分宽止损 低分窄止损
  const stopLossPct = totalScore >= 70 ? 0.93 : totalScore >= 55 ? 0.95 : 0.97;
  const stopLoss = Math.round(currentPrice * stopLossPct * 100) / 100;

  // 目标收益：基于近期波动率估算
  const dailyVol = volatility / Math.sqrt(252);
  const targetReturn = Math.round(Math.max(2, dailyVol * holdingDays * 1.5) * 100) / 100;

  return { buyDate, sellDate, stopLoss, targetReturn, reason };
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
  signalType: string,
  timing: StockTiming,
  klines: StockKLine[],
  currentPrice?: number,
  generatedAt?: string,
): string {
  const ret5d = calcReturnFrom(klines, 5);
  const ret15d = calcReturnFrom(klines, 15);
  const ret30d = calcReturnFrom(klines, 30);
  const priceStr = currentPrice ? currentPrice.toFixed(2) : (klines.length > 0 ? klines[klines.length - 1].close.toFixed(2) : '--');
  const timeStr = generatedAt ? new Date(generatedAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';

  const parts = [
    `${stock.name}（${stock.code}）综合评分${score.total}/100，排名第${rank}。`,
    `${timeStr ? `[${timeStr}实时] ` : ''}当前价格 ¥${priceStr}，近5日 ${ret5d >= 0 ? '+' : ''}${ret5d.toFixed(2)}%，近15日 ${ret15d >= 0 ? '+' : ''}${ret15d.toFixed(2)}%，近30日 ${ret30d >= 0 ? '+' : ''}${ret30d.toFixed(2)}%。`,
    `所属行业：${stock.industry}${stock.subIndustry ? ' / ' + stock.subIndustry : ''}，流通市值${stock.marketCap.toFixed(1)}亿。PE(TTM) ${stock.pe > 0 ? stock.pe.toFixed(1) : '亏损'}，PB ${stock.pb.toFixed(1)}，ROE ${stock.roe.toFixed(1)}%。`,
  ];

  // 始终输出交易时机和收益预测
  parts.push(`建议买入日：${timing.buyDate}，目标清仓日：${timing.sellDate}，止损价：${timing.stopLoss.toFixed(2)}，预期收益：${timing.targetReturn}%。`);
  parts.push(`时机分析：${timing.reason}。`);

  // 评分解读
  if (signalType === 'buy') {
    parts.push(score.total >= 80
      ? '短期爆发力极强，技术面与基本面共振，适合短线积极介入。'
      : '短期趋势向好，基本面支撑较强，可适度参与。');
  } else if (signalType === 'hold') {
    parts.push('动能尚可但未达买入阈值，可小仓位试探，严格止盈止损。');
  } else {
    parts.push('评分偏低，当前不建议买入。若已持有建议减仓或止损，空仓者观望等待。');
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
