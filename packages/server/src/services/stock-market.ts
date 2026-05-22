// ============================================================
// A股市场概览服务
//
// 实时指数行情 + 板块排名 + 市场宽度 + 热门个股
// 数据来源：东方财富行情API
// ============================================================

import { fetchAllStocks } from '../adapters/stock.js';
import { readMCPCache } from './mcp-cache.js';

// ============================================================
// 类型
// ============================================================

export interface IndexQuote {
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  upCount: number;
  downCount: number;
}

export interface SectorPerformance {
  name: string;
  changePct: number;
  upCount: number;
  downCount: number;
  leadingStock: string; // 领涨股
}

export interface MarketBreadth {
  totalStocks: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  limitUp: number;   // 涨停数
  limitDown: number;  // 跌停数
  upPct: number;
}

export interface MarketOverview {
  indices: IndexQuote[];
  topSectors: SectorPerformance[];
  bottomSectors: SectorPerformance[];
  allSectors: SectorPerformance[];
  breadth: MarketBreadth;
  hotStocks: Array<{ code: string; name: string; changePct: number; reason: string }>;
  mcpData: {
    fearGreedIndex: number;
    marketTemperature: number;
    forwardLook: string;
    hotSectors: string[];
  } | null;
  generatedAt: string;
}

// ============================================================
// 主流指数代码
// ============================================================

const MAJOR_INDICES = [
  { secid: '1.000001', code: '000001', name: '上证指数' },
  { secid: '0.399001', code: '399001', name: '深证成指' },
  { secid: '0.399006', code: '399006', name: '创业板指' },
  { secid: '1.000688', code: '000688', name: '科创50' },
  { secid: '1.000300', code: '000300', name: '沪深300' },
];

// ============================================================
// 缓存
// ============================================================

let cachedOverview: MarketOverview | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000; // 30秒

// ============================================================
// 获取指数行情
// ============================================================

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchIndexQuotes(): Promise<IndexQuote[]> {
  try {
    const secids = MAJOR_INDICES.map(i => i.secid).join(',');
    const url = `http://push2.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f2,f3,f4,f12,f14,f104,f105`;
    const resp = await fetchWithTimeout(url);
    if (!resp || !resp.ok) {
      console.warn('[stock-market] 指数行情API请求失败');
      return [];
    }

    const body = await resp.json() as { data?: { diff?: Array<Record<string, unknown>> } };
    if (!body.data?.diff || body.data.diff.length === 0) {
      console.warn('[stock-market] 指数行情数据为空');
      return [];
    }

    return body.data.diff.map((item: Record<string, unknown>) => {
      const code = String(item.f12 || '');
      const idxInfo = MAJOR_INDICES.find(i => i.code === code);
      const rawPrice = Number(item.f2 || 0);
      const price = rawPrice > 10000 ? rawPrice / 100 : rawPrice;
      const rawChange = Number(item.f4 || 0);
      return {
        code,
        name: idxInfo?.name || String(item.f14 || ''),
        price: Math.round(price * 100) / 100,
        change: Math.round(rawChange) / 100,
        changePct: Math.round(Number(item.f3 || 0)) / 100,
        upCount: Number(item.f104 || 0),
        downCount: Number(item.f105 || 0),
      };
    });
  } catch (err) {
    console.warn('[stock-market] 指数行情获取异常:', (err as Error).message);
    return [];
  }
}

// ============================================================
// 板块表现（从东方财富 API 获取真实数据）
// ============================================================

async function getSectorPerformance(): Promise<{ all: SectorPerformance[]; top: SectorPerformance[]; bottom: SectorPerformance[] }> {
  // 1. 优先使用东方财富行业板块 API（真实数据）
  const realSectors = await fetchRealSectorData();
  if (realSectors.length >= 10) {
    const sorted = [...realSectors].sort((a, b) => b.changePct - a.changePct);
    return {
      all: sorted,
      top: sorted.slice(0, 5),
      bottom: sorted.slice(-5).reverse(),
    };
  }

  // 2. API失败则返回空（不再虚构数据）
  console.warn('[stock-market] 板块数据获取失败，返回空列表');
  return { all: [], top: [], bottom: [] };
}

/** 从东方财富获取行业板块实时行情 */
async function fetchRealSectorData(): Promise<SectorPerformance[]> {
  try {
    // 东方财富行业板块 API
    const url = 'http://push2.eastmoney.com/api/qt/clist/get?' +
      'pn=1&pz=50&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&' +
      'fields=f2,f3,f4,f12,f14,f104,f105,f128';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!resp || !resp.ok) return [];

    const body = await resp.json() as { data?: { diff?: Array<Record<string, unknown>> } };
    if (!body.data?.diff) return [];

    return body.data.diff.map((item: Record<string, unknown>) => ({
      name: String(item.f14 || ''),
      changePct: Math.round(Number(item.f3 || 0) * 100) / 100,
      upCount: Number(item.f104 || 0),
      downCount: Number(item.f105 || 0),
      leadingStock: String(item.f128 || '--'),
    }));
  } catch {
    return [];
  }
}

// ============================================================
// 市场宽度
// ============================================================

function getMarketBreadth(): MarketBreadth {
  const mcp = readMCPCache();
  if (mcp.updatedAt && mcp.upCount > 0) {
    const total = mcp.upCount + mcp.downCount;
    return {
      totalStocks: total || 5467,
      upCount: mcp.upCount,
      downCount: mcp.downCount,
      flatCount: Math.max(0, 5467 - total),
      limitUp: 0,
      limitDown: 0,
      upPct: total > 0 ? Math.round((mcp.upCount / total) * 10000) / 100 : 0,
    };
  }
  // MCP 缓存为空时返回 0 值而不是随机数
  return { totalStocks: 0, upCount: 0, downCount: 0, flatCount: 0, limitUp: 0, limitDown: 0, upPct: 0 };
}

// ============================================================
// 热门个股（从近期热点模拟）
// ============================================================

/** 基于 MCP 热门板块动态生成热门个股 */
function getHotStocks(): Array<{ code: string; name: string; changePct: number; reason: string }> {
  const mcp = readMCPCache();
  const hotSectors = mcp.hotSectors || [];

  // 热门板块→代表性个股映射（中小盘为主）
  const sectorStockMap: Record<string, Array<{ code: string; name: string; reason: string }>> = {
    '航运港口': [{ code: '601872', name: '招商轮船', reason: '航运运价上行，全球贸易复苏' }],
    '玻璃玻纤': [{ code: '600176', name: '中国巨石', reason: '玻纤龙头，新能源拉动需求' }],
    '航空机场': [{ code: '600029', name: '南方航空', reason: '出行需求复苏，客座率提升' }],
    '电池': [{ code: '300750', name: '宁德时代', reason: '动力电池全球龙头' }, { code: '300014', name: '亿纬锂能', reason: '储能+动力双轮驱动' }],
    '减速器': [{ code: '688017', name: '绿的谐波', reason: '机器人减速器国产替代' }],
    '汽车零部件': [{ code: '603786', name: '科博达', reason: '汽车电子控制器龙头' }],
    '证券II': [{ code: '300059', name: '东方财富', reason: '互联网券商龙头' }],
    '医疗器械': [{ code: '300529', name: '健帆生物', reason: '血液净化器械龙头' }],
    '小金属': [{ code: '603993', name: '洛阳钼业', reason: '全球铜钴龙头' }],
    '保险II': [{ code: '601318', name: '中国平安', reason: '保险龙头' }],
    '家电零部件': [{ code: '002050', name: '三花智控', reason: '热管理零部件龙头' }],
  };

  const stocks: Array<{ code: string; name: string; changePct: number; reason: string }> = [];

  for (const sector of hotSectors.slice(0, 6)) {
    const candidates = sectorStockMap[sector];
    if (candidates) {
      for (const c of candidates) {
        if (!stocks.find(s => s.code === c.code)) {
          stocks.push({ ...c, changePct: 0 });
        }
      }
    }
  }

  // 不足5只时补充默认中小盘热门
  if (stocks.length < 5) {
    const defaults = [
      { code: '300502', name: '新易盛', reason: 'CPO光模块龙头，800G需求旺盛' },
      { code: '300308', name: '中际旭创', reason: '光模块龙头，AI算力核心供应商' },
      { code: '688041', name: '海光信息', reason: '国产AI芯片，算力自主可控' },
      { code: '300394', name: '天孚通信', reason: '光器件龙头，CPO产业链受益' },
      { code: '603019', name: '中科曙光', reason: '算力基建，国产服务器龙头' },
    ];
    for (const d of defaults) {
      if (!stocks.find(s => s.code === d.code)) {
        stocks.push({ ...d, changePct: 0 });
      }
    }
  }

  return stocks.slice(0, 6);
}

// ============================================================
// 主入口
// ============================================================

export async function getStockMarketOverview(forceRefresh = false): Promise<MarketOverview> {
  const now = Date.now();
  if (!forceRefresh && cachedOverview && now - cachedAt < CACHE_TTL_MS) {
    return cachedOverview;
  }

  console.log('[stock-market] 正在生成市场概览...');

  const [indices, sectorData] = await Promise.all([
    fetchIndexQuotes(),
    getSectorPerformance(),
  ]);

  const breadth = getMarketBreadth();
  const hotStocks = getHotStocks();

  // 读取 MCP 真实市场情绪数据
  let mcpData = null;
  try {
    const mcp = readMCPCache();
    if (mcp.updatedAt) {
      mcpData = {
        fearGreedIndex: mcp.fearGreedIndex,
        marketTemperature: mcp.marketTemperature,
        forwardLook: mcp.forwardLook,
        hotSectors: mcp.hotSectors,
      };
    }
  } catch { /* skip */ }

  const overview: MarketOverview = {
    indices,
    topSectors: sectorData.top,
    bottomSectors: sectorData.bottom,
    allSectors: sectorData.all,
    breadth,
    hotStocks,
    mcpData,
    generatedAt: new Date().toISOString(),
  };

  cachedOverview = overview;
  cachedAt = now;

  console.log(`[stock-market] 完成：${indices.length}个指数 ${sectorData.all.length}个板块`);
  return overview;
}

// ============================================================
// 自测
// ============================================================

async function selfTest(): Promise<void> {
  console.log('========================================');
  console.log('[stock-market] 自测开始');
  console.log('========================================\n');

  const overview = await getStockMarketOverview(true);

  console.log('--- 指数 ---');
  for (const idx of overview.indices) {
    console.log(`  ${idx.name}: ${idx.price.toFixed(2)} ${idx.changePct >= 0 ? '+' : ''}${idx.changePct.toFixed(2)}%`);
  }

  console.log('\n--- 领涨板块 Top 5 ---');
  for (const s of overview.topSectors) {
    console.log(`  ${s.name}: ${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`);
  }

  console.log('\n--- 领跌板块 Bottom 5 ---');
  for (const s of overview.bottomSectors) {
    console.log(`  ${s.name}: ${s.changePct.toFixed(2)}%`);
  }

  console.log('\n--- 市场宽度 ---');
  console.log(`  涨${overview.breadth.upCount} 跌${overview.breadth.downCount} 平${overview.breadth.flatCount} 涨停${overview.breadth.limitUp} 跌停${overview.breadth.limitDown}`);

  console.log('\n========================================');
  console.log('[stock-market] 自测完成');
  console.log('========================================');
}

const isDirectRun = process.argv[1]?.endsWith('stock-market.ts') || process.argv[1]?.endsWith('stock-market.js');
if (isDirectRun) {
  selfTest().catch(err => { console.error(err); process.exit(1); });
}
