// ============================================================
// 天天基金 (eastmoney) API 适配器
//
// 从天天基金公开接口获取中国基金数据，网络异常时自动降级
// 为 mock 数据。所有导出函数都不会抛出异常。
// ============================================================

import type { FundInfo } from '@allin/shared';

// ============================================================
// 本地类型
// ============================================================

export interface NAVEntry {
  date: string;       // YYYY-MM-DD
  nav: number;        // 单位净值
  accNav: number;     // 累计净值
  dailyReturn: number; // 日收益率 (%)
}

// ============================================================
// API URL 常量
// ============================================================

const FUND_LIST_URL = 'http://fund.eastmoney.com/js/fundcode_search.js';
const FUND_NAV_URL = 'https://api.fund.eastmoney.com/f10/lsjz';

// 超时 5 秒
const REQUEST_TIMEOUT_MS = 5_000;

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 带超时的 fetch 封装。
 * 返回 Response 或 null（任何异常都返回 null）。
 */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析天天基金基金列表的 JS 变量赋值格式：
 *   var r = [["000001","华夏成长","华夏基金","混合型"],...];
 *
 * 提取 [...] 并解析为 JSON。
 * 返回解析后的二维数组，失败返回 null。
 */
function parseFundListJS(text: string): string[][] | null {
  try {
    // 去除 var r = 前缀和尾部分号
    const trimmed = text.trim();

    // 尝试匹配 var r=... 或 var r = ...
    const match = trimmed.match(/var\s+r\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
    const jsonStr = match ? match[1] : trimmed;

    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) return null;

    // 验证每个元素都是长度 >= 4 的数组（实际 5 列：code,pinyin_abbr,name,type,pinyin_full）
    for (const item of parsed) {
      if (!Array.isArray(item) || item.length < 4) return null;
    }

    return parsed as string[][];
  } catch {
    return null;
  }
}

// ============================================================
// 真实 API 获取
// ============================================================

/**
 * 从天天基金获取全量基金列表。
 * 失败自动降级为 mock 数据。
 */
export async function fetchAllFunds(): Promise<FundInfo[]> {
  console.log('[eastmoney] 正在从天天基金获取基金列表...');

  const response = await fetchWithTimeout(FUND_LIST_URL);

  if (!response || !response.ok) {
    console.warn('[eastmoney] 基金列表 API 请求失败，降级为 mock 数据');
    return getMockFunds();
  }

  try {
    const text = await response.text();
    const rows = parseFundListJS(text);

    if (!rows || rows.length === 0) {
      console.warn('[eastmoney] 基金列表解析失败，降级为 mock 数据');
      return getMockFunds();
    }

    // API 返回格式: [code, pinyin_abbr, name, type, pinyin_full]
    const funds: FundInfo[] = rows.map((row) => ({
      code: row[0],
      name: row[2] || row[1],    // row[2] = 中文名称, 降级用 row[1]
      type: row[3] || '',
      company: '',
      manager: '',
      tenure: '',
      managerReturn: '',
      scale: 0,
      inception: '',
    }));

    console.log(`[eastmoney] 成功获取 ${funds.length} 只基金`);
    return funds;
  } catch (err) {
    console.warn('[eastmoney] 基金列表处理异常，降级为 mock 数据:', err);
    return getMockFunds();
  }
}

/**
 * 从天天基金获取单只基金的历史净值。
 *
 * @param code   基金代码
 * @param days   获取天数，默认 90
 */
export async function fetchFundNAV(code: string, days = 90): Promise<NAVEntry[]> {
  console.log(`[eastmoney] 正在获取基金 ${code} 近 ${days} 日净值...`);

  const url = `${FUND_NAV_URL}?fundCode=${code}&pageIndex=1&pageSize=${Math.min(days, 100)}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      Referer: 'https://fund.eastmoney.com/',
    },
  });

  if (!response || !response.ok) {
    console.warn(`[eastmoney] 基金 ${code} 净值 API 请求失败，降级为 mock 数据`);
    return getMockNAV(code);
  }

  try {
    const body = (await response.json()) as EastMoneyNAVResponse;

    if (!body || body.ErrCode !== 0 || !body.Data?.LSJZList) {
      console.warn(`[eastmoney] 基金 ${code} 净值响应无效，降级为 mock 数据`);
      return getMockNAV(code);
    }

    const entries: NAVEntry[] = body.Data.LSJZList.map((item) => ({
      date: item.FSRQ,
      nav: parseFloat(item.DWJZ) || 0,
      accNav: parseFloat(item.LJJZ) || 0,
      dailyReturn: 0, // 先填 0，下面统一计算
    }));

    // 按日期升序排列（API 返回的是降序）
    entries.sort((a, b) => a.date.localeCompare(b.date));

    // 计算每日收益率 (基于单位净值变化)
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1].nav;
      const curr = entries[i].nav;
      if (prev > 0 && curr > 0) {
        entries[i].dailyReturn = parseFloat(
          (((curr - prev) / prev) * 100).toFixed(4),
        );
      }
    }

    console.log(`[eastmoney] 成功获取基金 ${code} ${entries.length} 条净值`);
    return entries;
  } catch (err) {
    console.warn(`[eastmoney] 基金 ${code} 净值处理异常，降级为 mock 数据:`, err);
    return getMockNAV(code);
  }
}

// ============================================================
// 天天基金 API 响应类型
// ============================================================

interface EastMoneyNAVResponse {
  ErrCode: number;
  ErrMsg: string;
  Data?: {
    LSJZList: EastMoneyNAVItem[];
    TotalCount: number;
  };
}

interface EastMoneyNAVItem {
  FSRQ: string;   // 净值日期 YYYY-MM-DD
  DWJZ: string;   // 单位净值
  LJJZ: string;   // 累计净值
  JZZZL?: string; // 日增长率（备用）
}

// ============================================================
// Mock 数据 — 10 只代表性中国基金
// ============================================================

const MOCK_FUNDS: FundInfo[] = [
  {
    code: '005827',
    name: '易方达蓝筹精选混合',
    type: '偏股混合型',
    company: '易方达基金',
    manager: '张坤',
    tenure: '5年又211天',
    managerReturn: '+98.50%',
    scale: 480.62,
    inception: '2018-09-05',
  },
  {
    code: '161725',
    name: '招商中证白酒指数(LOF)A',
    type: '指数型',
    company: '招商基金',
    manager: '侯昊',
    tenure: '6年又98天',
    managerReturn: '+185.32%',
    scale: 398.15,
    inception: '2015-05-27',
  },
  {
    code: '110011',
    name: '易方达优质精选混合(QDII)',
    type: 'QDII',
    company: '易方达基金',
    manager: '张坤',
    tenure: '5年又211天',
    managerReturn: '+78.30%',
    scale: 326.50,
    inception: '2012-09-28',
  },
  {
    code: '003834',
    name: '华夏能源革新股票A',
    type: '股票型',
    company: '华夏基金',
    manager: '郑泽鸿',
    tenure: '4年又156天',
    managerReturn: '+142.80%',
    scale: 215.38,
    inception: '2017-06-07',
  },
  {
    code: '002939',
    name: '广发创新升级混合',
    type: '灵活配置型',
    company: '广发基金',
    manager: '刘格菘',
    tenure: '7年又12天',
    managerReturn: '+62.15%',
    scale: 178.90,
    inception: '2017-07-05',
  },
  {
    code: '270002',
    name: '广发稳健增长混合A',
    type: '灵活配置型',
    company: '广发基金',
    manager: '傅友兴',
    tenure: '9年又87天',
    managerReturn: '+110.50%',
    scale: 152.30,
    inception: '2004-07-26',
  },
  {
    code: '510050',
    name: '华夏上证50ETF',
    type: '指数型',
    company: '华夏基金',
    manager: '张弘弢',
    tenure: '11年又43天',
    managerReturn: '+203.60%',
    scale: 586.75,
    inception: '2004-12-30',
  },
  {
    code: '519069',
    name: '汇添富价值精选混合A',
    type: '灵活配置型',
    company: '汇添富基金',
    manager: '劳杰男',
    tenure: '4年又302天',
    managerReturn: '+45.80%',
    scale: 95.42,
    inception: '2009-01-23',
  },
  {
    code: '000913',
    name: '农银医疗保健股票',
    type: '股票型',
    company: '农银汇理基金',
    manager: '赵伟',
    tenure: '3年又228天',
    managerReturn: '+89.20%',
    scale: 67.84,
    inception: '2015-02-10',
  },
  {
    code: '000001',
    name: '华夏成长混合',
    type: '偏股混合型',
    company: '华夏基金',
    manager: '阳琨',
    tenure: '8年又156天',
    managerReturn: '+75.30%',
    scale: 112.60,
    inception: '2001-12-18',
  },
];

/**
 * 返回 10 只代表性中国基金的 mock 数据。
 */
export function getMockFunds(): FundInfo[] {
  console.log('[eastmoney] 使用 mock 基金数据（共 10 只）');
  return [...MOCK_FUNDS];
}

/**
 * 生成指定基金的 mock 净值历史（随机游走 + 微幅上涨）。
 * 始终返回 90 条数据。
 */
export function getMockNAV(code: string): NAVEntry[] {
  console.log(`[eastmoney] 使用 mock 净值数据（基金 ${code}）`);

  // 用基金代码生成确定性种子，使同一基金每次生成的数据一致
  const seed = hashCode(code);
  const rng = createRNG(seed);

  const count = 90;
  const entries: NAVEntry[] = [];

  // 起步净值在 0.8 ~ 3.0 之间
  let nav = 0.8 + rng() * 2.2;
  // 累计净值 = 单位净值 * (1.05 ~ 1.6)
  const accMultiplier = 1.05 + rng() * 0.55;

  const now = new Date();
  // 从 90 天前开始
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - count + 1);

  for (let i = 0; i < count; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // 跳过周末（周六、周日基金不交易，净值不变）
    // 为简化这里直接跳过，确保每个工作日都有净值
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // 周末沿用前一日净值（不新增条目，仅下一个工作日往前沿用）
      continue;
    }

    const dateStr = formatDate(date);

    // 每日涨跌幅：均值 +0.03%，标准差 1.2%，偏正态分布
    // 使整体略有上涨趋势
    const dailyChange = rngNormal(rng) * 1.2 + 0.03;

    nav = nav * (1 + dailyChange / 100);
    // 确保净值不会变成异常值
    nav = Math.max(nav, 0.1);
    const accNav = nav * accMultiplier;

    entries.push({
      date: dateStr,
      nav: parseFloat(nav.toFixed(4)),
      accNav: parseFloat(accNav.toFixed(4)),
      dailyReturn: parseFloat(dailyChange.toFixed(4)),
    });
  }

  // 填充到 90 条（如果因周末跳过太多，补充工作日）
  // 实际场景下 90 个自然日约 60-65 个交易日，mock 返回 90 条交易日数据
  // 上面的逻辑可能跳过周末导致不足 90 条，这里确保返回 count 条：
  // 换个策略：不跳过周末，为简化所有日期都生成净值
  // 重置并用简单方式重新生成
  const entries2: NAVEntry[] = [];
  let nav2 = 0.8 + rng() * 2.2;

  for (let i = 0; i < count; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = formatDate(date);

    const dailyChange = rngNormal(rng) * 1.2 + 0.03;
    nav2 = nav2 * (1 + dailyChange / 100);
    nav2 = Math.max(nav2, 0.1);

    entries2.push({
      date: dateStr,
      nav: parseFloat(nav2.toFixed(4)),
      accNav: parseFloat((nav2 * accMultiplier).toFixed(4)),
      dailyReturn: parseFloat(dailyChange.toFixed(4)),
    });
  }

  return entries2;
}

// ============================================================
// Mock 数据工具函数
// ============================================================

/**
 * 简单的字符串哈希（用于确定性随机种子）。
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32 位整数
  }
  return Math.abs(hash);
}

/**
 * 简单的确定性伪随机数生成器 (mulberry32)。
 */
function createRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller 法生成正态分布随机数。
 */
function rngNormal(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  // 避免 u1 为 0 导致 Math.log(-0) = -Infinity
  const safeU1 = u1 === 0 ? 0.0001 : u1;
  return Math.sqrt(-2 * Math.log(safeU1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * 格式化日期为 YYYY-MM-DD。
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ============================================================
// 自测入口 — 直接执行此文件时运行
// ============================================================

async function selfTest(): Promise<void> {
  console.log('========================================');
  console.log('[eastmoney] 自测开始');
  console.log('========================================\n');

  // 测试 mock 基金列表
  console.log('--- getMockFunds() ---');
  const mockFunds = getMockFunds();
  console.log(`返回 ${mockFunds.length} 只基金:`);
  for (const f of mockFunds) {
    console.log(`  ${f.code} ${f.name} [${f.type}] ${f.company} | 经理: ${f.manager} | 规模: ${f.scale}亿`);
  }
  console.log('');

  // 测试 mock 净值
  console.log('--- getMockNAV("005827") ---');
  const mockNAV = getMockNAV('005827');
  console.log(`返回 ${mockNAV.length} 条净值记录`);
  if (mockNAV.length > 0) {
    console.log(`  首日: ${mockNAV[0].date} nav=${mockNAV[0].nav} dailyReturn=${mockNAV[0].dailyReturn}%`);
    const mid = Math.floor(mockNAV.length / 2);
    console.log(`  中间: ${mockNAV[mid].date} nav=${mockNAV[mid].nav} dailyReturn=${mockNAV[mid].dailyReturn}%`);
    console.log(`  末日: ${mockNAV[mockNAV.length - 1].date} nav=${mockNAV[mockNAV.length - 1].nav} dailyReturn=${mockNAV[mockNAV.length - 1].dailyReturn}%`);
  }
  console.log('');

  // 测试真实 API（可能失败，预期降级为 mock）
  console.log('--- fetchAllFunds() ---');
  const funds = await fetchAllFunds();
  console.log(`最终返回 ${funds.length} 只基金`);
  if (funds.length > 0) {
    console.log(`  首只: ${funds[0].code} ${funds[0].name}`);
  }
  console.log('');

  console.log('--- fetchFundNAV("000001") ---');
  const nav = await fetchFundNAV('000001', 10);
  console.log(`最终返回 ${nav.length} 条净值记录`);

  console.log('\n========================================');
  console.log('[eastmoney] 自测完成');
  console.log('========================================');
}

// 判断是否为直接运行（ESM 环境下用 import.meta.url）
const isDirectRun = process.argv[1]?.endsWith('eastmoney.ts') ||
  process.argv[1]?.endsWith('eastmoney.js');

if (isDirectRun) {
  selfTest().catch((err) => {
    console.error('[eastmoney] 自测异常:', err);
    process.exit(1);
  });
}
