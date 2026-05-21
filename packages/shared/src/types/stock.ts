// ============================================================
// 股票评分体系 — 六维度加权（总分 100）
// ============================================================

export interface StockScore {
  momentum: number;       // 收益动量 0-25
  riskControl: number;    // 风险控制 0-20
  riskAdjusted: number;   // 风险调整收益 0-15
  companyQuality: number; // 公司质量 0-15
  valuation: number;      // 估值性价比 0-15
  sectorMatch: number;    // 行业景气匹配 0-10
  total: number;          // 综合得分 0-100
}

export type StockScoreDimension = keyof Omit<StockScore, 'total'>;

// ============================================================
// 交易信号
// ============================================================

export type StockTradeSignal = 'buy' | 'hold' | 'reduce' | 'sell';

export interface StockSignalResult {
  signal: StockTradeSignal;
  score: number;
  reason: string;
  suggestedPosition: string;
}

// ============================================================
// 股票基本信息
// ============================================================

export interface StockInfo {
  code: string;
  name: string;
  industry: string;       // 申万一级行业
  subIndustry: string;    // 申万二级行业
  marketCap: number;      // 流通市值（亿元）
  totalCap: number;       // 总市值（亿元）
  pe: number;             // 市盈率(TTM)
  pb: number;             // 市净率
  roe: number;            // ROE (%)
  revenueGrowth: number;  // 营收增速 (%)
  profitGrowth: number;   // 净利润增速 (%)
  netProfitMargin: number;// 净利率 (%)
  inception: string;      // 上市日期
  exchange: string;       // SH/SZ/BJ
}

// ============================================================
// 股票完整分析
// ============================================================

export interface StockAnalysis extends StockInfo {
  score: StockScore;
  signal: StockSignalResult;
  investAdvice: StockInvestAdvice | null;
  analysis: string;
  riskMetrics: StockRiskMetrics;
  sectorTags: string[];
  peerComparison: StockPeerComparison;
  currentPrice?: number;
  priceDate?: string;
  priceHistory?: Array<{ date: string; price: number }>;
  buyDate?: string;
  sellDate?: string;
  stopLoss?: number;
  targetReturn?: number;
}

// ============================================================
// 定投/买入建议
// ============================================================

export interface StockInvestAdvice {
  pePercentile: number;
  industryPE: number;
  stockPE: number;
  multiplier: number;
  strategy: string;
}

// ============================================================
// 风险指标
// ============================================================

export interface StockRiskMetrics {
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  infoRatio: number;
  beta: number;
  alpha: number;
}

// ============================================================
// 同业比较（同行业股票）
// ============================================================

export interface StockPeerComparison {
  rankPercentile: number;
  totalPeers: number;
  industryAvgReturn: number;
  stockReturn: number;
}

// ============================================================
// 股票 K线数据条目
// ============================================================

export interface StockKLine {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  dailyReturn: number;
}

// ============================================================
// 推荐结果
// ============================================================

export interface StockRecommendResult {
  recommendations: StockAnalysis[];
  generatedAt: string;
  source: string;
  totalScanned: number;
}
