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
// 基金列表缓存（10 分钟，列表不常变）
let cachedFundList: FundInfo[] | null = null;
let cachedFundListAt = 0;
const FUND_LIST_CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchAllFunds(): Promise<FundInfo[]> {
  if (cachedFundList && Date.now() - cachedFundListAt < FUND_LIST_CACHE_TTL_MS) {
    return cachedFundList;
  }

  console.log('[eastmoney] 正在从天天基金获取基金列表...');

  const response = await fetchWithTimeout(FUND_LIST_URL);

  if (!response || !response.ok) {
    console.warn('[eastmoney] 基金列表 API 请求失败，降级为 mock 数据');
    const result = getMockFunds();
    cachedFundList = result;
    cachedFundListAt = Date.now();
    return result;
  }

  try {
    const text = await response.text();
    const rows = parseFundListJS(text);

    if (!rows || rows.length === 0) {
      console.warn('[eastmoney] 基金列表解析失败，降级为 mock 数据');
      const result = getMockFunds();
      cachedFundList = result;
      cachedFundListAt = Date.now();
      return result;
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
    cachedFundList = funds;
    cachedFundListAt = Date.now();
    return funds;
  } catch (err) {
    console.warn('[eastmoney] 基金列表处理异常，降级为 mock 数据:', err);
    const result = getMockFunds();
    cachedFundList = result;
    cachedFundListAt = Date.now();
    return result;
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
// 基金详情 — 从 pingzhongdata API 获取真实净值/收益/持仓
// ============================================================

export interface FundDetail {
  code: string;
  name: string;
  returns: { ret1m: number; ret3m: number; ret6m: number; ret1y: number };
  stockCodes: string[]; // 真实持仓代码（需清洗）
  navHistory: NAVEntry[];
  dataDate: string; // 数据日期
}

const FUND_DETAIL_URL = 'http://fund.eastmoney.com/pingzhongdata/';
const FUND_HOLDINGS_URL = 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx';

export interface HoldingDetail {
  stockCode: string;
  stockName: string;
  weight: number;    // 占净值比例 (%)
  shares: number;    // 持股数（万股）
  marketValue: number; // 持仓市值（万元）
}

/**
 * 从天天基金获取基金真实持仓明细（含权重）。
 */
export async function fetchFundHoldings(code: string): Promise<HoldingDetail[]> {
  try {
    const url = `${FUND_HOLDINGS_URL}?type=jjcc&code=${code}&topline=10`;
    const resp = await fetchWithTimeout(url);
    if (!resp || !resp.ok) return [];
    const text = await resp.text();

    // 提取 var apidata={...}
    const start = text.indexOf('var apidata=');
    if (start < 0) return [];
    const jsonPart = text.substring(start + 'var apidata='.length);
    let depth = 0, end = 0;
    for (let i = 0; i < jsonPart.length; i++) {
      if (jsonPart[i] === '{') depth++;
      if (jsonPart[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const obj = eval('(' + jsonPart.substring(0, end) + ')') as { content: string };
    const html = obj.content as string;

    // 解析表格行：列 1=代码, 2=名称, 6=占比, 7=持股数, 8=市值
    const result: HoldingDetail[] = [];
    const trs = html.split('</tr>');
    for (const tr of trs) {
      const tds = tr.match(/<td[^>]*>(.*?)<\/td>/gs);
      if (!tds || tds.length < 8) continue;
      const cells = tds.map(td => td.replace(/<[^>]*>/g, '').trim());
      const code = cells[1];
      if (!/^\d{6}$/.test(code)) continue;
      const name = cells[2];
      const weight = parseFloat(cells[6]) || 0;
      const shares = parseFloat(cells[7]) || 0;
      const marketValue = parseFloat(cells[8]) || 0;
      if (weight > 0) result.push({ stockCode: code, stockName: name, weight, shares, marketValue });
    }
    return result.slice(0, 10);
  } catch {
    return [];
  }
}

// ============================================================
// 股票实时行情 — 从新浪接口获取涨跌幅
// ============================================================

// 行情缓存（2 分钟）
const quoteCache = new Map<string, { data: number | null; at: number }>();
const QUOTE_CACHE_TTL_MS = 2 * 60 * 1000;

function marketPrefix(code: string): string {
  if (code.startsWith('6')) return 'sh';
  return 'sz';
}

/**
 * 获取单只股票当日涨跌幅（%）。
 * 从新浪行情接口解析，失败返回 null。
 */
async function fetchStockChangePct(code: string): Promise<number | null> {
  const cached = quoteCache.get(code);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_TTL_MS) return cached.data;

  try {
    const prefix = marketPrefix(code);
    const url = `https://hq.sinajs.cn/list=${prefix}${code}`;
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

    const price = parseFloat(fields[3]);
    const prevClose = parseFloat(fields[2]);
    let changePct = 0;
    if (prevClose > 0 && price > 0) {
      changePct = ((price - prevClose) / prevClose) * 100;
    }

    const result = Math.round(changePct * 100) / 100;
    quoteCache.set(code, { data: result, at: Date.now() });
    return result;
  } catch {
    quoteCache.set(code, { data: null, at: Date.now() });
    return null;
  }
}

/** 批量获取涨跌幅（并发 5） */
export async function fetchStockChanges(codes: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (let i = 0; i < codes.length; i += 5) {
    const batch = codes.slice(i, i + 5);
    const items = await Promise.allSettled(batch.map(c => fetchStockChangePct(c)));
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      if (it.status === 'fulfilled' && it.value != null) {
        result.set(batch[j], it.value);
      }
    }
  }
  return result;
}

// 短期缓存：同一基金数据复用，保证各页面评分一致
// 成功缓存 5 分钟，失败缓存 30 秒（避免反复失败产生不一致）
const detailCache = new Map<string, { data: FundDetail | null; at: number }>();
const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAIL_CACHE_FAIL_TTL_MS = 30 * 1000;

export async function fetchFundDetail(code: string): Promise<FundDetail | null> {
  const cached = detailCache.get(code);
  if (cached) {
    const ttl = cached.data ? DETAIL_CACHE_TTL_MS : DETAIL_CACHE_FAIL_TTL_MS;
    if (Date.now() - cached.at < ttl) {
      return cached.data;
    }
    // 过期，清除重新请求
    detailCache.delete(code);
  }
  try {
    const url = `${FUND_DETAIL_URL}${code}.js`;
    const resp = await fetchWithTimeout(url);
    if (!resp || !resp.ok) return null;
    const text = await resp.text();

    // 解析基金名称
    const name = (text.match(/fS_name\s*=\s*"([^"]+)"/) || [])[1] || '';

    // 解析收益率
    const ret1m = parseFloat((text.match(/syl_1y\s*=\s*"([^"]+)"/) || [])[1] || '0');
    const ret3m = parseFloat((text.match(/syl_3y\s*=\s*"([^"]+)"/) || [])[1] || '0');
    const ret6m = parseFloat((text.match(/syl_6y\s*=\s*"([^"]+)"/) || [])[1] || '0');
    const ret1y = parseFloat((text.match(/syl_1n\s*=\s*"([^"]+)"/) || [])[1] || '0');

    // 解析持仓代码并清洗
    const stockCodes: string[] = [];
    const codesMatch = text.match(/stockCodes\s*=\s*(\[[^\]]*\])/);
    if (codesMatch) {
      const raw = JSON.parse(codesMatch[1]) as string[];
      stockCodes.push(...raw.map(c => cleanStockCode(c)).filter(Boolean));
    }

    // 解析净值历史
    const navHistory: NAVEntry[] = [];
    const navMatch = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
    if (navMatch) {
      const rawNavs = JSON.parse(navMatch[1]) as Array<{ x: number; y: number; equityReturn: number }>;
      // 取最近 90 条
      for (const item of rawNavs.slice(-90)) {
        navHistory.push({
          date: (d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)(new Date(item.x)),
          nav: Math.round(item.y * 10000) / 10000,
          accNav: Math.round(item.y * 10000) / 10000,
          dailyReturn: item.equityReturn || 0,
        });
      }
    }

    const result = { code, name, returns: { ret1m, ret3m, ret6m, ret1y }, stockCodes, navHistory, dataDate: new Date().toISOString().slice(0, 10) };
    detailCache.set(code, { data: result, at: Date.now() });
    return result;
  } catch (err) {
    console.warn(`[eastmoney] 获取基金 ${code} 详情失败:`, (err as Error).message);
    // 失败也缓存（短期），防止同一次会话中交替成功/失败导致评分不一致
    detailCache.set(code, { data: null, at: Date.now() });
    return null;
  }
}

// ============================================================
// 真实持仓代码 → 股票名称映射
// ============================================================

// A股+港股常见股票代码→名称映射（覆盖主流基金重仓股，持续更新）
// A股+港股常见股票代码→名称映射（500+只，覆盖中小盘热门赛道）
const STOCK_NAME_MAP: Record<string, string> = {
	  // ===== 白酒/消费 =====
	  '600519':'贵州茅台','000858':'五粮液','000568':'泸州老窖','002304':'洋河股份',
	  '000596':'古井贡酒','600809':'山西汾酒','600702':'舍得酒业','000799':'酒鬼酒',
	  '600887':'伊利股份','002714':'牧原股份','300498':'温氏股份','000895':'双汇发展',
	  '603288':'海天味业','603027':'千禾味业','002557':'洽洽食品','600882':'妙可蓝多',
	  '002847':'盐津铺子','603345':'安井食品','600305':'恒顺醋业','002568':'百润股份',
	  '603369':'今世缘','000860':'顺鑫农业','002646':'青青稞酒','600559':'老白干酒',
	  '603198':'迎驾贡酒','600779':'水井坊','000869':'张裕A','002461':'珠江啤酒',
	  '600132':'重庆啤酒','600600':'青岛啤酒','000729':'燕京啤酒',
	  // ===== 家电/消费电子 =====
	  '000333':'美的集团','000651':'格力电器','002032':'苏泊尔','600690':'海尔智家',
	  '002415':'海康威视','002027':'分众传媒','002050':'三花智控',
	  '002242':'九阳股份','002508':'老板电器','002677':'浙江美大',
	  '002959':'小熊电器','603486':'科沃斯','688169':'石头科技',
	  '300866':'安克创新','002351':'漫步者','603515':'欧普照明',
	  '002841':'视源股份','002925':'盈趣科技',
	  // ===== 金融 =====
	  '601318':'中国平安','600036':'招商银行','601166':'兴业银行','600030':'中信证券',
	  '601398':'工商银行','601288':'农业银行','601328':'交通银行','600016':'民生银行',
	  '000001':'平安银行','002142':'宁波银行','601818':'光大银行','601939':'建设银行',
	  '601601':'中国太保','601628':'中国人寿','300059':'东方财富',
	  '600919':'江苏银行','002839':'张家港行','600926':'杭州银行',
	  '601009':'南京银行','600015':'华夏银行','601997':'贵阳银行',
	  '601838':'成都银行','002948':'青岛银行','601528':'瑞丰银行',
	  '601878':'浙商证券','600837':'海通证券','000776':'广发证券',
	  '601688':'华泰证券','600999':'招商证券','601211':'国泰君安',
	  '600958':'东方证券','000166':'申万宏源','601066':'中信建投',
	  '300033':'同花顺','002736':'国信证券','601995':'中金公司',
	  // ===== 医药 =====
	  '600276':'恒瑞医药','300760':'迈瑞医疗','300015':'爱尔眼科','603259':'药明康德',
	  '300122':'智飞生物','000661':'长春高新','300347':'泰格医药','300759':'康龙化成',
	  '600196':'复星医药','000963':'华东医药','002007':'华兰生物','300529':'健帆生物',
	  '600763':'通策医疗','300003':'乐普医疗','002001':'新和成','600079':'人福医药',
	  '300142':'沃森生物','000423':'东阿阿胶','600085':'同仁堂',
	  '600436':'片仔癀','000538':'云南白药','300357':'我武生物',
	  '002294':'信立泰','000513':'丽珠集团','002262':'恩华药业',
	  '300601':'康泰生物','300009':'安科生物','002317':'众生药业',
	  '600535':'天士力','603858':'步长制药','002603':'以岭药业',
	  '300026':'红日药业','300181':'佐力药业','000999':'华润三九',
	  '600329':'达仁堂','002223':'鱼跃医疗','300206':'理邦仪器',
	  '300633':'开立医疗','688016':'心脉医疗','300653':'正海生物',
	  '300595':'欧普康视','688050':'爱博医疗','300896':'爱美客',
	  '688363':'华熙生物','688185':'康希诺','688180':'君实生物',
	  '688235':'百济神州','688578':'艾力斯',
	  '688266':'泽璟制药','688321':'微芯生物','688331':'荣昌生物',
	  '688520':'神州细胞','688177':'百奥泰','688105':'诺唯赞',
	  '300558':'贝达药业','002821':'凯莱英','300725':'药石科技',
	  '688202':'美迪西','688131':'皓元医药','688356':'键凯科技',
	  '300363':'博腾股份','300702':'天宇股份','603456':'九洲药业',
	  '688076':'诺泰生物','300452':'山河药辅','688136':'科兴制药',
	  // ===== 新能源 =====
	  '300750':'宁德时代','002594':'比亚迪','601012':'隆基绿能','300274':'阳光电源',
	  '600438':'通威股份','300014':'亿纬锂能','002466':'天齐锂业','002460':'赣锋锂业',
	  '002812':'恩捷股份','300450':'先导智能','688599':'天合光能',
	  '601615':'明阳智能','002459':'晶澳科技','300763':'锦浪科技',
	  '688223':'晶科能源','688680':'海优新材','688032':'禾迈股份',
	  '688348':'昱能科技','688063':'派能科技',
	  '605117':'德业股份','300827':'上能电气','300118':'东方日升',
	  '688516':'奥特维','300751':'迈为股份','688330':'宏力达',
	  '300724':'捷佳伟创','601877':'正泰电器','600732':'爱旭股份',
	  '002518':'科士达','300376':'易事特','300068':'南都电源',
	  '688567':'孚能科技','300207':'欣旺达','002074':'国轩高科',
	  '300919':'中伟股份','688005':'容百科技','688707':'振华新材',
	  '300769':'德方纳米','002738':'中矿资源','000155':'川能动力',
	  '002240':'盛新锂能','002756':'永兴材料','002192':'融捷股份',
	  // ===== 科技/TMT =====
	  '688981':'中芯国际','002371':'北方华创','002049':'紫光国微','603986':'兆易创新',
	  '002475':'立讯精密','000725':'京东方A','000063':'中兴通讯','688111':'金山办公',
	  '002241':'歌尔股份','300124':'汇川技术',
	  '688012':'中微公司','688008':'澜起科技','603501':'韦尔股份','600703':'三安光电',
	  '002916':'深南电路','300782':'卓胜微','688396':'华润微',
	  '300661':'圣邦股份','002230':'科大讯飞',
	  // ===== AI算力/光模块/CPO =====
	  '300502':'新易盛','300308':'中际旭创','300394':'天孚通信',
	  '688498':'源杰科技','002281':'光迅科技','301205':'联特科技',
	  '603083':'剑桥科技','300570':'太辰光','688205':'德科立',
	  '600498':'烽火通信','600105':'永鼎股份','601869':'长飞光纤','600522':'中天科技',
	  '300548':'博创科技','300620':'光库科技','688313':'仕佳光子',
	  '688195':'腾景科技','300602':'飞荣达','300442':'润泽科技',
	  '688158':'优刻得','300474':'景嘉微','688256':'寒武纪',
	  '688041':'海光信息','688047':'龙芯中科','603019':'中科曙光',
	  '000977':'浪潮信息','688561':'奇安信',
	  '688568':'中科星图','300212':'易华录','300166':'东方国信',
	  '688088':'虹软科技','300496':'中科创达',
	  '688521':'芯原股份','688099':'晶晨股份','688018':'乐鑫科技',
	  '688608':'恒玄科技','300458':'全志科技','603160':'汇顶科技',
	  '300223':'北京君正','688595':'芯海科技',
	  // ===== 半导体/芯片/EDA =====
	  '688126':'沪硅产业','600584':'长电科技','002156':'通富微电',
	  '002185':'华天科技','603005':'晶方科技','300346':'南大光电',
	  '300236':'上海新阳','688019':'安集科技','688200':'华峰测控',
	  '688082':'盛美上海','688037':'芯源微','688072':'拓荆科技',
	  '688120':'华海清科','301269':'华大九天','688206':'概伦电子',
	  '301286':'广立微','688536':'思瑞浦','688368':'晶丰明源',
	  '300613':'富瀚微','688052':'纳芯微','688123':'聚辰股份',
	  '688261':'东微半导','688110':'东芯股份','688525':'佰维存储',
	  '688385':'复旦微电','688728':'格科微','688538':'和辉光电',
	  '003031':'中瓷电子','002409':'雅克科技','300666':'江丰电子',
	  '002384':'东山精密','603690':'至纯科技','688598':'金博股份',
	  '300316':'晶盛机电','688270':'臻镭科技','688375':'国博电子',
	  '688143':'长盈通','688010':'福光股份','688097':'博众精工',
	  // ===== 机器人/自动化 =====
	  '688017':'绿的谐波','002747':'埃斯顿','300607':'拓斯达',
	  '300024':'机器人','688320':'禾川科技','603728':'鸣志电器',
	  '688160':'步科股份','300503':'昊志机电','301368':'丰立智能',
	  '688165':'埃夫特','002527':'新时达',
	  '688218':'江苏北人','300161':'华中数控','300508':'维宏股份',
	  '002896':'中大力德','603416':'信捷电气','688025':'杰普特',
	  '300660':'江苏雷利','300403':'汉宇集团','002979':'雷赛智能',
	  '688003':'天准科技','688305':'科德数控','002008':'大族激光',
	  '688559':'海目星','688518':'联赢激光','300457':'赢合科技',
	  // ===== 低空经济/无人机 =====
	  '000099':'中信海直','002085':'万丰奥威','688070':'纵横股份',
	  '002389':'航天彩虹','688297':'中无人机','688287':'观典防务',
	  '002023':'海特高新','300489':'光智科技','002111':'威海广泰',
	  '688237':'超卓航科','300900':'广联航空','300719':'安达维尔',
	  '002933':'新兴装备','600391':'航发科技','000738':'航发控制',
	  '300034':'钢研高纳','688122':'西部超导','688239':'航宇科技',
	  '300696':'爱乐达','000768':'中航西飞','600760':'中航沈飞',
	  // ===== 智能驾驶/汽车电子 =====
	  '603596':'伯特利','603786':'科博达','600699':'均胜电子',
	  '002906':'华阳集团','603197':'保隆科技','002813':'路畅科技',
	  '300552':'万集科技','002405':'四维图新','600718':'东软集团',
	  '688208':'道通科技','300825':'阿尔特','300928':'华安鑫创',
	  '301007':'德迈仕','688280':'精进电动','300745':'欣锐科技',
	  '300438':'鹏辉能源','002709':'天赐材料',
	  '603659':'璞泰来','688388':'嘉元科技','300568':'星源材质',
	  '002850':'科达利','300037':'新宙邦','603799':'华友钴业',
	  '600733':'北汽蓝谷','601127':'赛力斯',
	  // ===== 光伏 =====
	  '601865':'福莱特','603806':'福斯特','002129':'TCL中环',
	  '003022':'联泓新科','688303':'大全能源',
	  // ===== 风电 =====
	  '002202':'金风科技','600458':'时代新材',
	  '300850':'新强联','603218':'日月股份','300185':'通裕重工',
	  '002487':'大金重工','301063':'海锅股份','300443':'金雷股份',
	  '603507':'振江股份','688660':'电气风电','300772':'运达股份',
	  '002531':'天顺风能','601218':'吉鑫科技','600416':'湘电股份',
	  // ===== 军工/航天 =====
	  '600893':'航发动力','600862':'中航高科',
	  '002179':'中航光电','300114':'中航电测','600150':'中国船舶',
	  '600685':'中船防务','600482':'中国动力',
	  '600038':'中直股份','600879':'航天电子','603678':'火炬电子',
	  '300395':'菲利华','603267':'鸿远电子','002025':'航天电器',
	  '300726':'宏达电子','688333':'铂力特','688283':'坤恒顺维',
	  '300581':'晨曦航空','300775':'三角防务',
	  '002985':'北摩高科','300777':'中简科技',
	  '688685':'迈信林','002013':'中航机电','300773':'广电计量',
	  // ===== 消费电子/VR/AR/MR =====
	  '300433':'蓝思科技','002600':'领益智造','300115':'长盈精密',
	  '003021':'兆威机电','688007':'光峰科技','002456':'欧菲光',
	  '300735':'光弘科技','300686':'智动力',
	  '300709':'精研科技','300136':'信维通信','002138':'顺络电子',
	  '300408':'三环集团','002222':'福晶科技','002273':'水晶光电',
	  '688322':'奥比中光','688001':'华兴源创',
	  // ===== 工业母机/高端装备 =====
	  '300083':'创世纪','601882':'海天精工','688558':'国盛智科',
	  '688577':'浙海德曼','688059':'华锐精密','688308':'欧科亿',
	  '002520':'日发精机','300441':'鲍斯股份',
	  '600835':'上海机电','002651':'利君股份','688355':'明志科技',
	  // ===== 能源/材料 =====
	  '601899':'紫金矿业','601088':'中国神华','600028':'中国石化','601857':'中国石油',
	  '600585':'海螺水泥','600031':'三一重工','000338':'潍柴动力',
	  '000786':'北新建材','002271':'东方雨虹','600176':'中国巨石',
	  '600426':'华鲁恒升','000830':'鲁西化工','002092':'中泰化学',
	  '600309':'万华化学','002601':'龙佰集团','002648':'卫星化学',
	  '600989':'宝丰能源','000301':'东方盛虹','002493':'荣盛石化',
	  '000703':'恒逸石化','600346':'恒力石化','002408':'齐翔腾达',
	  // ===== 电力/公用 =====
	  '600900':'长江电力','003816':'中国广核','601985':'中国核电','600886':'国投电力',
	  '600011':'华能国际','600025':'华能水电','600674':'川投能源',
	  '600023':'浙能电力','600027':'华电国际','600795':'国电电力',
	  '000591':'太阳能','000883':'湖北能源','601016':'节能风电',
	  '603105':'芯能科技','601619':'嘉泽新能',
	  // ===== 地产/基建 =====
	  '000002':'万科A','600048':'保利发展','001979':'招商蛇口','600383':'金地集团',
	  '601668':'中国建筑','601390':'中国中铁','601800':'中国交建','601186':'中国铁建',
	  '000069':'华侨城A','600325':'华发股份','601155':'新城控股',
	  '000656':'金科股份','600223':'鲁商发展','600675':'中华企业','000540':'中天金融',
	  // ===== 汽车/机械 =====
	  '600104':'上汽集团','000625':'长安汽车','601633':'长城汽车','601238':'广汽集团',
	  '600741':'华域汽车','000800':'一汽解放','600066':'宇通客车',
	  '600418':'江淮汽车','000951':'中国重汽','600166':'福田汽车',
	  '301039':'中集车辆','300258':'精锻科技','603305':'旭升集团',
	  '603348':'文灿股份','002101':'广东鸿图',
	  // ===== 交通运输 =====
	  '601111':'中国国航','600029':'南方航空','600115':'中国东航','601816':'京沪高铁',
	  '002352':'顺丰控股','600233':'圆通速递','002120':'韵达股份',
	  '600009':'上海机场','000089':'深圳机场','600004':'白云机场',
	  '601872':'招商轮船','601919':'中远海控','601598':'中国外运',
	  '000582':'北部湾港','601018':'宁波港','601000':'唐山港',
	  '000905':'厦门港务','002930':'宏川智慧',
	  // ===== 传媒/游戏/教育 =====
	  '300413':'芒果超媒','002555':'三七互娱','002602':'世纪华通',
	  '300624':'万兴科技','002174':'游族网络','300315':'掌趣科技',
	  '603444':'吉比特','002558':'巨人网络','300251':'光线传媒',
	  '603000':'人民网','600637':'东方明珠','002131':'利欧股份',
	  '300058':'蓝色光标','300133':'华策影视','300063':'天龙集团',
	  // ===== 计算机/信创 =====
	  '300454':'深信服','002439':'启明星辰',
	  '300188':'美亚柏科','300075':'数字政通',
	  '600536':'中国软件','000066':'中国长城','688058':'宝兰德',
	  '688095':'福昕软件','300525':'博思软件',
	  '002410':'广联达','300365':'恒华科技','002063':'远光软件',
	  '600570':'恒生电子','300377':'赢时胜','300803':'指南针',
	  // ===== 环保/碳中和 =====
	  '603568':'伟明环保','000035':'中国天楹','002672':'东江环保',
	  '300070':'碧水源','300422':'博世科','300815':'玉禾田',
	  '600323':'瀚蓝环境','000685':'中山公用','601200':'上海环境',
	  '300140':'中环装备','688101':'三达膜','688679':'通源环境',
	  // ===== 钢铁/有色/煤炭 =====
	  '600019':'宝钢股份','000898':'鞍钢股份','000932':'华菱钢铁',
	  '600010':'包钢股份','000708':'中信特钢','002318':'久立特材',
	  '603993':'洛阳钼业','000630':'铜陵有色','600362':'江西铜业',
	  '601168':'西部矿业','000603':'盛达资源','000975':'银泰黄金',
	  '600988':'赤峰黄金','002155':'湖南黄金','600489':'中金黄金',
	  '601898':'中煤能源','600188':'兖矿能源','601699':'潞安环能',
	  '000983':'山西焦煤','600546':'山煤国际','601001':'晋控煤业',
	  // ===== 零售/物流/供应链 =====
	  '601933':'永辉超市','002697':'红旗连锁','603708':'家家悦',
	  '603883':'老百姓','603939':'益丰药房','002727':'一心堂',
	  '002024':'苏宁易购','000564':'供销大集','600415':'小商品城',
	  // ===== 农业/种业 =====
	  '000998':'隆平高科','002385':'大北农','300189':'神农科技',
	  '600598':'北大荒','601952':'苏垦农发','002041':'登海种业',
	  '300087':'荃银高科','000713':'丰乐种业','600313':'农发种业',
	  '002746':'仙坛股份','300761':'立华股份','002100':'天康生物',
	  // ===== 化工/新材料 =====
	  '688065':'凯赛生物','688116':'天奈科技','688378':'奥来德',
	  '300487':'蓝晓科技','002340':'格林美','600143':'金发科技',
	  '002108':'沧州明珠','300888':'稳健医疗','603313':'梦百合',
	  // ===== 港股 =====
	  '00700':'腾讯控股','00005':'汇丰控股','00388':'香港交易所','00941':'中国移动',
	  '09988':'阿里巴巴-SW','03690':'美团-W','09618':'京东集团-SW',
	  '09999':'网易-S','09888':'百度集团-SW','01024':'快手-W','01810':'小米集团-W',
	  '02269':'药明生物','01211':'比亚迪股份','02015':'理想汽车-W',
	  '09866':'蔚来-SW','09868':'小鹏汽车-W','02007':'碧桂园服务',
	  '01109':'华润置地','02318':'中国平安','02628':'中国人寿',
	  '00883':'中国海洋石油','00857':'中国石油股份','00386':'中国石油化工股份',
	  '09987':'百胜中国','06618':'京东健康','06690':'海尔智家',
	  '01876':'百威亚太','02331':'李宁','02020':'安踏体育',
	  '01833':'平安好医生','00175':'吉利汽车',
	  '01209':'华润万象生活','06060':'众安在线','02688':'新东方在线',
	  '01801':'信达生物','02359':'药明康德','06160':'百济神州',
	  '02268':'信义光能','01919':'中远海控','00981':'中芯国际',
	  '02382':'舜宇光学科技','02018':'瑞声科技','00522':'ASMPT',
	  '00992':'联想集团','09926':'康方生物','02013':'微盟集团',
	  '01347':'华虹半导体','02196':'复星医药','01177':'中国生物制药',
	  '01093':'石药集团','01099':'国药控股','02696':'百丽时尚',
	  '06606':'诺辉健康','02518':'汽车之家','09899':'云音乐',
	  '09626':'哔哩哔哩-W','09878':'汇通达网络','02150':'奈雪的茶',
	};

function cleanStockCode(raw: string): string {
  // A股: 6位数字 + 1位市场标识 → 取前6位 (如 6005191→600519, 0008580→000858)
  // 港股: 5位数字 + 后缀 → 取前5位 (如 00700116→00700, 09987116→09987)
  if (/^\d{7}$/.test(raw)) return raw.slice(0, 6);
  if (/^\d{5}\d{2,}$/.test(raw)) return raw.slice(0, 5);
  return raw;
}

export function lookupStockName(code: string): string {
  const clean = cleanStockCode(code);
  return STOCK_NAME_MAP[clean] || STOCK_NAME_MAP[code] || '';
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
    code: '008983',
    name: '财通资管价值成长混合A',
    type: '灵活配置型',
    company: '财通资管',
    manager: '姜永明',
    tenure: '4年又89天',
    managerReturn: '+68.50%',
    scale: 12.58,
    inception: '2020-03-23',
  },
  {
    code: '006751',
    name: '富国中证科技50策略ETF联接A',
    type: '指数型',
    company: '富国基金',
    manager: '张圣贤',
    tenure: '5年又156天',
    managerReturn: '+42.30%',
    scale: 8.92,
    inception: '2019-03-20',
  },
  {
    code: '007484',
    name: '信澳核心科技混合A',
    type: '偏股混合型',
    company: '信达澳亚基金',
    manager: '冯明远',
    tenure: '6年又234天',
    managerReturn: '+156.80%',
    scale: 32.15,
    inception: '2019-08-14',
  },
  {
    code: '001255',
    name: '长城改革红利混合',
    type: '灵活配置型',
    company: '长城基金',
    manager: '廖瀚博',
    tenure: '4年又56天',
    managerReturn: '+52.40%',
    scale: 6.78,
    inception: '2015-04-08',
  },
  {
    code: '002863',
    name: '金信深圳成长混合',
    type: '灵活配置型',
    company: '金信基金',
    manager: '黄飙',
    tenure: '5年又302天',
    managerReturn: '+73.20%',
    scale: 5.34,
    inception: '2016-04-08',
  },
  {
    code: '005310',
    name: '广发电子信息传媒产业精选股票A',
    type: '股票型',
    company: '广发基金',
    manager: '孙迪',
    tenure: '3年又189天',
    managerReturn: '+35.60%',
    scale: 18.45,
    inception: '2017-12-11',
  },
  {
    code: '009023',
    name: '鹏华稳健回报混合A',
    type: '灵活配置型',
    company: '鹏华基金',
    manager: '王宗合',
    tenure: '8年又122天',
    managerReturn: '+98.70%',
    scale: 22.60,
    inception: '2020-03-25',
  },
  {
    code: '001410',
    name: '信澳新能源产业股票',
    type: '股票型',
    company: '信达澳亚基金',
    manager: '冯明远',
    tenure: '6年又234天',
    managerReturn: '+178.30%',
    scale: 45.80,
    inception: '2015-07-31',
  },
  {
    code: '007130',
    name: '中庚小盘价值股票',
    type: '股票型',
    company: '中庚基金',
    manager: '丘栋荣',
    tenure: '7年又56天',
    managerReturn: '+135.60%',
    scale: 28.90,
    inception: '2019-04-03',
  },
  {
    code: '003853',
    name: '金鹰信息产业股票A',
    type: '股票型',
    company: '金鹰基金',
    manager: '倪超',
    tenure: '3年又278天',
    managerReturn: '+48.90%',
    scale: 15.32,
    inception: '2017-03-10',
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
