// ============================================================
// 股票筛选器 — 多条件筛选 + 六维评分排序
//
// 三层漏斗: 条件粗筛 → 六维评分 → 排序输出
// 每次请求实时计算，结果短时缓存 60 秒。
// ============================================================

import type { StockInfo, StockScore } from '@allin/shared';
import { fetchAllStocks, fetchStockKLine, getMockStocks, getMockKLine, type StockKLine } from '../adapters/stock.js';
import { scoreStock, getStockGrade } from './stock-scoring.js';

// ============================================================
// 类型
// ============================================================

export interface StockScreenerFilters {
  minPE?: number;
  maxPE?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  industry?: string;
  minROE?: number;
  minRevenueGrowth?: number;
  excludeST?: boolean;
}

export interface ScreenedStock {
  code: string;
  name: string;
  industry: string;
  marketCap: number;
  pe: number;
  pb: number;
  roe: number;
  score: StockScore;
  currentPrice: number;
  priceDate: string;
  ret5d: number;
  ret30d: number;
  maxDrawdown: number;
  sharpe: number;
  volatility: number;
}

export interface StockScreenerResult {
  filters: StockScreenerFilters;
  stocks: ScreenedStock[];
  totalScanned: number;
  coarsePassed: number;
  generatedAt: string;
}

// ============================================================
// 缓存
// ============================================================

const cache = new Map<string, { data: StockScreenerResult; at: number }>();
const CACHE_TTL_MS = 60_000; // 60 秒

// ============================================================
// 主入口
// ============================================================

export async function runStockScreener(
  filters: StockScreenerFilters = {},
): Promise<StockScreenerResult> {
  const cacheKey = JSON.stringify(filters);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    console.log(`[stock-screener] 返回缓存结果（${Math.round((now - cached.at) / 1000)}秒前）`);
    return cached.data;
  }

  console.log('[stock-screener] 开始筛选...', filters);

  // Step 1: 获取全量A股
  const allStocks = await fetchAllStocks();

  // Step 2: 粗筛
  let passed = coarseFilter(allStocks, filters);
  console.log(`[stock-screener] 粗筛: ${allStocks.length} → ${passed.length}`);

  // 如果结果过少，放宽条件
  if (passed.length < 10 && Object.keys(filters).length > 0) {
    console.log('[stock-screener] 结果过少，放宽市值条件...');
    const relaxed = { ...filters };
    delete relaxed.minMarketCap;
    delete relaxed.maxMarketCap;
    passed = coarseFilter(allStocks, relaxed);
    console.log(`[stock-screener] 放宽后: ${passed.length}`);
  }

  // 限制候选数量（取市值前 60 以保证性能）
  if (passed.length > 60) {
    passed.sort((a, b) => b.marketCap - a.marketCap);
    passed = passed.slice(0, 60);
  }

  const totalScanned = allStocks.length;
  const coarsePassed = passed.length;

  // Step 3: 批量获取K线并评分
  const klineMap = new Map<string, StockKLine[]>();
  const batchSize = 10;
  for (let i = 0; i < passed.length; i += batchSize) {
    const batch = passed.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(s => fetchStockKLine(s.code)),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value.length >= 5) {
        klineMap.set(batch[j].code, r.value);
      } else {
        klineMap.set(batch[j].code, getMockKLine(batch[j].code));
      }
    }
  }

  // Step 4: 评分 + 构建输出
  const screened: ScreenedStock[] = [];
  for (const stock of passed) {
    const klines = klineMap.get(stock.code) || getMockKLine(stock.code);
    const score = scoreStock(stock, klines);
    const lastK = klines[klines.length - 1];

    screened.push({
      code: stock.code,
      name: stock.name,
      industry: stock.industry,
      marketCap: stock.marketCap,
      pe: stock.pe,
      pb: stock.pb,
      roe: stock.roe,
      score,
      currentPrice: lastK?.close ?? 0,
      priceDate: lastK?.date ?? '',
      ret5d: calcReturnFrom(klines, 5),
      ret30d: calcReturnFrom(klines, 30),
      maxDrawdown: Math.round(calcMaxDrawdown(klines) * 100) / 100,
      sharpe: Math.round(calcSharpe(klines) * 100) / 100,
      volatility: Math.round(calcVolatility(klines) * 100) / 100,
    });
  }

  // 排序：按总分降序
  screened.sort((a, b) => b.score.total - a.score.total);

  console.log(`[stock-screener] 完成: 输出 ${screened.length} 只`);

  const result: StockScreenerResult = {
    filters,
    stocks: screened,
    totalScanned,
    coarsePassed,
    generatedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, { data: result, at: now });
  return result;
}

// ============================================================
// 粗筛
// ============================================================

function coarseFilter(all: StockInfo[], filters: StockScreenerFilters): StockInfo[] {
  return all.filter(s => {
    // ST 过滤
    if (filters.excludeST !== false) {
      if (s.name.includes('ST') || s.name.includes('*ST')) return false;
      if (s.name.includes('退市')) return false;
    }

    // PE 范围
    if (filters.minPE != null && s.pe > 0 && s.pe < filters.minPE) return false;
    if (filters.maxPE != null && s.pe > 0 && s.pe > filters.maxPE) return false;

    // 市值范围（亿）
    if (filters.minMarketCap != null && s.marketCap > 0 && s.marketCap < filters.minMarketCap) return false;
    if (filters.maxMarketCap != null && s.marketCap > 0 && s.marketCap > filters.maxMarketCap) return false;

    // 行业
    if (filters.industry && !s.industry.includes(filters.industry)) return false;

    // ROE
    if (filters.minROE != null && s.roe < filters.minROE) return false;

    // 营收增速
    if (filters.minRevenueGrowth != null && s.revenueGrowth < filters.minRevenueGrowth) return false;

    return true;
  });
}

// ============================================================
// K线指标
// ============================================================

function calcReturnFrom(klines: StockKLine[], days: number): number {
  if (klines.length < 2) return 0;
  const idx = Math.max(0, klines.length - 1 - Math.min(days, klines.length - 1));
  const start = klines[idx].close;
  const end = klines[klines.length - 1].close;
  if (start <= 0) return 0;
  return ((end - start) / start) * 100;
}

function calcMaxDrawdown(klines: StockKLine[]): number {
  let peak = klines[0]?.close ?? 0;
  let maxDD = 0;
  for (const k of klines) {
    if (k.close > peak) peak = k.close;
    const dd = ((peak - k.close) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function calcSharpe(klines: StockKLine[]): number {
  const returns: number[] = [];
  for (let i = 1; i < klines.length; i++) returns.push(klines[i].dailyReturn || 0);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  return std > 0 ? (mean / std) * Math.sqrt(252) : 0;
}

function calcVolatility(klines: StockKLine[]): number {
  const returns: number[] = [];
  for (let i = 1; i < klines.length; i++) returns.push(klines[i].dailyReturn || 0);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

// ============================================================
// 自测
// ============================================================

async function selfTest(): Promise<void> {
  console.log('========================================');
  console.log('[stock-screener] 自测开始');
  console.log('========================================\n');

  const result = await runStockScreener({
    minPE: 10,
    maxPE: 40,
    minMarketCap: 100,
    minROE: 10,
  });

  console.log(`\n筛选结果: ${result.stocks.length} 只（扫描 ${result.totalScanned}，粗筛通过 ${result.coarsePassed}）\n`);

  for (let i = 0; i < Math.min(result.stocks.length, 10); i++) {
    const s = result.stocks[i];
    console.log(
      `#${i+1} ${s.code} ${s.name.padEnd(16)} ` +
      `${s.score.total}/100 ${s.industry} PE=${s.pe} ROE=${s.roe}%`,
    );
  }

  console.log('\n========================================');
  console.log('[stock-screener] 自测完成');
  console.log('========================================');
}

const isDirectRun = process.argv[1]?.endsWith('stock-screener.ts') || process.argv[1]?.endsWith('stock-screener.js');
if (isDirectRun) {
  selfTest().catch(err => { console.error(err); process.exit(1); });
}
