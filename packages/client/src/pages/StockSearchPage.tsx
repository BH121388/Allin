import { useState } from 'react';
import { useStockSearch } from '@/hooks/useStockSearch';
import { Search, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import PriceTrendChart from '@/components/stock/PriceTrendChart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { StockAnalysis } from '@allin/shared';

export default function StockSearchPage() {
  const [code, setCode] = useState('');
  const { stock, loading, error, search, clear } = useStockSearch();

  const handleSearch = () => {
    const trimmed = code.trim();
    if (trimmed) search(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-800 mb-4">A股查询分析</h1>

      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入股票代码，如 600519"
            maxLength={6}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || code.trim().length !== 6}
          className="px-6 py-2.5 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50 shrink-0"
        >
          查询
        </button>
        {stock && (
          <button
            onClick={() => { clear(); setCode(''); }}
            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 shrink-0"
          >
            清除
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      {stock && !loading && (
        <StockReport stock={stock} />
      )}

      {/* Empty initial state */}
      {!stock && !loading && !error && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-16 text-center">
          <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">输入6位A股代码查询完整分析报告</p>
          <p className="text-xs text-slate-400 mt-1">例如：600519（贵州茅台）、300750（宁德时代）</p>
        </div>
      )}
    </div>
  );
}

function StockReport({ stock }: { stock: StockAnalysis }) {
  const score = stock.score;
  const grade = getStockGradeText(score.total);
  const signalConfig = getSignalConfig(stock.signal.signal);

  return (
    <div className="space-y-4">
      {/* Basic info card */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{stock.name}</h2>
            <p className="text-sm text-slate-500">{stock.code} · {stock.exchange === 'SH' ? '沪市' : stock.exchange === 'SZ' ? '深市' : stock.exchange}</p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold text-slate-800">{score.total}</span>
            <span className="text-sm text-slate-400">/100</span>
            <p className="text-sm text-slate-500">{grade}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <InfoItem label="行业" value={`${stock.industry}${stock.subIndustry ? ' / ' + stock.subIndustry : ''}`} />
          <InfoItem label="流通市值" value={`${stock.marketCap.toFixed(1)}亿`} />
          <InfoItem label="总市值" value={`${stock.totalCap.toFixed(1)}亿`} />
          <InfoItem label="上市日期" value={stock.inception || '--'} />
        </div>
      </div>

      {/* Score detail */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-semibold text-slate-800 mb-3">六维评分</h3>
        <div className="space-y-2">
          <ScoreRow label="收益动量" value={score.momentum} max={25} />
          <ScoreRow label="风险控制" value={score.riskControl} max={20} />
          <ScoreRow label="风险调整收益" value={score.riskAdjusted} max={15} />
          <ScoreRow label="公司质量" value={score.companyQuality} max={15} />
          <ScoreRow label="估值性价比" value={score.valuation} max={15} />
          <ScoreRow label="行业景气匹配" value={score.sectorMatch} max={10} />
        </div>
        {/* Score history mini chart */}
        {(stock as any).scoreHistory?.length >= 2 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-1">评分趋势（近30天）</p>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={(stock as any).scoreHistory.map((h: any) => ({ ...h, d: h.date.slice(5) }))}>
                <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={false} />
                <YAxis domain={['dataMin-5', 'dataMax+5']} hide />
                <XAxis dataKey="d" tick={{ fontSize: 8 }} hide />
                <Tooltip contentStyle={{ fontSize: 10 }} formatter={(v: number) => [v + '/100', '评分']} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Signal & advice */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-semibold text-slate-800 mb-3">操作建议</h3>
        <div className="flex items-center gap-3 mb-3">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${signalConfig.bg} ${signalConfig.text}`}>
            {signalConfig.icon}
            {signalConfig.label}
          </span>
          <span className="text-sm text-slate-500">{stock.signal.suggestedPosition}</span>
        </div>
        <p className="text-sm text-slate-600">{stock.signal.reason}</p>

        {stock.investAdvice && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-sm text-slate-600">
              估值建议：PE {stock.pe > 0 ? stock.pe.toFixed(1) : '亏损'}，
              分位约 {stock.investAdvice.pePercentile}%，
              {stock.investAdvice.strategy}
            </p>
          </div>
        )}
      </div>

      {/* Price trend chart */}
      {stock.priceHistory && stock.priceHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <PriceTrendChart data={stock.priceHistory} currentPrice={stock.currentPrice} />
        </div>
      )}

      {/* Price & timing */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-semibold text-slate-800 mb-3">交易时机</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <InfoItem label="当前价格" value={stock.currentPrice?.toFixed(2) ?? '--'} />
          <InfoItem label="建议买入日" value={stock.buyDate ?? '--'} />
          <InfoItem label="目标清仓日" value={stock.sellDate ?? '--'} />
          <InfoItem label="止损价" value={stock.stopLoss?.toFixed(2) ?? '--'} />
        </div>
      </div>

      {/* Technical indicators */}
      {(stock as any).boll && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-semibold text-slate-800 mb-3">技术指标</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* BOLL */}
            {(stock as any).boll && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-2">布林带 BOLL(20,2)</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">上轨</span><span className="font-medium text-red-500">{(stock as any).boll.upper}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">中轨</span><span className="font-medium text-slate-700">{(stock as any).boll.middle}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">下轨</span><span className="font-medium text-green-500">{(stock as any).boll.lower}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">带宽</span><span>{(stock as any).boll.bandwidth}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">价格位置</span><span>{((stock as any).boll.percentB * 100).toFixed(0)}%</span></div>
                </div>
              </div>
            )}
            {/* KDJ */}
            {(stock as any).kdj && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-2">KDJ(9,3,3)</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">K</span><span className="font-medium">{Math.round((stock as any).kdj.k)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">D</span><span className="font-medium">{Math.round((stock as any).kdj.d)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">J</span><span className={`font-medium ${(stock as any).kdj.j > 100 ? 'text-red-500' : (stock as any).kdj.j < 0 ? 'text-green-500' : ''}`}>{Math.round((stock as any).kdj.j)}</span></div>
                  <div className="mt-1 pt-1 border-t border-slate-200">
                    <span className={`text-xs ${(stock as any).kdj.signal === 'overbought' ? 'text-red-500' : (stock as any).kdj.signal === 'oversold' ? 'text-green-500' : 'text-slate-500'}`}>
                      {(stock as any).kdj.description}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {/* OBV */}
            {(stock as any).obv && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-2">OBV 能量潮</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">OBV</span><span className="font-medium">{(stock as any).obv.latestOBV.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">MA20</span><span>{(stock as any).obv.obvMA.toLocaleString()}</span></div>
                  <div className="mt-1 pt-1 border-t border-slate-200">
                    <span className={`text-xs ${(stock as any).obv.divergence === 'bullish' ? 'text-green-500' : (stock as any).obv.divergence === 'bearish' ? 'text-red-500' : 'text-slate-500'}`}>
                      {(stock as any).obv.description}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Risk metrics */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-semibold text-slate-800 mb-3">风险指标</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <InfoItem label="最大回撤" value={`${stock.riskMetrics.maxDrawdown.toFixed(1)}%`} />
          <InfoItem label="年化波动率" value={`${stock.riskMetrics.volatility.toFixed(1)}%`} />
          <InfoItem label="夏普比率" value={stock.riskMetrics.sharpe.toFixed(2)} />
          <InfoItem label="索提诺比率" value={stock.riskMetrics.sortino.toFixed(2)} />
          <InfoItem label="卡尔玛比率" value={stock.riskMetrics.calmar.toFixed(2)} />
          <InfoItem label="Beta" value={stock.riskMetrics.beta.toFixed(2)} />
          <InfoItem label="Alpha" value={`${stock.riskMetrics.alpha.toFixed(2)}%`} />
          <InfoItem label="信息比率" value={stock.riskMetrics.infoRatio.toFixed(2)} />
        </div>
      </div>

      {/* Fundamentals */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-semibold text-slate-800 mb-3">基本面</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <InfoItem label="PE(TTM)" value={stock.pe > 0 ? stock.pe.toFixed(1) : '亏损'} />
          <InfoItem label="PB" value={stock.pb.toFixed(1)} />
          <InfoItem label="ROE" value={`${stock.roe.toFixed(1)}%`} />
          <InfoItem label="营收增速" value={`${stock.revenueGrowth.toFixed(1)}%`} />
          <InfoItem label="净利润增速" value={`${stock.profitGrowth.toFixed(1)}%`} />
          <InfoItem label="净利率" value={`${stock.netProfitMargin.toFixed(1)}%`} />
        </div>
      </div>

      {/* Peer comparison */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-semibold text-slate-800 mb-3">同业比较</h3>
        <p className="text-sm text-slate-600">
          在约 {stock.peerComparison.totalPeers} 只同行股票中，
          排名约前 {stock.peerComparison.rankPercentile}%。
          近3月收益 {stock.peerComparison.stockReturn.toFixed(2)}%，
          行业均值约 {stock.peerComparison.industryAvgReturn.toFixed(2)}%。
        </p>
      </div>

      {/* Analysis text */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-semibold text-slate-800 mb-3">综合分析</h3>
        <p className="text-sm text-slate-600 leading-relaxed">{stock.analysis}</p>
      </div>

      {/* Sector tags */}
      {stock.sectorTags.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-semibold text-slate-800 mb-2">行业标签</h3>
          <div className="flex flex-wrap gap-2">
            {stock.sectorTags.map(tag => (
              <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 65 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-500' : 'bg-slate-300';

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-600 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-slate-500 w-12 text-right">{value}/{max}</span>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-slate-400">{label}</span>
      <p className="text-sm text-slate-700">{value}</p>
    </div>
  );
}

function getStockGradeText(total: number): string {
  if (total >= 85) return '强烈推荐';
  if (total >= 75) return '推荐';
  if (total >= 65) return '谨慎偏乐观';
  if (total >= 50) return '观望';
  return '不推荐';
}

function getSignalConfig(signal: string) {
  switch (signal) {
    case 'buy': return { label: '买入', bg: 'bg-green-100', text: 'text-green-700', icon: <TrendingUp className="w-3.5 h-3.5" /> };
    case 'hold': return { label: '持有', bg: 'bg-blue-100', text: 'text-blue-700', icon: <TrendingUp className="w-3.5 h-3.5" /> };
    case 'reduce': return { label: '减持', bg: 'bg-amber-100', text: 'text-amber-700', icon: <TrendingDown className="w-3.5 h-3.5" /> };
    case 'sell': return { label: '卖出', bg: 'bg-red-100', text: 'text-red-700', icon: <AlertTriangle className="w-3.5 h-3.5" /> };
    default: return { label: signal, bg: 'bg-slate-100', text: 'text-slate-700', icon: null };
  }
}
