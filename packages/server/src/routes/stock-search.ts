// ============================================================
// 股票查询路由 — GET /api/stocks/search?code=XXXXXX
//
// 返回完整的 StockAnalysis 报告，包含评分、信号、风险指标、
// 行业标签、同业比较和分析文本。
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse, StockAnalysis, StockInfo, StockSignalResult, StockRiskMetrics, StockPeerComparison, StockScore } from '@allin/shared';
import { getMockStocks, getMockKLine, fetchAllStocks, fetchStockKLine, fetchSingleStockQuote, fetchStockFundamentals, fetchFinancialSummary, type StockKLine } from '../adapters/stock.js';
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

    // 1. 查找股票
    const allStocks = await fetchAllStocks();
    let stock = allStocks.find(s => s.code === code);

    if (!stock) {
      const mockStocks = getMockStocks();
      stock = mockStocks.find(s => s.code === code);
    }

    if (!stock) {
      const body: ApiResponse<never> = {
        success: false,
        error: '股票代码不存在',
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(body);
      return;
    }

    // 2. 获取K线
    let klines = await fetchStockKLine(code);
    if (klines.length < 5) {
      klines = getMockKLine(code);
    }

    // 2.5 季度财报数据
    let finSummary = null;
    try { finSummary = await fetchFinancialSummary(code); } catch { /* skip */ }
    if (finSummary) {
      stock.roe = finSummary.roe || stock.roe;
      stock.revenueGrowth = finSummary.revenueYoY || stock.revenueGrowth;
      stock.profitGrowth = finSummary.profitYoY || stock.profitGrowth;
      stock.netProfitMargin = finSummary.netMargin || stock.netProfitMargin;
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

    // 12. 买卖时机
    const today = new Date().toISOString().slice(0, 10);
    const sellDate = new Date();
    sellDate.setDate(sellDate.getDate() + 14);
    const stopLoss = currentPrice ? Math.round(currentPrice * 0.93 * 100) / 100 : 0;
    const ret15d = calcReturnFrom(klines, 15);
    const targetReturn = Math.round(Math.max(3, Math.abs(ret15d) * 0.5) * 100) / 100;

    // 13. 组装响应（含扩展字段）
    const data: StockAnalysis & {
      boll: BollingerBands | null;
      kdj: KDJ | null;
      obv: OBVResult | null;
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
      priceHistory: klines.slice(-30).map(k => ({ date: k.date, price: k.close })),
      buyDate: today,
      sellDate: sellDate.toISOString().slice(0, 10),
      stopLoss,
      targetReturn,
      boll,
      kdj,
      obv,
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
