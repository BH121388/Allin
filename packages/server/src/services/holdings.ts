// ============================================================
// 重仓股详情服务
//
// 为每只基金生成 10 只真实重仓股，含加权涨跌幅、
// 板块自动识别、行业占比明细和风格判定。
// ============================================================

import type { FundInfo, TopHolding } from '@allin/shared';
import { SECTOR_STYLE_MAP } from '@allin/shared';

// ============================================================
// 类型定义
// ============================================================

export interface HoldingsDetail {
  fundCode: string;
  fundName: string;
  holdings: TopHolding[];        // Top 10 stocks
  weightedChange: number;        // 加权涨跌幅 (%)
  sectorTags: string[];          // 板块标签 e.g. ["消费", "科技-TMT"]
  sectorBreakdown: SectorWeight[]; // 行业占比明细
  style: string;                 // "大盘价值" / "大盘成长" / "均衡配置"
  dataDate: string;              // "2026-03-31"
  source?: string;               // 数据来源: "天天基金" | "模拟数据"
}

export interface SectorWeight {
  sector: string;   // 中信一级行业名
  weight: number;   // 占比%
  tag: string;      // 板块标签
}

// ============================================================
// 股票模板（6 大类，每类 10 只）
// ============================================================

interface StockTemplate {
  code: string;
  name: string;
  baseWeight: number;  // 基础权重（会被随机扰动）
  sector: string;      // 中信一级行业
}

/** 蓝筹/消费类 */
const BLUECHIP_STOCKS: StockTemplate[] = [
  { code: '600519', name: '贵州茅台', baseWeight: 9.8, sector: '食品饮料' },
  { code: '000858', name: '五粮液',   baseWeight: 8.2, sector: '食品饮料' },
  { code: '600036', name: '招商银行', baseWeight: 7.0, sector: '银行' },
  { code: '000333', name: '美的集团', baseWeight: 6.5, sector: '家电' },
  { code: '601318', name: '中国平安', baseWeight: 6.0, sector: '非银行金融' },
  { code: '600887', name: '伊利股份', baseWeight: 5.2, sector: '食品饮料' },
  { code: '600276', name: '恒瑞医药', baseWeight: 4.8, sector: '医药' },
  { code: '000651', name: '格力电器', baseWeight: 4.2, sector: '家电' },
  { code: '000002', name: '万科A',    baseWeight: 3.5, sector: '房地产' },
  { code: '603288', name: '海天味业', baseWeight: 3.2, sector: '食品饮料' },
];

/** 新能源类 */
const NEW_ENERGY_STOCKS: StockTemplate[] = [
  { code: '300750', name: '宁德时代', baseWeight: 9.5, sector: '电力设备' },
  { code: '002594', name: '比亚迪',   baseWeight: 8.0, sector: '汽车' },
  { code: '601012', name: '隆基绿能', baseWeight: 6.8, sector: '电力设备' },
  { code: '300274', name: '阳光电源', baseWeight: 6.2, sector: '电力设备' },
  { code: '600438', name: '通威股份', baseWeight: 5.5, sector: '电力设备' },
  { code: '300014', name: '亿纬锂能', baseWeight: 5.0, sector: '电力设备' },
  { code: '002466', name: '天齐锂业', baseWeight: 4.5, sector: '有色金属' },
  { code: '002460', name: '赣锋锂业', baseWeight: 4.2, sector: '有色金属' },
  { code: '002812', name: '恩捷股份', baseWeight: 3.8, sector: '电力设备' },
  { code: '300450', name: '先导智能', baseWeight: 3.5, sector: '机械' },
];

/** 医疗类 */
const MEDICAL_STOCKS: StockTemplate[] = [
  { code: '300760', name: '迈瑞医疗',   baseWeight: 9.0, sector: '医药' },
  { code: '603259', name: '药明康德',   baseWeight: 7.8, sector: '医药' },
  { code: '600276', name: '恒瑞医药',   baseWeight: 7.0, sector: '医药' },
  { code: '300015', name: '爱尔眼科',   baseWeight: 6.2, sector: '医药' },
  { code: '300122', name: '智飞生物',   baseWeight: 5.5, sector: '医药' },
  { code: '000661', name: '长春高新',   baseWeight: 4.8, sector: '医药' },
  { code: '300347', name: '泰格医药',   baseWeight: 4.2, sector: '医药' },
  { code: '300759', name: '康龙化成',   baseWeight: 3.8, sector: '医药' },
  { code: '000963', name: '华东医药',   baseWeight: 3.5, sector: '医药' },
  { code: '002007', name: '华兰生物',   baseWeight: 3.0, sector: '医药' },
];

/** 科技/TMT 类 */
const TECH_STOCKS: StockTemplate[] = [
  { code: '688981', name: '中芯国际', baseWeight: 8.5, sector: '电子' },
  { code: '002415', name: '海康威视', baseWeight: 7.5, sector: '电子' },
  { code: '002475', name: '立讯精密', baseWeight: 7.0, sector: '电子' },
  { code: '000725', name: '京东方A',  baseWeight: 6.2, sector: '电子' },
  { code: '000063', name: '中兴通讯', baseWeight: 5.5, sector: '通信' },
  { code: '002371', name: '北方华创', baseWeight: 5.0, sector: '电子' },
  { code: '603501', name: '韦尔股份', baseWeight: 4.5, sector: '电子' },
  { code: '002241', name: '歌尔股份', baseWeight: 4.0, sector: '电子' },
  { code: '002230', name: '科大讯飞', baseWeight: 3.5, sector: '计算机' },
  { code: '002049', name: '紫光国微', baseWeight: 3.0, sector: '电子' },
];

/** 金融类 */
const FINANCIAL_STOCKS: StockTemplate[] = [
  { code: '600036', name: '招商银行', baseWeight: 9.0, sector: '银行' },
  { code: '601318', name: '中国平安', baseWeight: 8.5, sector: '非银行金融' },
  { code: '601398', name: '工商银行', baseWeight: 7.5, sector: '银行' },
  { code: '601939', name: '建设银行', baseWeight: 6.8, sector: '银行' },
  { code: '601166', name: '兴业银行', baseWeight: 6.0, sector: '银行' },
  { code: '601288', name: '农业银行', baseWeight: 5.2, sector: '银行' },
  { code: '600030', name: '中信证券', baseWeight: 4.8, sector: '非银行金融' },
  { code: '601601', name: '中国太保', baseWeight: 4.2, sector: '非银行金融' },
  { code: '601628', name: '中国人寿', baseWeight: 3.8, sector: '非银行金融' },
  { code: '300059', name: '东方财富', baseWeight: 3.2, sector: '非银行金融' },
];

/** QDII 类（港股/中概互联） */
const QDII_STOCKS: StockTemplate[] = [
  { code: '00700',  name: '腾讯控股', baseWeight: 10.0, sector: '传媒' },
  { code: '09988',  name: '阿里巴巴', baseWeight: 9.0,   sector: '传媒' },
  { code: '03690',  name: '美团',     baseWeight: 7.5,   sector: '传媒' },
  { code: '09618',  name: '京东',     baseWeight: 6.5,   sector: '传媒' },
  { code: 'PDD',    name: '拼多多',   baseWeight: 5.8,   sector: '传媒' },
  { code: '09888',  name: '百度',     baseWeight: 5.0,   sector: '传媒' },
  { code: '09999',  name: '网易',     baseWeight: 4.2,   sector: '传媒' },
  { code: '01024',  name: '快手',     baseWeight: 3.8,   sector: '传媒' },
  { code: '01810',  name: '小米',     baseWeight: 3.5,   sector: '电子' },
  { code: '002594', name: '比亚迪',   baseWeight: 3.0,   sector: '汽车' },
];

/** 混合型默认 */
const DEFAULT_STOCKS: StockTemplate[] = [
  { code: '600519', name: '贵州茅台', baseWeight: 6.0, sector: '食品饮料' },
  { code: '601318', name: '中国平安', baseWeight: 5.5, sector: '非银行金融' },
  { code: '300750', name: '宁德时代', baseWeight: 5.0, sector: '电力设备' },
  { code: '300760', name: '迈瑞医疗', baseWeight: 4.5, sector: '医药' },
  { code: '002415', name: '海康威视', baseWeight: 4.0, sector: '电子' },
  { code: '600036', name: '招商银行', baseWeight: 3.8, sector: '银行' },
  { code: '000858', name: '五粮液',   baseWeight: 3.5, sector: '食品饮料' },
  { code: '002594', name: '比亚迪',   baseWeight: 3.2, sector: '汽车' },
  { code: '688981', name: '中芯国际', baseWeight: 2.8, sector: '电子' },
  { code: '000333', name: '美的集团', baseWeight: 2.5, sector: '家电' },
];

// ============================================================
// 股票 → 中信一级行业映射
// ============================================================

const STOCK_SECTOR_MAP: Record<string, string> = {};
for (const stock of [
  ...BLUECHIP_STOCKS, ...NEW_ENERGY_STOCKS, ...MEDICAL_STOCKS,
  ...TECH_STOCKS, ...FINANCIAL_STOCKS, ...QDII_STOCKS, ...DEFAULT_STOCKS,
]) {
  STOCK_SECTOR_MAP[stock.code] = stock.sector;
}

// ============================================================
// 风格匹配
// ============================================================

type StyleKey = 'bluechip' | 'newEnergy' | 'medical' | 'tech' | 'financial' | 'qdii';

function matchFundStyle(fund: FundInfo): StyleKey {
  const combined = `${fund.name}${fund.type}`.toLowerCase();

  // QDII 优先匹配（避免被「精选」「成长」等通用关键词误匹配）
  if (combined.includes('qdii') || combined.includes('海外') || combined.includes('全球互联')) return 'qdii';

  if (combined.includes('白酒')) return 'bluechip';
  if (combined.includes('能源') || combined.includes('低碳') || combined.includes('绿色')) return 'newEnergy';
  if (combined.includes('医疗') || combined.includes('医药') || combined.includes('健康') || combined.includes('生物')) return 'medical';
  if (combined.includes('科技') || combined.includes('创新升级') || combined.includes('tmt') || combined.includes('信息') || combined.includes('半导体')) return 'tech';
  if (combined.includes('金融') || combined.includes('银行') || combined.includes('证券') || combined.includes('保险')) return 'financial';

  // 通用关键词（优先级低于特定行业）
  if (combined.includes('蓝筹') || combined.includes('精选')) return 'bluechip';
  if (combined.includes('50') || combined.includes('300') || combined.includes('价值') || combined.includes('红利')) return 'financial';
  if (combined.includes('成长') || combined.includes('创新')) return 'tech';
  if (combined.includes('稳健')) return 'bluechip';

  return 'bluechip'; // 默认蓝筹消费
}

/** 获取对应风格的股票模板 */
function getStockTemplate(style: StyleKey): StockTemplate[] {
  const map: Record<StyleKey, StockTemplate[]> = {
    bluechip: BLUECHIP_STOCKS,
    newEnergy: NEW_ENERGY_STOCKS,
    medical: MEDICAL_STOCKS,
    tech: TECH_STOCKS,
    financial: FINANCIAL_STOCKS,
    qdii: QDII_STOCKS,
  };
  return map[style];
}

// ============================================================
// 确定性随机数工具
// ============================================================

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

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

function rngNormal(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  const safeU1 = u1 === 0 ? 0.0001 : u1;
  return Math.sqrt(-2 * Math.log(safeU1)) * Math.cos(2 * Math.PI * u2);
}

// ============================================================
// 主函数
// ============================================================

/**
 * 为指定基金生成完整持仓详情，包括：
 *  - 10 只重仓股及其涨跌幅
 *  - 加权涨跌幅
 *  - 板块自动识别标签
 *  - 行业占比明细
 *  - 持仓风格
 */
export function generateHoldings(fund: FundInfo): HoldingsDetail {
  const style = matchFundStyle(fund);
  const template = getStockTemplate(style);

  const holdings: TopHolding[] = [];
  const totalWeight = template.reduce((sum, t) => sum + t.baseWeight, 0);

  // 为每只股票生成今日涨跌幅（确定性随机，基于股票代码）
  for (const stock of template) {
    const stockSeed = hashCode(stock.code);
    const stockRng = createRNG(stockSeed);

    // 涨跌幅: 正态分布 × 2.5（使大部分值在 ±5% 内），四舍五入到 2 位小数
    let change = rngNormal(stockRng) * 2.5;
    // 限制在 [-5, +5]
    change = Math.max(-5, Math.min(5, change));
    change = Math.round(change * 100) / 100;

    // 权重: baseWeight 基础上 ±1.5% 扰动
    const weightOffset = (stockRng() - 0.5) * 3.0;
    let weight = Math.round((stock.baseWeight + weightOffset) * 100) / 100;
    weight = Math.max(0.5, weight); // 最小值 0.5%

    holdings.push({
      stockCode: stock.code,
      stockName: stock.name,
      weight,
      changeToday: change,
    });
  }

  // 规范化权重，使总和接近 totalWeight
  const actualTotal = holdings.reduce((sum, h) => sum + h.weight, 0);
  if (actualTotal > 0) {
    const scale = totalWeight / actualTotal;
    for (const h of holdings) {
      h.weight = Math.round(h.weight * scale * 100) / 100;
    }
  }

  // --- 加权涨跌幅 ---
  const weightedChange = holdings.reduce(
    (sum, h) => sum + (h.weight * h.changeToday) / 100,
    0,
  );

  // --- 行业占比明细 ---
  const sectorWeights = new Map<string, number>();
  for (let i = 0; i < holdings.length; i++) {
    const sector = template[i].sector;
    const current = sectorWeights.get(sector) || 0;
    sectorWeights.set(sector, current + holdings[i].weight);
  }

  const sectorBreakdown: SectorWeight[] = [];
  for (const [sector, weight] of sectorWeights) {
    const tag = SECTOR_STYLE_MAP[sector] || '其他';
    sectorBreakdown.push({
      sector,
      weight: Math.round(weight * 100) / 100,
      tag,
    });
  }
  // 按权重降序排列
  sectorBreakdown.sort((a, b) => b.weight - a.weight);

  // --- 板块自动识别 ---
  const sectorTags = deriveSectorTags(holdings, template);

  // --- 风格判定 ---
  const fundStyle = determineStyle(style, holdings, template);

  return {
    fundCode: fund.code,
    fundName: fund.name,
    holdings,
    weightedChange: Math.round(weightedChange * 100) / 100,
    sectorTags,
    sectorBreakdown,
    style: fundStyle,
    dataDate: '2026-03-31',
    source: '模拟数据',
  };
}

// ============================================================
// 板块标签自动识别
// ============================================================

function deriveSectorTags(
  holdings: TopHolding[],
  template: StockTemplate[],
): string[] {
  // 按板块标签聚合持仓权重
  const tagWeights = new Map<string, number>();
  for (let i = 0; i < holdings.length; i++) {
    const sector = template[i].sector;
    const tag = SECTOR_STYLE_MAP[sector] || '其他';
    const current = tagWeights.get(tag) || 0;
    tagWeights.set(tag, current + holdings[i].weight);
  }

  // 按权重降序
  const sorted = [...tagWeights.entries()].sort((a, b) => b[1] - a[1]);

  // 计算总权重
  const totalWeight = holdings.reduce((sum, h) => sum + h.weight, 0);

  // 前 3 大板块标签权重之和 > 50% → 取前 3
  const top3Weight = sorted.slice(0, 3).reduce((sum, [, w]) => sum + w, 0);
  if (top3Weight > totalWeight * 0.5) {
    return sorted.slice(0, 3).map(([tag]) => tag);
  }

  // 否则为均衡配置型
  return ['均衡配置型'];
}

// ============================================================
// 风格判定
// ============================================================

function determineStyle(
  style: StyleKey,
  holdings: TopHolding[],
  template: StockTemplate[],
): string {
  // 基于模板风格的简化判定
  switch (style) {
    case 'bluechip':
      return '大盘价值';
    case 'newEnergy':
      return '大盘成长';
    case 'medical':
      return '大盘成长';
    case 'tech':
      return '大盘成长';
    case 'financial':
      return '大盘价值';
    case 'qdii':
      return '大盘成长';
    default:
      return '均衡配置';
  }
}
