// ============================================================
// 基金评分体系 — 六维度加权（总分 100）
// ============================================================

export interface FundScore {
  momentum: number;       // 收益动量 0-25
  riskControl: number;    // 风险控制 0-20
  riskAdjusted: number;   // 风险调整收益 0-15
  manager: number;        // 经理能力 0-15
  scale: number;          // 规模流动性 0-15
  sectorMatch: number;    // 行业景气匹配 0-10
  total: number;          // 综合得分 0-100
}

export type ScoreDimension = keyof Omit<FundScore, 'total'>;

// ============================================================
// 交易信号
// ============================================================

export type TradeSignal = 'buy' | 'hold' | 'reduce' | 'sell';

export interface SignalResult {
  signal: TradeSignal;
  score: number;
  reason: string;
  suggestedPosition: string; // e.g. "10%-20%"
}

// ============================================================
// 基金基本信息
// ============================================================

export interface FundInfo {
  code: string;
  name: string;
  type: string;           // 偏股混合型 / 灵活配置型 / 指数型 ...
  manager: string;
  tenure: string;         // 任职年限
  managerReturn: string;  // 任职回报
  scale: number;          // 规模（亿元）
  inception: string;      // 成立日期
  company: string;        // 基金公司
}

// ============================================================
// 基金完整分析
// ============================================================

export interface FundAnalysis extends FundInfo {
  score: FundScore;
  signal: SignalResult;
  investAdvice: InvestAdvice | null;
  analysis: string;       // 200字以上分析文本
  riskMetrics: RiskMetrics;
  holdings: TopHolding[];
  sectorTags: string[];   // 行业标签
  peerComparison: PeerComparison;
  currentNav?: number;    // 当前单位净值
  navDate?: string;       // 净值日期
}

// ============================================================
// 定投建议
// ============================================================

export interface InvestAdvice {
  pePercentile: number;       // PE 历史分位
  multiplier: number;         // 本次定投倍数（服务层从范围中解析出的具体值）
  strategy: string;           // 策略说明
}

// ============================================================
// 风险指标
// ============================================================

export interface RiskMetrics {
  maxDrawdown: number;    // 最大回撤 (%)
  volatility: number;     // 年化波动率 (%)
  sharpe: number;         // 夏普比率
  sortino: number;        // 索提诺比率
  calmar: number;         // 卡尔玛比率
  infoRatio: number;      // 信息比率
  beta: number;           // Beta
  alpha: number;          // Alpha
}

// ============================================================
// 重仓股
// ============================================================

export interface TopHolding {
  stockCode: string;
  stockName: string;
  weight: number;         // 占净值比 (%)
  changeToday: number;    // 今日涨跌幅 (%)
}

// ============================================================
// 同业比较
// ============================================================

export interface PeerComparison {
  rankPercentile: number; // 同类排名百分位
  totalPeers: number;
  categoryAvgReturn: number;
  fundReturn: number;
}

// ============================================================
// 行业板块
// ============================================================

export interface SectorInfo {
  name: string;
  changePercent: number;
  change5d: number;
  netInflow: number;      // 主力资金净流入（亿）
  upCount: number;
  downCount: number;
  reason: string;         // 涨跌理由
  isHot: boolean;         // 连续3日上涨标记
}

// ============================================================
// 市场概览
// ============================================================

export interface MarketOverview {
  date: string;
  topGainers: SectorInfo[];
  topLosers: SectorInfo[];
  hotSectors: SectorInfo[];
  allSectors: SectorInfo[];
  events: MarketEvent[];
  opportunities: string[];
  risks: string[];
}

export interface MarketEvent {
  title: string;
  time: string;
  source: string;
  summary: string;
  bullishSectors: string[];
  bearishSectors: string[];
  severity: 'critical' | 'important' | 'normal';
}

// ============================================================
// API 通用响应
// ============================================================

export type ApiResponse<T> =
  | { success: true; data: T; timestamp: string }
  | { success: false; error: string; timestamp: string };
