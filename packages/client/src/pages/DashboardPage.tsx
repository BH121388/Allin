import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, Wallet, Star, ShieldAlert, RefreshCw, BarChart3 } from 'lucide-react';

interface PredictionMini { buySignal: boolean; totalScore: number; confidence: number; summary: string; riskNote: string; }
interface RecStock { code: string; name: string; industry: string; score: { total: number }; currentPrice?: number; pe: number; targetReturn?: number; signal: { signal: string }; }
interface WatchItem { code: string; name: string; price: number; changePct: number; }
interface PortfolioSummary { totalValue: number; totalPnl: number; pnlPercent: number; count: number; }

export default function DashboardPage() {
  const [prediction, setPrediction] = useState<PredictionMini | null>(null);
  const [recs, setRecs] = useState<RecStock[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = () => Promise.allSettled([
      fetch('/api/stocks/predict').then(r => r.json()),
      fetch('/api/stocks/recommend').then(r => r.json()),
      fetch('/api/stocks/watchlist').then(r => r.json()),
      fetch('/api/stock-portfolio').then(r => r.json()),
    ]).then(([p, r, w, pf]) => {
      if (p.status === 'fulfilled' && p.value.success) setPrediction({ buySignal: p.value.data.buySignal, totalScore: p.value.data.totalScore, confidence: p.value.data.confidence, summary: p.value.data.summary, riskNote: p.value.data.riskNote });
      if (r.status === 'fulfilled' && r.value.success) setRecs(r.value.data.recommendations?.slice(0, 3) || []);
      if (w.status === 'fulfilled' && w.value.success) setWatchlist(w.value.data || []);
      if (pf.status === 'fulfilled' && pf.value.success) setPortfolio(pf.value.data.summary);
    }).finally(() => setLoading(false));

    fetchAll();
    const interval = setInterval(fetchAll, 60000); // Auto-refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const formatMoney = (v: number) => Math.abs(v) >= 1e8 ? `${(v/1e8).toFixed(1)}亿` : Math.abs(v) >= 1e4 ? `${(v/1e4).toFixed(0)}万` : v.toFixed(0);

  if (loading) return <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <h1 className="text-lg sm:text-xl font-bold text-slate-800 mb-3 sm:mb-4">投资仪表盘</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Left column: Prediction + Watchlist */}
        <div className="lg:col-span-2 space-y-3 sm:space-y-4">
          {/* Prediction mini */}
          {prediction && (
            <div className={`border-2 rounded-xl p-3 sm:p-4 ${prediction.buySignal ? 'bg-red-50/30 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-xl sm:text-2xl font-black shrink-0 ${prediction.buySignal ? 'bg-red-500 text-white' : 'bg-slate-500 text-white'}`}>
                  {prediction.buySignal ? '买' : '等'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm sm:text-base">{prediction.buySignal ? '明天建议买入' : '明天不建议买入'}</p>
                  <p className="text-xs sm:text-sm text-slate-600 line-clamp-2">{prediction.summary.slice(0, 100)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-700">{prediction.totalScore}</p>
                  <p className="text-xs text-slate-400">/100分</p>
                </div>
              </div>
            </div>
          )}

          {/* Top 3 recommendations */}
          <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <h2 className="font-semibold text-slate-800 text-sm sm:text-base mb-2 flex items-center gap-1.5"><Star className="w-4 h-4 text-amber-500" />今日推荐 Top 3</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {recs.map((s, i) => (
                <div key={s.code} className="bg-slate-50 rounded-lg p-2.5 sm:p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-slate-700 truncate">{s.name}</span>
                    <span className="text-xs font-bold text-slate-500">{s.score.total}分</span>
                  </div>
                  <div className="text-xs text-slate-400">{s.code} · {s.industry}</div>
                  <div className="flex justify-between text-xs mt-1.5">
                    <span>PE {s.pe > 0 ? s.pe.toFixed(1) : '--'}</span>
                    <span className={s.signal.signal === 'buy' ? 'text-green-600' : 'text-amber-600'}>{s.signal.signal === 'buy' ? '买入' : '持有'}</span>
                  </div>
                </div>
              ))}
              {recs.length === 0 && <div className="col-span-3 text-xs text-slate-400 py-4 text-center">暂无推荐数据</div>}
            </div>
          </div>

          {/* Watchlist */}
          <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <h2 className="font-semibold text-slate-800 text-sm sm:text-base mb-2 flex items-center gap-1.5"><Star className="w-4 h-4 text-slate-400" />自选股</h2>
            {watchlist.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {watchlist.map(w => (
                  <div key={w.code} className="flex items-center justify-between py-1.5">
                    <div>
                      <span className="text-sm text-slate-700">{w.name}</span>
                      <span className="text-xs text-slate-400 ml-1.5">{w.code}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">{w.price > 0 ? w.price.toFixed(2) : '--'}</span>
                      <span className={`text-xs ml-1.5 ${w.changePct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {w.changePct >= 0 ? '+' : ''}{w.changePct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-2">暂无自选股，在查询页添加</p>
            )}
          </div>
        </div>

        {/* Right column: Portfolio + Risk */}
        <div className="space-y-3 sm:space-y-4">
          {/* Portfolio summary */}
          <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <h2 className="font-semibold text-slate-800 text-sm sm:text-base mb-2 flex items-center gap-1.5"><Wallet className="w-4 h-4" />持仓概览</h2>
            {portfolio && portfolio.count > 0 ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-500">总市值</span><span className="font-medium">{formatMoney(portfolio.totalValue)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">总盈亏</span><span className={`font-medium ${portfolio.totalPnl >= 0 ? 'text-red-500' : 'text-green-500'}`}>{portfolio.totalPnl >= 0 ? '+' : ''}{formatMoney(portfolio.totalPnl)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">盈亏率</span><span className={`font-medium ${portfolio.pnlPercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>{portfolio.pnlPercent >= 0 ? '+' : ''}{portfolio.pnlPercent.toFixed(2)}%</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">持仓数</span><span>{portfolio.count} 只</span></div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-2">暂无持仓</p>
            )}
          </div>

          {/* Quick stats */}
          <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <h2 className="font-semibold text-slate-800 text-sm sm:text-base mb-2 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" />快速导航</h2>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <a href="/stocks/market" className="bg-slate-50 hover:bg-slate-100 rounded px-2 py-1.5 text-slate-600 text-center">市场概览</a>
              <a href="/stocks/screener" className="bg-slate-50 hover:bg-slate-100 rounded px-2 py-1.5 text-slate-600 text-center">股票筛选</a>
              <a href="/stocks/compare" className="bg-slate-50 hover:bg-slate-100 rounded px-2 py-1.5 text-slate-600 text-center">对比分析</a>
              <a href="/stocks/backtest" className="bg-slate-50 hover:bg-slate-100 rounded px-2 py-1.5 text-slate-600 text-center">策略回测</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
