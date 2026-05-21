// ============================================================
// 股票数据适配器 — 东方财富 + 新浪行情
//
// 从东方财富公开接口获取A股数据，网络异常时自动降级
// 为 mock 数据。所有导出函数都不会抛出异常。
// ============================================================

import type { StockInfo, StockKLine } from '@allin/shared';

// ============================================================
// 本地类型
// ============================================================

export { type StockKLine } from '@allin/shared';

// ============================================================
// API URL 常量
// ============================================================

const STOCK_LIST_URL = 'http://82.push2.eastmoney.com/api/qt/clist/get';
const KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const SINA_QUOTE_URL = 'https://hq.sinajs.cn/list=';

const REQUEST_TIMEOUT_MS = 5_000;

// ============================================================
// 内部辅助
// ============================================================

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function marketPrefix(code: string): string {
  if (code.startsWith('6')) return 'sh';
  if (code.startsWith('0') || code.startsWith('3') || code.startsWith('2')) return 'sz';
  if (code.startsWith('8') || code.startsWith('4')) return 'bj';
  return 'sz';
}

// ============================================================
// 股票列表缓存
// ============================================================

let cachedStockList: StockInfo[] | null = null;
let cachedStockListAt = 0;
const STOCK_LIST_CACHE_TTL_MS = 10 * 60 * 1000;

// ============================================================
// 获取全量A股列表
// ============================================================

export async function fetchAllStocks(): Promise<StockInfo[]> {
  if (cachedStockList && Date.now() - cachedStockListAt < STOCK_LIST_CACHE_TTL_MS) {
    return cachedStockList;
  }

  console.log('[stock-adapter] 正在从东方财富获取A股列表...');

  const params = new URLSearchParams({
    pn: '1',
    pz: '10000',
    po: '1',
    np: '1',
    fltt: '2',
    invt: '2',
    fid: 'f3',
    fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
    fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f37,f100,f115,f116,f117',
  });

  const url = `${STOCK_LIST_URL}?${params.toString()}`;

  try {
    const resp = await fetchWithTimeout(url);
    if (!resp || !resp.ok) throw new Error('Request failed');

    const body = await resp.json() as {
      data?: { diff?: Array<Record<string, unknown>>; total?: number };
    };

    if (!body.data?.diff) throw new Error('Invalid response');

    const stocks: StockInfo[] = body.data.diff.map((item: Record<string, unknown>) => {
      const pe = Number(item.f9 || 0);
      const pb = Number(item.f23 || 0);
      const roeRaw = Number(item.f37 || 0);
      // ROE: API返回的f37如果是百分比已经是百分数，如果是小数需要*100
      const roe = Math.abs(roeRaw) < 1 ? roeRaw * 100 : roeRaw;
      return {
        code: String(item.f12 || ''),
        name: String(item.f14 || ''),
        industry: String(item.f100 || ''),
        subIndustry: '',
        marketCap: Number(item.f20 || 0) / 1e8,
        totalCap: Number(item.f21 || 0) / 1e8,
        pe,
        pb,
        roe: Math.round(roe * 10) / 10,
        revenueGrowth: Number(item.f115 || 0),
        profitGrowth: Number(item.f116 || 0),
        netProfitMargin: 0,
        inception: String(item.f117 || ''),
        exchange: String(item.f13 || ''),
      };
    }).filter(s => s.code && /^\d{6}$/.test(s.code));

    console.log(`[stock-adapter] 成功获取 ${stocks.length} 只A股`);
    cachedStockList = stocks;
    cachedStockListAt = Date.now();
    return stocks;
  } catch (err) {
    console.warn('[stock-adapter] 股票列表获取失败，降级为 mock 数据:', (err as Error).message);
    const result = getMockStocks();
    cachedStockList = result;
    cachedStockListAt = Date.now();
    return result;
  }
}

// ============================================================
// K线数据缓存
// ============================================================

const klineCache = new Map<string, { data: StockKLine[]; at: number }>();
const KLINE_CACHE_TTL_MS = 5 * 60 * 1000;

// ============================================================
// 获取K线数据
// ============================================================

export async function fetchStockKLine(code: string, days = 90): Promise<StockKLine[]> {
  const cacheKey = `${code}_${days}`;
  const cached = klineCache.get(cacheKey);
  if (cached && Date.now() - cached.at < KLINE_CACHE_TTL_MS) {
    return cached.data;
  }

  console.log(`[stock-adapter] 正在获取 ${code} K线数据...`);

  const prefix = code.startsWith('6') ? '1' : '0';
  const secid = `${prefix}.${code}`;

  const params = new URLSearchParams({
    secid,
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57',
    klt: '101',    // 日K
    fqt: '1',      // 前复权
    end: '20500101',
    lmt: String(Math.min(days + 10, 200)),
  });

  const url = `${KLINE_URL}?${params.toString()}`;

  try {
    const resp = await fetchWithTimeout(url);
    if (!resp || !resp.ok) throw new Error('Request failed');

    const body = await resp.json() as {
      data?: { klines?: string[] };
    };

    if (!body.data?.klines || body.data.klines.length === 0) {
      throw new Error('No kline data');
    }

    const klines: StockKLine[] = body.data.klines.map((line: string) => {
      const parts = line.split(',');
      const close = parseFloat(parts[2]);
      const prevClose = klines.length > 0
        ? klines[klines.length - 1].close
        : parseFloat(parts[1]);

      return {
        date: parts[0],
        open: parseFloat(parts[1]),
        close,
        high: parseFloat(parts[3]),
        low: parseFloat(parts[4]),
        volume: parseFloat(parts[5]),
        dailyReturn: prevClose > 0
          ? parseFloat((((close - prevClose) / prevClose) * 100).toFixed(4))
          : 0,
      };
    });

    // 计算每日收益率
    for (let i = 1; i < klines.length; i++) {
      const prev = klines[i - 1].close;
      const curr = klines[i].close;
      if (prev > 0 && klines[i].dailyReturn === 0) {
        klines[i].dailyReturn = parseFloat((((curr - prev) / prev) * 100).toFixed(4));
      }
    }

    const result = klines.slice(-days);
    klineCache.set(cacheKey, { data: result, at: Date.now() });
    console.log(`[stock-adapter] 成功获取 ${code} ${result.length} 条K线`);
    return result;
  } catch (err) {
    console.warn(`[stock-adapter] ${code} K线获取失败，降级为 mock:`, (err as Error).message);
    const result = getMockKLine(code, days);
    klineCache.set(cacheKey, { data: result, at: Date.now() });
    return result;
  }
}

// ============================================================
// 单只股票直接查询（搜索兜底）
// ============================================================

/** 直接查询单只股票基本信息，优先用东方财富，兜底用新浪 */
export async function fetchStockByCode(code: string): Promise<StockInfo | null> {
  // 1. 尝试东方财富 push2 API
  try {
    const prefix = code.startsWith('6') ? '1' : '0';
    const secid = `${prefix}.${code}`;
    const fields = ['f2', 'f3', 'f4', 'f9', 'f12', 'f13', 'f14', 'f20', 'f21', 'f23', 'f37', 'f100', 'f115', 'f116', 'f117'];
    const url = `http://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields.join(',')}`;

    const resp = await fetchWithTimeout(url);
    if (resp && resp.ok) {
      const body = await resp.json() as { data?: Record<string, unknown> };
      if (body.data && body.data.f12) {
        const d = body.data;
        const pe = Number(d.f9 || 0);
        const roeRaw = Number(d.f37 || 0);
        return {
          code: String(d.f12), name: String(d.f14 || ''), industry: String(d.f100 || ''), subIndustry: '',
          marketCap: Number(d.f20 || 0) / 1e8, totalCap: Number(d.f21 || 0) / 1e8,
          pe, pb: Number(d.f23 || 0),
          roe: Math.abs(roeRaw) < 1 ? Math.round(roeRaw * 1000) / 10 : Math.round(roeRaw * 10) / 10,
          revenueGrowth: Number(d.f115 || 0), profitGrowth: Number(d.f116 || 0),
          netProfitMargin: 0, inception: String(d.f117 || ''), exchange: String(d.f13 || ''),
        };
      }
    }
  } catch { /* fall through */ }

  // 2. 兜底：新浪行情 API（已验证可用），从价格数据反推基本信息
  try {
    const quote = await fetchSingleStockQuote(code);
    if (quote && quote.price > 0) {
      // 从新浪 API 获取基本名称
      const prefix = code.startsWith('6') ? 'sh' : 'sz';
      const url = `https://hq.sinajs.cn/list=${prefix}${code}`;
      const resp = await fetchWithTimeout(url, { headers: { Referer: 'https://finance.sina.com.cn/' } });
      if (resp && resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const iconv = await import('iconv-lite');
        const text = iconv.default.decode(buf, 'gbk');
        const m = text.match(/"([^"]*)"/);
        if (m) {
          const fields = m[1].split(',');
          const name = fields[0] || code;
          const exchange = code.startsWith('6') ? 'SH' : code.startsWith('0') || code.startsWith('3') ? 'SZ' : 'BJ';
          return {
            code, name, industry: '', subIndustry: '',
            marketCap: 0, totalCap: 0, pe: 0, pb: 0, roe: 0,
            revenueGrowth: 0, profitGrowth: 0, netProfitMargin: 0,
            inception: '', exchange,
          };
        }
      }
    }
  } catch { /* fall through */ }

  return null;
}

// ============================================================
// 实时行情 — 新浪接口
// ============================================================

const quoteCache = new Map<string, { data: StockQuote | null; at: number }>();
const QUOTE_CACHE_TTL_MS = 30 * 1000;

export interface StockQuote {
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  amount: number;
}

export async function fetchSingleStockQuote(code: string): Promise<StockQuote | null> {
  const cached = quoteCache.get(code);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_TTL_MS) return cached.data;

  try {
    const prefix = marketPrefix(code);
    const url = `${SINA_QUOTE_URL}${prefix}${code}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(url, {
      headers: { Referer: 'https://finance.sina.com.cn/' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp || !resp.ok) return null;

    const buf = Buffer.from(await resp.arrayBuffer());
    const iconv = await import('iconv-lite');
    const text = iconv.default.decode(buf, 'gbk');
    const m = text.match(/"([^"]*)"/);
    if (!m) return null;

    const fields = m[1].split(',');
    if (fields.length < 32) return null;

    const open = parseFloat(fields[1]);
    const prevClose = parseFloat(fields[2]);
    const price = parseFloat(fields[3]);
    const high = parseFloat(fields[4]);
    const low = parseFloat(fields[5]);
    const volume = parseFloat(fields[8]);
    const amount = parseFloat(fields[9]);

    let changePct = 0;
    let change = 0;
    if (prevClose > 0 && price > 0) {
      change = price - prevClose;
      changePct = (change / prevClose) * 100;
    }

    const result: StockQuote = {
      price,
      prevClose,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      high,
      low,
      open,
      volume,
      amount,
    };

    quoteCache.set(code, { data: result, at: Date.now() });
    return result;
  } catch {
    quoteCache.set(code, { data: null, at: Date.now() });
    return null;
  }
}

/** 批量获取实时行情 */
export async function fetchStockQuotes(codes: string[]): Promise<Map<string, StockQuote>> {
  const result = new Map<string, StockQuote>();
  for (let i = 0; i < codes.length; i += 5) {
    const batch = codes.slice(i, i + 5);
    const items = await Promise.allSettled(batch.map(c => fetchSingleStockQuote(c)));
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      if (it.status === 'fulfilled' && it.value) {
        result.set(batch[j], it.value);
      }
    }
  }
  return result;
}

// ============================================================
// 基本面数据 — 东方财富个股行情API（含估值+财务指标）
// ============================================================

interface StockFundamentals {
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  netProfitMargin: number;
  inception: string;
  subIndustry: string;
}

const fundCache = new Map<string, { data: StockFundamentals; at: number }>();
const FUND_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2小时

/**
 * 从东方财富个股行情 API 获取基本面数据。
 * 接口: push2.eastmoney.com/api/qt/stock/get
 * 字段: f9=PE, f23=PB, f37=ROE, f20=流通市值, f21=总市值,
 *       f100=行业, f115=营收增速, f116=利润增速, f117=上市日期
 */
export async function fetchStockFundamentals(code: string): Promise<StockFundamentals | null> {
  const cached = fundCache.get(code);
  if (cached && Date.now() - cached.at < FUND_CACHE_TTL_MS) return cached.data;

  try {
    const prefix = code.startsWith('6') ? '1' : '0';
    const secid = `${prefix}.${code}`;

    const fields = [
      'f9', 'f23', 'f37',       // PE, PB, ROE
      'f20', 'f21',              // 流通市值, 总市值
      'f100', 'f115', 'f116',    // 行业, 营收增速, 利润增速
      'f117', 'f40', 'f41',      // 上市日期, 主营收入, 净利润
      'f43', 'f44', 'f45',       // 毛利率, 净利率, 营收同比
      'f46',                      // 净利润同比
    ];

    const url = `http://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields.join(',')}`;

    const resp = await fetchWithTimeout(url);
    if (!resp || !resp.ok) throw new Error('Request failed');

    const body = await resp.json() as { data?: Record<string, unknown> };

    const data: StockFundamentals = {
      roe: 0,
      revenueGrowth: 0,
      profitGrowth: 0,
      netProfitMargin: 0,
      inception: '',
      subIndustry: '',
    };

    if (body.data) {
      const d = body.data;
      // ROE: 优先 f37（加权ROE），fallback 用 PE 推算
      const roeRaw = Number(d.f37);
      data.roe = !isNaN(roeRaw) && roeRaw !== 0 ? roeRaw
        : (Number(d.f9) > 0 ? Math.round((1 / Number(d.f9)) * 100 * 10) / 10 : 0);

      // 营收增速
      const revGrowth = Number(d.f115);
      data.revenueGrowth = !isNaN(revGrowth) ? revGrowth : Number(d.f45) || 0;

      // 净利润增速
      const profitGrowth = Number(d.f116);
      data.profitGrowth = !isNaN(profitGrowth) ? profitGrowth : Number(d.f46) || 0;

      // 净利率
      const netMargin = Number(d.f44);
      data.netProfitMargin = !isNaN(netMargin) && netMargin !== 0 ? netMargin
        : (Number(d.f43) || 0); // fallback: 毛利率

      data.subIndustry = String(d.f100 || '');
      data.inception = String(d.f117 || '').substring(0, 10);
    }

    // 基本面数据为空时用 mock 补全
    if (data.roe === 0 && data.revenueGrowth === 0) {
      const mockFund = getMockFundamentals(code);
      if (mockFund) {
        fundCache.set(code, { data: { ...data, ...mockFund }, at: Date.now() });
        return { ...data, ...mockFund };
      }
    }

    fundCache.set(code, { data, at: Date.now() });
    console.log(`[stock-adapter] 获取 ${code} 基本面: ROE=${data.roe}% 营收增速=${data.revenueGrowth}%`);
    return data;
  } catch (err) {
    console.warn(`[stock-adapter] ${code} 基本面获取失败:`, (err as Error).message);
    const mockFund = getMockFundamentals(code);
    if (mockFund) {
      fundCache.set(code, { data: mockFund, at: Date.now() });
      return mockFund;
    }
    return null;
  }
}

// ============================================================
// 东方财富财务摘要 API（获取更详细的财务数据）
// ============================================================

export interface FinancialSummary {
  reportDate: string;
  eps: number;           // 基本每股收益
  roe: number;           // 加权ROE
  revenueYoY: number;    // 营收同比(%)
  profitYoY: number;     // 净利润同比(%)
  netMargin: number;     // 净利率(%)
  grossMargin: number;   // 毛利率(%)
  totalRevenue: number;  // 营业总收入(亿)
  netProfit: number;     // 净利润(亿)
}

const finCache = new Map<string, { data: FinancialSummary; at: number }>();
const FIN_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4小时

export async function fetchFinancialSummary(code: string): Promise<FinancialSummary | null> {
  const cached = finCache.get(code);
  if (cached && Date.now() - cached.at < FIN_CACHE_TTL_MS) return cached.data;

  try {
    const filter = `(SECURITY_CODE="${code}")`;
    const url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?` +
      `reportName=RPT_DMSK_FN_MAININDICATOR&` +
      `columns=SECURITY_CODE,REPORT_DATE,BASIC_EPS,WEIGHTAVG_ROE,OPERATE_INCOME_YOY,NETPROFIT_YOY,NETPROFIT_MARGIN,GROSS_PROFIT_MARGIN,TOTAL_OPERATE_INCOME,NETPROFIT&` +
      `filter=${encodeURIComponent(filter)}&pageNumber=1&pageSize=1&sortTypes=-1&sortColumns=REPORT_DATE`;

    const resp = await fetchWithTimeout(url);
    if (!resp || !resp.ok) throw new Error('Request failed');

    const body = await resp.json() as {
      success?: boolean;
      result?: { data?: Array<Record<string, unknown>> };
    };

    if (!body.success || !body.result?.data?.[0]) {
      throw new Error('Empty response');
    }

    const d = body.result.data[0];
    const result: FinancialSummary = {
      reportDate: String(d.REPORT_DATE || '').substring(0, 10),
      eps: Number(d.BASIC_EPS) || 0,
      roe: Number(d.WEIGHTAVG_ROE) || 0,
      revenueYoY: Number(d.OPERATE_INCOME_YOY) || 0,
      profitYoY: Number(d.NETPROFIT_YOY) || 0,
      netMargin: Number(d.NETPROFIT_MARGIN) || 0,
      grossMargin: Number(d.GROSS_PROFIT_MARGIN) || 0,
      totalRevenue: (Number(d.TOTAL_OPERATE_INCOME) || 0) / 1e8,
      netProfit: (Number(d.NETPROFIT) || 0) / 1e8,
    };

    finCache.set(code, { data: result, at: Date.now() });
    console.log(`[stock-adapter] 获取 ${code} 财报: ROE=${result.roe}% 利润增速=${result.profitYoY}%`);
    return result;
  } catch (err) {
    console.warn(`[stock-adapter] ${code} 财报获取失败:`, (err as Error).message);
    return null;
  }
}

// ============================================================
// 综合获取股票完整信息
// ============================================================

export async function fetchStockDetail(code: string): Promise<{
  stock: StockInfo;
  klines: StockKLine[];
  quote: StockQuote | null;
  fundamentals: StockFundamentals | null;
} | null> {
  try {
    const [allStocks, klines, quote] = await Promise.all([
      fetchAllStocks(),
      fetchStockKLine(code),
      fetchSingleStockQuote(code),
    ]);

    const stock = allStocks.find(s => s.code === code);
    if (!stock) return null;

    const fundamentals = await fetchStockFundamentals(code);
    if (fundamentals) {
      stock.roe = fundamentals.roe;
      stock.revenueGrowth = fundamentals.revenueGrowth;
      stock.profitGrowth = fundamentals.profitGrowth;
      stock.netProfitMargin = fundamentals.netProfitMargin;
      stock.subIndustry = fundamentals.subIndustry || stock.subIndustry;
      stock.inception = stock.inception || fundamentals.inception;
    }

    return { stock, klines, quote, fundamentals };
  } catch {
    return null;
  }
}

// ============================================================
// Mock 数据 — 15 只代表性A股
// ============================================================

// 15只中小盘成长股 mock 池（排除大票>2000亿）
const MOCK_STOCKS: StockInfo[] = [
  // === 通信/光模块 ===
  {
    code: '300502', name: '新易盛', industry: '通信', subIndustry: '通信设备',
    marketCap: 680, totalCap: 720, pe: 45.8, pb: 8.5, roe: 18.2,
    revenueGrowth: 55.3, profitGrowth: 68.5, netProfitMargin: 22.4,
    inception: '2016-03-03', exchange: 'SZ',
  },
  {
    code: '300394', name: '天孚通信', industry: '通信', subIndustry: '通信设备',
    marketCap: 520, totalCap: 550, pe: 52.3, pb: 9.8, roe: 19.5,
    revenueGrowth: 42.8, profitGrowth: 58.2, netProfitMargin: 28.6,
    inception: '2015-02-17', exchange: 'SZ',
  },
  // === 半导体/芯片 ===
  {
    code: '688041', name: '海光信息', industry: '电子', subIndustry: '半导体',
    marketCap: 1650, totalCap: 1720, pe: 85.2, pb: 12.5, roe: 15.8,
    revenueGrowth: 65.3, profitGrowth: 82.5, netProfitMargin: 22.8,
    inception: '2022-08-12', exchange: 'SH',
  },
  {
    code: '688082', name: '盛美上海', industry: '电子', subIndustry: '半导体设备',
    marketCap: 580, totalCap: 620, pe: 48.5, pb: 7.2, roe: 16.5,
    revenueGrowth: 45.2, profitGrowth: 52.8, netProfitMargin: 26.4,
    inception: '2021-11-18', exchange: 'SH',
  },
  // === 机器人/自动化 ===
  {
    code: '688017', name: '绿的谐波', industry: '机械设备', subIndustry: '机器人',
    marketCap: 320, totalCap: 350, pe: 68.5, pb: 12.8, roe: 16.2,
    revenueGrowth: 38.5, profitGrowth: 45.2, netProfitMargin: 25.4,
    inception: '2020-08-28', exchange: 'SH',
  },
  {
    code: '002747', name: '埃斯顿', industry: '机械设备', subIndustry: '机器人',
    marketCap: 380, totalCap: 410, pe: 55.2, pb: 7.5, roe: 14.8,
    revenueGrowth: 32.5, profitGrowth: 38.6, netProfitMargin: 18.5,
    inception: '2015-03-20', exchange: 'SZ',
  },
  // === AI/算力 ===
  {
    code: '603019', name: '中科曙光', industry: '计算机', subIndustry: '服务器',
    marketCap: 1350, totalCap: 1420, pe: 42.5, pb: 6.8, roe: 17.2,
    revenueGrowth: 28.5, profitGrowth: 35.6, netProfitMargin: 15.8,
    inception: '2014-11-06', exchange: 'SH',
  },
  {
    code: '002230', name: '科大讯飞', industry: '计算机', subIndustry: 'AI',
    marketCap: 1550, totalCap: 1620, pe: 52.8, pb: 8.2, roe: 13.5,
    revenueGrowth: 22.5, profitGrowth: 28.3, netProfitMargin: 10.2,
    inception: '2008-05-12', exchange: 'SZ',
  },
  // === 新能源/储能 ===
  {
    code: '300763', name: '锦浪科技', industry: '电力设备', subIndustry: '逆变器',
    marketCap: 450, totalCap: 480, pe: 32.5, pb: 5.8, roe: 20.5,
    revenueGrowth: 38.2, profitGrowth: 45.6, netProfitMargin: 22.5,
    inception: '2019-03-19', exchange: 'SZ',
  },
  {
    code: '300274', name: '阳光电源', industry: '电力设备', subIndustry: '逆变器',
    marketCap: 1650, totalCap: 1780, pe: 28.5, pb: 6.2, roe: 25.8,
    revenueGrowth: 42.5, profitGrowth: 55.2, netProfitMargin: 18.6,
    inception: '2011-11-02', exchange: 'SZ',
  },
  // === 医药创新 ===
  {
    code: '300529', name: '健帆生物', industry: '医药生物', subIndustry: '医疗器械',
    marketCap: 380, totalCap: 420, pe: 35.8, pb: 8.5, roe: 25.2,
    revenueGrowth: 18.5, profitGrowth: 22.8, netProfitMargin: 38.5,
    inception: '2016-08-02', exchange: 'SZ',
  },
  {
    code: '300347', name: '泰格医药', industry: '医药生物', subIndustry: 'CRO',
    marketCap: 850, totalCap: 920, pe: 38.2, pb: 5.5, roe: 18.6,
    revenueGrowth: 25.8, profitGrowth: 32.5, netProfitMargin: 28.2,
    inception: '2012-08-17', exchange: 'SZ',
  },
  // === 智能驾驶/汽车电子 ===
  {
    code: '603786', name: '科博达', industry: '汽车', subIndustry: '汽车电子',
    marketCap: 350, totalCap: 380, pe: 42.5, pb: 6.8, roe: 17.5,
    revenueGrowth: 35.2, profitGrowth: 42.8, netProfitMargin: 22.5,
    inception: '2019-10-15', exchange: 'SH',
  },
  // === 军工/航天 ===
  {
    code: '002025', name: '航天电器', industry: '国防军工', subIndustry: '航天装备',
    marketCap: 420, totalCap: 450, pe: 38.5, pb: 5.8, roe: 16.8,
    revenueGrowth: 22.5, profitGrowth: 28.6, netProfitMargin: 18.5,
    inception: '2004-07-09', exchange: 'SZ',
  },
  // === 新材料 ===
  {
    code: '688116', name: '天奈科技', industry: '基础化工', subIndustry: '新材料',
    marketCap: 280, totalCap: 320, pe: 48.5, pb: 7.2, roe: 15.8,
    revenueGrowth: 42.5, profitGrowth: 52.8, netProfitMargin: 28.5,
    inception: '2019-09-25', exchange: 'SH',
  },
];

export function getMockStocks(): StockInfo[] {
  return [...MOCK_STOCKS];
}

// ============================================================
// Mock K线生成
// ============================================================

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngNormal(rng: () => number): number {
  const u1 = rng() || 0.0001;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getMockKLine(code: string, days = 90): StockKLine[] {
  const seed = hashCode(code + '_kline');
  const rng = createRNG(seed);

  // 起步价格 10-300 之间
  let price = 10 + rng() * 290;

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days + 1);

  const klines: StockKLine[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = formatDate(date);

    const dailyReturn = rngNormal(rng) * 1.5 + 0.03;
    const close = price * (1 + dailyReturn / 100);
    const open = price;
    const high = Math.max(open, close) * (1 + rng() * 0.02);
    const low = Math.min(open, close) * (1 - rng() * 0.02);
    const volume = (1000000 + rng() * 50000000) | 0;

    klines.push({
      date: dateStr,
      open: parseFloat(open.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      volume,
      dailyReturn: parseFloat(dailyReturn.toFixed(4)),
    });

    price = close;
  }

  return klines;
}

// ============================================================
// Mock 基本面
// ============================================================

function getMockFundamentals(code: string): StockFundamentals | null {
  const stock = MOCK_STOCKS.find(s => s.code === code);
  if (!stock) return null;
  return {
    roe: stock.roe,
    revenueGrowth: stock.revenueGrowth,
    profitGrowth: stock.profitGrowth,
    netProfitMargin: stock.netProfitMargin,
    inception: stock.inception,
    subIndustry: stock.subIndustry,
  };
}

// ============================================================
// 自测入口
// ============================================================

async function selfTest(): Promise<void> {
  console.log('========================================');
  console.log('[stock-adapter] 自测开始');
  console.log('========================================\n');

  console.log('--- getMockStocks() ---');
  const mockStocks = getMockStocks();
  console.log(`返回 ${mockStocks.length} 只股票`);
  for (const s of mockStocks.slice(0, 5)) {
    console.log(`  ${s.code} ${s.name} [${s.industry}] PE=${s.pe} ROE=${s.roe}%`);
  }

  console.log('\n--- getMockKLine("600519") ---');
  const klines = getMockKLine('600519', 30);
  console.log(`返回 ${klines.length} 条K线`);
  if (klines.length > 0) {
    console.log(`  首日: ${klines[0].date} close=${klines[0].close}`);
    console.log(`  末日: ${klines[klines.length-1].date} close=${klines[klines.length-1].close}`);
  }

  console.log('\n--- fetchAllStocks() ---');
  const allStocks = await fetchAllStocks();
  console.log(`获取到 ${allStocks.length} 只股票`);

  console.log('\n--- fetchStockKLine("000001") ---');
  const realKLine = await fetchStockKLine('000001', 5);
  console.log(`获取到 ${realKLine.length} 条K线`);

  console.log('\n========================================');
  console.log('[stock-adapter] 自测完成');
  console.log('========================================');
}

const isDirectRun = process.argv[1]?.endsWith('stock.ts') || process.argv[1]?.endsWith('stock.js');
if (isDirectRun) {
  selfTest().catch(err => { console.error(err); process.exit(1); });
}
