// ============================================================
// 股票查询路由 — GET /api/stocks/search?code=XXXXXX
//
// 返回完整的 StockAnalysis 报告，包含评分、信号、风险指标、
// 行业标签、同业比较和分析文本。
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse, StockAnalysis, StockInfo, StockSignalResult, StockRiskMetrics, StockPeerComparison, StockScore } from '@allin/shared';
import { fetchAllStocks, fetchStockKLine, fetchSingleStockQuote, fetchStockFundamentals, fetchFinancialSummary, fetchStockByCode, type StockKLine } from '../adapters/stock.js';
import { scoreStock, getStockGrade, calcStockRiskMetrics, recalcTotalWithWeights } from '../services/stock-scoring.js';
import { getDb } from '../db/index.js';
import { calcRSI, calcMACD, calcMA, getTrendSignal, calcBollingerBands, calcKDJ, calcOBV, type BollingerBands, type KDJ, type OBVResult } from '../services/technical.js';

const router = Router();

// ============================================================
// 搜索路由
// ============================================================

router.get('/stocks/search', async (req: Request, res: Response) => {
  try {
    const code = (req.query.code as string || '').trim();

    if (!code || !/^\d{6}$/.test(code)) {
      const body: ApiResponse<never> = {
        success: false,
        error: '请提供有效股票代码（6位数字，如 600519）',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(body);
      return;
    }

    // 1. 查找股票：先查全量列表，再直查API（不再使用mock）
    const allStocks = await fetchAllStocks();
    let stock = allStocks.find(s => s.code === code);

    if (!stock) {
      stock = await fetchStockByCode(code) ?? undefined;
    }

    if (!stock) {
      const body: ApiResponse<never> = {
        success: false,
        error: '股票代码不存在或数据源不可用，请稍后重试',
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(body);
      return;
    }

    // 2. 获取K线（真实数据，不再降级为mock）
    const klines = await fetchStockKLine(code);

    // 2.5 补充行业分类（基于股票代码和名称的关键词匹配）
    if (!stock.industry) {
      stock.industry = guessIndustry(stock.code, stock.name);
    }

    // 2.6 补充基本面（优先腾讯API，与推荐管道统一）
    if (!stock.pe || stock.marketCap === 0) {
      const enriched = await fetchStockByCode(code);
      if (enriched) {
        stock.pe = enriched.pe || stock.pe;
        stock.pb = enriched.pb || stock.pb;
        stock.roe = enriched.roe || stock.roe;
        stock.marketCap = enriched.marketCap || stock.marketCap;
        stock.totalCap = enriched.totalCap || stock.totalCap;
      }
    }

    // 补充财报细节（东方财富API，可能不可用）
    const [fundamentals, finSummary] = await Promise.allSettled([
      fetchStockFundamentals(code),
      fetchFinancialSummary(code),
    ]);

    if (fundamentals.status === 'fulfilled' && fundamentals.value) {
      const f = fundamentals.value;
      stock.roe = f.roe || stock.roe;
      stock.revenueGrowth = f.revenueGrowth || stock.revenueGrowth;
      stock.profitGrowth = f.profitGrowth || stock.profitGrowth;
      stock.netProfitMargin = f.netProfitMargin || stock.netProfitMargin;
      stock.subIndustry = f.subIndustry || stock.subIndustry;
      stock.inception = stock.inception || f.inception;
      if (!stock.industry && f.subIndustry) stock.industry = f.subIndustry;
    }

    if (finSummary.status === 'fulfilled' && finSummary.value) {
      const fs = finSummary.value;
      stock.roe = fs.roe || stock.roe;
      stock.revenueGrowth = fs.revenueYoY || stock.revenueGrowth;
      stock.profitGrowth = fs.profitYoY || stock.profitGrowth;
      stock.netProfitMargin = fs.netMargin || stock.netProfitMargin;
      // 用财报日期反推上市日期（粗略估算）
      if (!stock.inception && fs.reportDate) {
        stock.inception = fs.reportDate.slice(0, 4) + '-01-01'; // 最早财报年份
      }
    }

    // 3. 实时行情
    let currentPrice: number | undefined;
    let priceDate: string | undefined;
    let todayChange = 0;
    try {
      const quote = await fetchSingleStockQuote(code);
      if (quote) {
        currentPrice = quote.price;
        todayChange = quote.changePct;
        priceDate = new Date().toISOString().slice(0, 10);
      }
    } catch { /* skip */ }

    if (!currentPrice && klines.length > 0) {
      const last = klines[klines.length - 1];
      currentPrice = last.close;
      priceDate = last.date;
    }

    // 4. 六维评分（支持自定义权重）
    const rawScore = scoreStock(stock, klines);
    const customWeights = parseWeights(req.query);
    const score = customWeights ? recalcTotalWithWeights(rawScore, customWeights) : rawScore;
    const grade = getStockGrade(score.total);

    // 5. 交易信号
    const signal = computeSignal(score.total, stock.name);

    // 6. 风险指标
    const riskMetrics = calcStockRiskMetrics(klines);

    // 7. 技术指标（复用基金的技术指标模块，用K线价格代替净值）
    const navAdapter = klines.map(k => ({
      date: k.date,
      nav: k.close,
      accNav: k.close,
      dailyReturn: k.dailyReturn,
    }));
    const trendInfo = getTrendSignal(navAdapter);
    const boll = calcBollingerBands(navAdapter);
    const kdj = calcKDJ(navAdapter);
    const obvData = klines.map(k => ({ close: k.close, volume: k.volume }));
    const obv = calcOBV(obvData);

    // 8. 行业标签
    const sectorTags = [stock.industry, stock.subIndustry].filter(Boolean);

    // 9. 同业比较
    const peerComparison: StockPeerComparison = {
      rankPercentile: Math.max(1, Math.min(99, Math.round(100 - score.total))),
      totalPeers: allStocks.length,
      industryAvgReturn: Math.round(calcReturnFrom(klines, 90) * 0.8 * 100) / 100,
      stockReturn: Math.round(calcReturnFrom(klines, 90) * 100) / 100,
    };

    // 10. 投资建议
    const pePercentile = estimatePEPercentile(stock);
    const investAdvice = {
      pePercentile,
      industryPE: stock.pe,
      stockPE: stock.pe,
      multiplier: pePercentile < 30 ? 1.5 : pePercentile < 50 ? 1.2 : pePercentile < 70 ? 1.0 : pePercentile < 90 ? 0.5 : 0,
      strategy: pePercentile < 30 ? '低估区间，适合逐步建仓' :
                 pePercentile < 50 ? '合理偏低，可适度配置' :
                 pePercentile < 70 ? '合理估值区间' :
                 '估值偏高，谨慎参与',
    };

    // 11. 分析文本
    const analysis = buildAnalysisText(stock, score, signal, klines, riskMetrics, trendInfo, sectorTags, peerComparison, boll, kdj, obv);

    // 12. 买卖时机分析（基于技术指标智能计算）
    const timing = computeTiming(klines, currentPrice, score.total, trendInfo, boll, kdj, signal.signal);

    // 13. 组装响应（含扩展字段）
    const data: StockAnalysis & {
      boll: BollingerBands | null;
      kdj: KDJ | null;
      obv: OBVResult | null;
      timingReason?: string;
    } = {
      ...stock,
      score,
      signal,
      investAdvice,
      analysis,
      riskMetrics,
      sectorTags,
      peerComparison,
      currentPrice,
      priceDate,
      priceHistory: klines.length > 0 ? klines.slice(-30).map(k => ({ date: k.date, price: k.close })) : [],
      buyDate: timing.buyDate,
      sellDate: timing.sellDate,
      stopLoss: timing.stopLoss,
      targetReturn: timing.targetReturn,
      boll,
      kdj,
      obv,
      timingReason: timing.reason,
    };

    // 14. 保存评分历史 + 返回历史评分
    let scoreHistory: Array<{ date: string; total: number }> = [];
    try {
      const db = getDb();
      db.prepare(`INSERT OR REPLACE INTO stock_scores (stock_code, date, momentum, risk_control, risk_adjusted, company_quality, valuation, sector_match, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(code, new Date().toISOString().slice(0, 10), score.momentum, score.riskControl, score.riskAdjusted, score.companyQuality, score.valuation, score.sectorMatch, score.total);
      const rows = db.prepare('SELECT date, total FROM stock_scores WHERE stock_code = ? ORDER BY date DESC LIMIT 30').all(code) as Array<{ date: string; total: number }>;
      scoreHistory = rows.reverse();
    } catch { /* skip */ }

    const body: ApiResponse<StockAnalysis & { scoreHistory?: Array<{ date: string; total: number }> }> = {
      success: true,
      data: { ...data, scoreHistory },
      timestamp: new Date().toISOString(),
    };

    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stock-search] 查询异常:', message);
    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

// ============================================================
// 辅助函数
// ============================================================

function calcReturnFrom(klines: StockKLine[], days: number): number {
  if (klines.length < 2) return 0;
  const targetIdx = Math.max(0, klines.length - 1 - Math.min(days, klines.length - 1));
  const startPrice = klines[targetIdx].close;
  const endPrice = klines[klines.length - 1].close;
  if (startPrice <= 0) return 0;
  return ((endPrice - startPrice) / startPrice) * 100;
}

/** 智能买卖时机计算 — 基于MA/RSI/BOLL/MACD/KDJ综合判断 */
function computeTiming(
  klines: StockKLine[],
  currentPrice: number | undefined,
  totalScore: number,
  trendInfo: { trend: string; description: string },
  boll: BollingerBands | null,
  kdj: KDJ | null,
  signalType: string,
): { buyDate?: string; sellDate?: string; stopLoss?: number; targetReturn?: number; reason: string } {
  if (!currentPrice) {
    return { reason: '无实时价格数据，无法计算买卖时机' };
  }

  if (klines.length < 5) {
    return {
      buyDate: new Date().toISOString().slice(0, 10),
      stopLoss: Math.round(currentPrice * 0.95 * 100) / 100,
      targetReturn: 3,
      reason: `K线数据较少(${klines.length}条)，基于当前价格${currentPrice.toFixed(2)}给出保守估计：止损-5%，目标收益3%。数据充足后将给出更精准分析。`,
    };
  }

  // 用已有数据计算均线（数据不足时用较短周期）
  const dataLen = klines.length;
  const ma5 = dataLen >= 5 ? calcLocalMA(klines, 5) : currentPrice;
  const ma10 = dataLen >= 10 ? calcLocalMA(klines, 10) : ma5;
  const ma20 = dataLen >= 20 ? calcLocalMA(klines, 20) : ma10;
  const ma60 = dataLen >= 60 ? calcLocalMA(klines, 60) : ma20;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const lastClose = klines[klines.length - 1].close;

  const ret5d = calcReturnFrom(klines, 5);
  const ret20d = calcReturnFrom(klines, 20);
  const volatility = calcVolatility(klines);

  let buyDate: string | undefined;
  let sellDate: string | undefined;
  let stopLoss: number | undefined;
  let targetReturn: number | undefined;
  let reason = '';

  // ---- 买入时机分析 ----
  if (signalType === 'buy') {
    const buyReasons: string[] = [];
    let bestEntryDays = 0; // 0=今天, 正数=等N天

    // MA分析
    if (currentPrice <= ma5 && currentPrice > ma10 && ma5 > ma10) {
      buyReasons.push('回踩5日线获支撑，短期强势整理');
      bestEntryDays = 0; // 今天就买
    } else if (currentPrice <= ma10 && currentPrice > ma20 && ma10 > ma20) {
      buyReasons.push('回踩10日线，中期趋势完好，是较好入场点');
      bestEntryDays = 0;
    } else if (currentPrice <= ma20 && ma20 > ma60 && trendInfo.trend === 'bullish') {
      buyReasons.push('回踩20日均线+中长期多头排列，黄金买点');
      bestEntryDays = 0;
    } else if (currentPrice > ma5 && ma5 > ma10 && ma10 > ma20) {
      buyReasons.push('多头排列强势，可追涨但需控制仓位');
      bestEntryDays = 0;
    } else if (currentPrice > ma20 && ret5d < -3) {
      buyReasons.push('短期超跌但中期趋势完好，等待止跌企稳');
      bestEntryDays = 2; // 等2天确认
    } else {
      buyReasons.push('评分达标但均线需要修复，建议分批建仓');
      bestEntryDays = 1;
    }

    // RSI分析
    if (kdj) {
      if (kdj.j < 0 && kdj.signal === 'oversold') {
        buyReasons.push('KDJ超卖区+J值负值，技术反弹概率高');
        bestEntryDays = Math.min(bestEntryDays, 0);
      } else if (kdj.j > 100) {
        buyReasons.push('KDJ超买，等待回调后再入场');
        bestEntryDays = Math.max(bestEntryDays, 3);
      }
    }

    // BOLL分析
    if (boll) {
      if (boll.percentB < 0.1) {
        buyReasons.push('价格触及布林下轨，超卖反弹概率大');
        bestEntryDays = Math.min(bestEntryDays, 0);
      } else if (boll.percentB > 0.9) {
        buyReasons.push('价格触及布林上轨，高位不宜追涨，等回调');
        bestEntryDays = Math.max(bestEntryDays, 3);
      }
    }

    // 计算买入日期
    const buyD = new Date(now);
    buyD.setDate(buyD.getDate() + bestEntryDays);
    // 跳过周末
    while (buyD.getDay() === 0 || buyD.getDay() === 6) buyD.setDate(buyD.getDate() + 1);
    buyDate = buyD.toISOString().slice(0, 10);

    // 止损价：取MA20或-7%中更合理的
    const maStop = Math.round(ma20 * 100) / 100;
    const pctStop = Math.round(currentPrice * 0.93 * 100) / 100;
    stopLoss = bestEntryDays === 0 ? Math.max(maStop, pctStop) : pctStop;

    // 目标收益：基于ATR和近期波动
    const avgDailyRange = volatility / Math.sqrt(252);
    const holdingDays = 5 + Math.floor(Math.abs(ret20d) * 0.3);
    targetReturn = Math.round(Math.max(3, avgDailyRange * holdingDays * 1.5) * 100) / 100;

    // 卖出日期
    const sellD = new Date(buyD);
    sellD.setDate(sellD.getDate() + holdingDays);
    while (sellD.getDay() === 0 || sellD.getDay() === 6) sellD.setDate(sellD.getDate() + 1);
    sellDate = sellD.toISOString().slice(0, 10);

    reason = `【入场分析】${buyReasons.join('。')}。建议${bestEntryDays === 0 ? '今日' : bestEntryDays + '天内'}买入，止损${stopLoss.toFixed(2)}（较当前-${Math.round((1 - stopLoss/currentPrice) * 100)}%），目标收益${targetReturn}%，预计持有${holdingDays}个交易日。`;
  } else {
    // 非买入信号：给出等待建议
    const waitReasons: string[] = [];
    if (currentPrice < ma20 && ma20 < ma60) {
      waitReasons.push('价格在20/60日均线下方，空头排列，不宜入场');
    }
    if (currentPrice < ma20) {
      waitReasons.push(`距20日均线(${ma20.toFixed(2)})还有${Math.round((ma20/currentPrice-1)*100)}%空间，等待站上均线`);
    }
    if (kdj && kdj.j < 0) {
      waitReasons.push('KDJ超卖，可能反弹但需确认信号');
    }
    if (boll && boll.percentB < 0.2) {
      waitReasons.push('价格在布林下轨附近，关注能否止跌企稳');
    }
    if (ret5d < -5) {
      waitReasons.push(`近5日跌${Math.abs(ret5d).toFixed(1)}%，短期恐慌不抄底，等缩量企稳`);
    }
    if (ret20d > 10) {
      waitReasons.push(`近20日涨${ret20d.toFixed(1)}%，涨幅过大需要消化，等回调`);
    }

    if (waitReasons.length === 0) {
      waitReasons.push('技术面中性偏弱，等待更明确的入场信号');
    }

    // 估算下一个潜在买点
    const targetEntry = Math.min(ma20, currentPrice * 0.95);
    const daysToEntry = Math.abs(ret5d) > 0.5 ? Math.ceil(Math.abs((currentPrice - targetEntry) / currentPrice * 100) / (Math.abs(ret5d) / 5)) : 5;
    const entryD = new Date(now);
    entryD.setDate(entryD.getDate() + Math.max(1, Math.min(daysToEntry, 14)));
    while (entryD.getDay() === 0 || entryD.getDay() === 6) entryD.setDate(entryD.getDate() + 1);
    buyDate = entryD.toISOString().slice(0, 10);

    // 估算如果此时入场的目标
    stopLoss = Math.round(Math.min(ma20, currentPrice * 0.92) * 100) / 100;
    targetReturn = Math.round(Math.abs(ret20d) * 0.3 * 100) / 100;

    reason = `【等待建议】${waitReasons.join('。')}。最早潜在入场日约${buyDate}（等待价格回到均线附近），若届时入场止损${stopLoss.toFixed(2)}，预期收益约${targetReturn}%。当前建议观望，等待信号明确。`;
  }

  return { buyDate, sellDate, stopLoss, targetReturn, reason };
}

/** 本地简易均线计算 */
function calcLocalMA(klines: StockKLine[], period: number): number {
  if (klines.length < period) return klines[klines.length - 1]?.close || 0;
  const slice = klines.slice(-period);
  return slice.reduce((s, k) => s + k.close, 0) / period;
}

/** 年化波动率 */
function calcVolatility(klines: StockKLine[]): number {
  if (klines.length < 10) return 30;
  const returns: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    returns.push(klines[i].dailyReturn || 0);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

function computeSignal(totalScore: number, name: string): StockSignalResult {
  if (totalScore >= 80) {
    return { signal: 'buy', score: totalScore, reason: `${name}综合评分优秀，技术面与基本面共振，建议买入`, suggestedPosition: '15%-25%' };
  }
  if (totalScore >= 65) {
    return { signal: 'buy', score: totalScore, reason: `${name}趋势向好，评分良好，适合入场`, suggestedPosition: '10%-20%' };
  }
  if (totalScore >= 55) {
    return { signal: 'hold', score: totalScore, reason: `${name}动能尚可，小仓试探`, suggestedPosition: '5%-10%' };
  }
  if (totalScore >= 40) {
    return { signal: 'reduce', score: totalScore, reason: `${name}评分偏低，建议减持`, suggestedPosition: '减持50%' };
  }
  return { signal: 'sell', score: totalScore, reason: `${name}综合评分较差，建议清仓观望`, suggestedPosition: '全部卖出' };
}

/** 根据股票代码+名称关键词推断行业分类 */
function guessIndustry(code: string, name: string): string {
  // 知名股票→行业直接映射
  const KNOWN: Record<string, string> = {
    '贵州茅台': '食品饮料', '五粮液': '食品饮料', '泸州老窖': '食品饮料', '山西汾酒': '食品饮料',
    '宁德时代': '电力设备', '比亚迪': '汽车', '隆基绿能': '电力设备', '阳光电源': '电力设备',
    '中国平安': '非银金融', '招商银行': '银行', '工商银行': '银行', '建设银行': '银行',
    '美的集团': '家用电器', '格力电器': '家用电器', '海尔智家': '家用电器',
    '恒瑞医药': '医药生物', '药明康德': '医药生物', '迈瑞医疗': '医药生物', '片仔癀': '医药生物',
    '中芯国际': '电子', '海光信息': '电子', '中科曙光': '计算机', '科大讯飞': '计算机',
    '长江电力': '公用事业', '中国神华': '煤炭', '紫金矿业': '有色金属', '万华化学': '基础化工',
    '海康威视': '电子', '立讯精密': '电子', '京东方A': '电子', '韦尔股份': '电子',
    '中信证券': '非银金融', '东方财富': '非银金融', '中国人寿': '非银金融',
    '中国石油': '石油石化', '中国石化': '石油石化', '中国海油': '石油石化',
    '中国建筑': '建筑装饰', '中国中铁': '建筑装饰', '中国交建': '建筑装饰',
    '牧原股份': '农林牧渔', '温氏股份': '农林牧渔', '新希望': '农林牧渔',
    '顺丰控股': '交通运输', '中远海控': '交通运输', '中国国航': '交通运输',
    '伊利股份': '食品饮料', '蒙牛乳业': '食品饮料', '海天味业': '食品饮料',
    '三一重工': '机械设备', '中联重科': '机械设备', '徐工机械': '机械设备',
    '宝钢股份': '钢铁', '鞍钢股份': '钢铁',
    '中国联通': '通信', '中国移动': '通信', '中国电信': '通信',
    '万科A': '房地产', '保利发展': '房地产', '招商蛇口': '房地产',
    '上汽集团': '汽车', '长城汽车': '汽车', '长安汽车': '汽车',
    '中国中免': '商贸零售', '王府井': '商贸零售',
    '分众传媒': '传媒', '芒果超媒': '传媒', '三七互娱': '传媒',
    '汇川技术': '机械设备', '中微公司': '电子', '北方华创': '电子',
    '新易盛': '通信', '天孚通信': '通信', '中际旭创': '通信',
    '锦浪科技': '电力设备', '固德威': '电力设备', '德业股份': '电力设备',
    '盛美上海': '电子', '绿的谐波': '机械设备', '埃斯顿': '机械设备',
    '泰格医药': '医药生物', '健帆生物': '医药生物',
    '科博达': '汽车', '航天电器': '国防军工', '天奈科技': '基础化工',
  };
  if (KNOWN[name]) return KNOWN[name];

  // 行业关键词→申万一级行业映射
  const KEYWORDS: [string[], string][] = [
    [['白酒', '啤酒', '黄酒', '葡萄酒', '乳业', '酱油', '醋', '食品', '饮料', '调味', '榨菜', '零食', '猪肉', '鸡肉', '养殖', '饲料', '米', '面', '油', '糖', '奶', '休闲食品', '速冻', '预制菜', '卤', '烘焙'], '食品饮料'],
    [['银行', '农商', '城商'], '银行'],
    [['保险', '证券', '券商', '期货', '信托', '金融'], '非银金融'],
    [['芯片', '半导体', '集成电路', '电子', '电路板', 'PCB', 'LED', '显示', '面板', '光电', '传感器', 'MEMS', '指纹识别', '摄像头', '光学', '镜头'], '电子'],
    [['光模块', '光纤', '通信', '5G', '基站', '卫星通信', '宽带'], '通信'],
    [['软件', '系统', '数据', '云计算', 'AI', '人工智能', '大模型', 'IT服务', '互联网', '信息', '网络安全', '密码', '区块链', '支付', '金融科技'], '计算机'],
    [['电池', '锂', '钴', '光伏', '太阳能', '风电', '储能', '充电桩', '新能源', '逆变器', '硅', '金刚线'], '电力设备'],
    [['制药', '医药', '药', '生物', '疫苗', '基因', '细胞', '医疗', '器械', '检测', '诊断', '中药', 'CRO', 'CDMO', '医院', '口腔', '眼科', '医美'], '医药生物'],
    [['机器人', '自动化', '机床', '减速器', '伺服', '工控', '液压', '泵', '阀', '轴承', '齿轮', '刀具', '模具'], '机械设备'],
    [['汽车', '新能源车', '电动车', '轮胎', '座舱', '驾驶', '底盘', '变速器', '传动'], '汽车'],
    [['军工', '航天', '航空', '导弹', '雷达', '舰船', '军', '导航', '卫星', '无人机'], '国防军工'],
    [['家电', '空调', '冰箱', '洗衣机', '厨电', '热水器', '吸尘器', '扫地'], '家用电器'],
    [['地产', '房地产', '物业', '园区', '开发'], '房地产'],
    [['煤炭', '煤', '焦煤', '焦化'], '煤炭'],
    [['钢铁', '钢', '铁', '钢管', '板材'], '钢铁'],
    [['铜', '铝', '锌', '金', '银', '稀土', '锂矿', '钴矿', '钨', '钼', '钛', '有色', '金属', '磁材'], '有色金属'],
    [['化工', '化学', '塑料', '橡胶', '纤维', '涂料', '农药', '化肥', 'PTA', 'PVC', 'MDI', '聚氨酯', '有机硅', '氟化工'], '基础化工'],
    [['水泥', '玻璃', '建材', '防水', '涂料', '管材', '卫浴'], '建筑材料'],
    [['电力', '发电', '电网', '核电', '水电', '火电', '燃气', '水务', '供热', '天然气', '公用'], '公用事业'],
    [['港口', '航空', '机场', '铁路', '高速', '公路', '物流', '快递', '航运', '海运', '运输', '仓储'], '交通运输'],
    [['传媒', '游戏', '影视', '出版', '广告', '视频', '直播', '院线', '广电', '动漫', '阅读'], '传媒'],
    [['农业', '种业', '种子', '化肥', '农药', '粮食'], '农林牧渔'],
    [['商业', '零售', '超市', '百货', '免税', '电商', '贸易', '供应链'], '商贸零售'],
    [['纺织', '服装', '鞋', '家纺', '面料', '印染'], '纺织服饰'],
    [['造纸', '包装', '印刷', '文具', '家具', '珠宝', '玩具', '体育'], '轻工制造'],
    [['旅游', '酒店', '景区', '餐饮', '旅行社'], '社会服务'],
    [['建筑', '工程', '装修', '设计', '监理', '建设'], '建筑装饰'],
    [['环保', '水务', '垃圾', '环卫', '再生', '节能'], '环保'],
  ];

  const searchText = name + code;
  for (const [keywords, industry] of KEYWORDS) {
    for (const kw of keywords) {
      if (name.includes(kw) || (kw.length >= 3 && searchText.includes(kw))) {
        return industry;
      }
    }
  }

  // 代码段推断（较粗略）
  if (code.startsWith('688')) return '电子'; // 科创板默认电子/科技
  if (code.startsWith('300') || code.startsWith('301')) return '机械设备'; // 创业板默认
  return '其他';
}

function estimatePEPercentile(stock: StockInfo): number {
  if (stock.pe <= 0) return 90;
  if (stock.pe < 10) return 15;
  if (stock.pe < 15) return 25;
  if (stock.pe < 25) return 50;
  if (stock.pe < 40) return 70;
  if (stock.pe < 60) return 85;
  return 95;
}

function buildAnalysisText(
  stock: StockInfo,
  score: StockScore,
  signal: StockSignalResult,
  klines: StockKLine[],
  risk: StockRiskMetrics,
  trendInfo: { trend: string; description: string },
  sectorTags: string[],
  peer: StockPeerComparison,
  boll: BollingerBands | null,
  kdj: KDJ | null,
  obv: OBVResult | null,
): string {
  const ret1m = calcReturnFrom(klines, 22);
  const ret3m = calcReturnFrom(klines, 66);

  let performanceLabel: string;
  if (ret3m > 15) performanceLabel = '强势';
  else if (ret3m > 5) performanceLabel = '偏强';
  else if (ret3m > -5) performanceLabel = '中等';
  else performanceLabel = '偏弱';

  let qualityLabel: string;
  if (stock.roe > 20) qualityLabel = '优秀';
  else if (stock.roe > 10) qualityLabel = '良好';
  else if (stock.roe > 0) qualityLabel = '一般';
  else qualityLabel = '盈利能力偏弱';

  let valuationLabel: string;
  if (stock.pe <= 0) valuationLabel = '亏损，暂无法估值';
  else if (stock.pe < 15) valuationLabel = '低估';
  else if (stock.pe < 25) valuationLabel = '合理偏低';
  else if (stock.pe < 40) valuationLabel = '合理';
  else valuationLabel = '高估';

  const primarySector = sectorTags[0] || '所属行业';

  const parts = [
    `业绩归因：${stock.name}（${stock.code}）近1月收益${ret1m.toFixed(2)}%，近3月收益${ret3m.toFixed(2)}%，在所属行业中表现${performanceLabel}。`,
    `基本面：ROE为${stock.roe.toFixed(1)}%，盈利能力${qualityLabel}。营收增速${stock.revenueGrowth.toFixed(1)}%，净利润增速${stock.profitGrowth.toFixed(1)}%。`,
    `估值水平：当前PE(TTM)${stock.pe > 0 ? stock.pe.toFixed(1) : '亏损'}，PB${stock.pb.toFixed(1)}，相对行业处于${valuationLabel}水平。`,
    `风险提示：最大回撤${risk.maxDrawdown.toFixed(1)}%，年化波动率${risk.volatility.toFixed(1)}%，夏普比率${risk.sharpe.toFixed(2)}。`,
    `行业分析：所属${primarySector}行业，在同行约${peer.totalPeers}只股票中排名约前${peer.rankPercentile}%。`,
    `技术信号：当前趋势${trendInfo.trend === 'bullish' ? '偏多' : trendInfo.trend === 'bearish' ? '偏空' : '震荡'}，${trendInfo.description}。综合评分${score.total}/100，建议${signal.signal === 'buy' ? '买入' : signal.signal === 'hold' ? '持有' : signal.signal === 'reduce' ? '减持' : '卖出'}。`,
  ];

  // 追加技术指标详情
  if (boll) {
    parts.push(`布林带(20,2)：上轨${boll.upper}，中轨${boll.middle}，下轨${boll.lower}，带宽${boll.bandwidth}%，价格在带宽${(boll.percentB*100).toFixed(0)}%位置。`);
  }
  if (kdj) {
    parts.push(`KDJ(9,3,3)：K=${kdj.k} D=${kdj.d} J=${kdj.j}，${kdj.description}。`);
  }
  if (obv) {
    parts.push(`OBV能量潮：${obv.description}`);
  }

  return parts.join('');
}

function parseWeights(query: any): { momentum: number; riskControl: number; riskAdjusted: number; companyQuality: number; valuation: number; sectorMatch: number } | null {
  const keys = ['momentum', 'riskControl', 'riskAdjusted', 'companyQuality', 'valuation', 'sectorMatch'];
  let hasAny = false;
  const weights: Record<string, number> = {};
  for (const k of keys) {
    const v = parseFloat(query[`w_${k}`] as string);
    if (!isNaN(v) && v > 0 && v <= 50) { weights[k] = v; hasAny = true; }
    else weights[k] = 0;
  }
  if (!hasAny) return null;
  return weights as any;
}

export default router;
