import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, Wallet, Star, RefreshCw, BarChart3, Clock, DollarSign } from 'lucide-react';

interface IndexData { name: string; price: number; changePct: number; }
interface PredictionMini { buySignal: boolean; totalScore: number; confidence: number; summary: string; riskNote: string; generatedAt?: string; }
interface RecStock { code: string; name: string; industry: string; score: { total: number }; currentPrice?: number; pe: number; targetReturn?: number; signal: { signal: string }; changePct?: number; volume?: number; buyDate?: string; stopLoss?: number; }
interface WatchItem { code: string; name: string; price: number; changePct: number; }
interface PortfolioSummary { totalValue: number; totalPnl: number; pnlPercent: number; count: number; }

export default function DashboardPage() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [todayAnalysis, setTodayAnalysis] = useState<PredictionMini | null>(null);
  const [tomorrowPrediction, setTomorrowPrediction] = useState<PredictionMini | null>(null);
  const [recs, setRecs] = useState<RecStock[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    const fetchAll = (forceRefresh = false) => Promise.allSettled([
      fetch('/api/stocks/market').then(r => r.json()),
      fetch('/api/stocks/predict/today').then(r => r.json()),
      fetch('/api/stocks/predict').then(r => r.json()),
      fetch(`/api/stocks/recommend${forceRefresh ? '?refresh=true' : ''}`).then(r => r.json()),
      fetch('/api/stocks/watchlist').then(r => r.json()),
      fetch('/api/stock-portfolio').then(r => r.json()),
    ]).then(([market, today, tomorrow, r, w, pf]) => {
      if (market.status === 'fulfilled' && market.value.success) {
        setIndices((market.value.data?.indices || []).map((i: any) => ({ name: i.name, price: i.price, changePct: i.changePct })));
      }
      if (today.status === 'fulfilled' && today.value.success) {
        setTodayAnalysis({ buySignal: today.value.data.buySignal, totalScore: today.value.data.totalScore, confidence: today.value.data.confidence, summary: today.value.data.summary, riskNote: today.value.data.riskNote, generatedAt: today.value.data.generatedAt });
      }
      if (tomorrow.status === 'fulfilled' && tomorrow.value.success) {
        setTomorrowPrediction({ buySignal: tomorrow.value.data.buySignal, totalScore: tomorrow.value.data.totalScore, confidence: tomorrow.value.data.confidence, summary: tomorrow.value.data.summary, riskNote: tomorrow.value.data.riskNote });
      }
      if (r.status === 'fulfilled' && r.value.success) setRecs(r.value.data.recommendations?.slice(0, 5) || []);
      if (w.status === 'fulfilled' && w.value.success) setWatchlist(w.value.data || []);
      if (pf.status === 'fulfilled' && pf.value.success) setPortfolio(pf.value.data.summary);

      const now = new Date();
      setLastUpdated(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    }).finally(() => setLoading(false));

    fetchAll(false);
    const interval = setInterval(() => fetchAll(true), 60000);
    return () => clearInterval(interval);
  }, []);

  const formatMoney = (v: number) => Math.abs(v) >= 1e8 ? `${(v/1e8).toFixed(1)}亿` : Math.abs(v) >= 1e4 ? `${(v/1e4).toFixed(0)}万` : v.toFixed(0);
  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch { return ''; }
  };

  if (loading) return <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg sm:text-xl font-bold text-slate-800">投资仪表盘</h1>
        <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />更新 {lastUpdated}</span>
      </div>

      {/* Market indices bar */}
      {indices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 mb-3 flex items-center gap-4 overflow-x-auto text-xs">
          {indices.map(idx => (
            <div key={idx.name} className="flex items-center gap-1.5 shrink-0">
              <span className="text-slate-500">{idx.name}</span>
              <span className="font-mono font-medium">{idx.price > 100 ? idx.price.toFixed(0) : idx.price.toFixed(2)}</span>
              <span className={`font-mono font-medium ${idx.changePct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {idx.changePct >= 0 ? '+' : ''}{idx.changePct.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Left column: Analysis + Watchlist */}
        <div className="lg:col-span-2 space-y-3 sm:space-y-4">
          {/* Today real-time analysis */}
          {todayAnalysis && (
            <div className={`border-2 rounded-xl p-3 sm:p-4 ${todayAnalysis.buySignal ? 'bg-red-50/30 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />实时分析 {formatTime(todayAnalysis.generatedAt)}</span>
                <span className="text-xs text-slate-400">置信度 {todayAnalysis.confidence}%</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-xl sm:text-2xl font-black shrink-0 ${todayAnalysis.buySignal ? 'bg-red-500 text-white' : 'bg-slate-500 text-white'}`}>
                  {todayAnalysis.buySignal ? '买' : '等'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm sm:text-base">{todayAnalysis.buySignal ? '今日建议买入' : '今日不建议买入'}</p>
                  <p className="text-xs sm:text-sm text-slate-600 line-clamp-2">{todayAnalysis.summary.slice(0, 120)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-700">{todayAnalysis.totalScore}</p>
                  <p className="text-xs text-slate-400">/100分</p>
                </div>
              </div>
            </div>
          )}

          {/* Tomorrow prediction */}
          {tomorrowPrediction && (
            <div className={`border-2 rounded-xl p-3 sm:p-4 ${tomorrowPrediction.buySignal ? 'bg-amber-50/30 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400 flex items-center gap-1"><Target className="w-3 h-3" />明日预测</span>
                <span className="text-xs text-slate-400">置信度 {tomorrowPrediction.confidence}%</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-lg sm:text-xl font-black shrink-0 ${tomorrowPrediction.buySignal ? 'bg-amber-500 text-white' : 'bg-slate-400 text-white'}`}>
                  {tomorrowPrediction.buySignal ? '买' : '等'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-700 text-sm">{tomorrowPrediction.buySignal ? '明天建议买入' : '明天不建议买入'}</p>
                  <p className="text-xs text-slate-500 line-clamp-2">{tomorrowPrediction.summary.slice(0, 100)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg sm:text-xl font-bold text-slate-600">{tomorrowPrediction.totalScore}</p>
                  <p className="text-xs text-slate-400">/100分</p>
                </div>
              </div>
            </div>
          )}

          {/* Top 5 recommendations */}
          <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <h2 className="font-semibold text-slate-800 text-sm sm:text-base mb-3 flex items-center gap-1.5"><Star className="w-4 h-4 text-amber-500" />今日推荐 Top 5</h2>
            <div className="space-y-2">
              {recs.map((s, i) => (
                <div key={s.code} className="bg-slate-50 rounded-lg p-2.5 sm:p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 w-5 shrink-0">#{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm text-slate-700 truncate">{s.name}</span>
                        <span className="text-xs text-slate-400">{s.code}</span>
                        <span className="text-xs text-slate-400">{s.industry || ''}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        {s.currentPrice != null && <span className="font-mono">¥{s.currentPrice.toFixed(2)}</span>}
                        {s.changePct != null && (
                          <span className={`font-mono font-medium ${s.changePct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                          </span>
                        )}
                        <span className="text-slate-400">PE {s.pe > 0 ? s.pe.toFixed(1) : '--'}</span>
                        {s.buyDate && <span className="text-slate-400">买入日 {s.buyDate}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-lg font-bold ${(s.score?.total ?? 0) >= 80 ? 'text-red-600' : (s.score?.total ?? 0) >= 65 ? 'text-amber-600' : 'text-slate-500'}`}>
                        {s.score?.total ?? '--'}
                      </span>
                      <span className="text-xs text-slate-400 ml-0.5">分</span>
                      <div className="text-xs mt-0.5 space-y-0.5">
                        <span className={s.signal?.signal === 'buy' ? 'text-red-600 font-medium' : s.signal?.signal === 'hold' ? 'text-blue-600' : 'text-slate-400'}>
                          {s.signal?.signal === 'buy' ? '买入' : s.signal?.signal === 'hold' ? '持有' : s.signal?.signal === 'reduce' ? '减持' : s.signal?.signal || '--'}
                        </span>
                        {s.stopLoss != null && <div className="text-slate-400">止损 ¥{s.stopLoss.toFixed(2)}</div>}
                        {s.targetReturn != null && <div className="text-slate-400">目标 +{s.targetReturn}%</div>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {recs.length === 0 && <div className="text-xs text-slate-400 py-4 text-center">暂无推荐数据</div>}
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
