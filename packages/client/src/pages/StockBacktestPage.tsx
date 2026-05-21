import { useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Target, Check, X, BarChart3 } from 'lucide-react';

interface BacktestPick {
  rank: number; code: string; name: string; industry: string;
  scoreAtPick: number; priceAtPick: number; priceNow: number;
  returnPct: number; maxDrawdownDuring: number; holdingDays: number; hitTarget: boolean;
}

interface BacktestResult {
  lookbackDays: number; topN: number; asOfDate: string; endDate: string;
  picks: BacktestPick[];
  summary: {
    totalPicks: number; winners: number; winRate: number;
    avgReturn: number; bestReturn: number; worstReturn: number;
    avgMaxDrawdown: number; benchmarkReturn: number; alpha: number;
  };
  scoreValidated: boolean;
  conclusion: string;
}

export default function StockBacktestPage() {
  const [days, setDays] = useState(30);
  const [topN, setTopN] = useState(10);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runBacktest = () => {
    setLoading(true); setError(null);
    fetch(`/api/stocks/backtest?days=${days}&top=${topN}`)
      .then(r => r.json())
      .then(json => { if (json.success) setResult(json.data); else setError(json.error); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-800 mb-4">策略回测</h1>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-slate-500 mb-3">回测策略：在历史时点运行评分模型，追踪后续收益</p>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-xs text-slate-400 block mb-1">回看周期</label>
            <select value={days} onChange={e => setDays(parseInt(e.target.value))}
              className="px-3 py-2 border border-slate-200 rounded text-sm">
              <option value={30}>30天（1个月）</option>
              <option value={60}>60天（2个月）</option>
              <option value={90}>90天（3个月）</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">取前N只</label>
            <select value={topN} onChange={e => setTopN(parseInt(e.target.value))}
              className="px-3 py-2 border border-slate-200 rounded text-sm">
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
              <option value={15}>Top 15</option>
            </select>
          </div>
          <button onClick={runBacktest} disabled={loading}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin inline" /> : null} 开始回测
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm mb-4">{error}</div>}

      {loading && <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>}

      {result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard label="胜率" value={`${result.summary.winRate}%`} sub={`${result.summary.winners}/${result.summary.totalPicks}只`} color={result.summary.winRate >= 60 ? 'text-green-600' : result.summary.winRate >= 45 ? 'text-amber-600' : 'text-red-500'} />
            <StatCard label="平均收益" value={`${result.summary.avgReturn >= 0 ? '+' : ''}${result.summary.avgReturn.toFixed(1)}%`} color={result.summary.avgReturn > 0 ? 'text-red-500' : 'text-green-500'} />
            <StatCard label="最佳收益" value={`+${result.summary.bestReturn.toFixed(1)}%`} color="text-red-500" />
            <StatCard label="最差收益" value={`${result.summary.worstReturn.toFixed(1)}%`} color="text-green-500" />
            <StatCard label="平均回撤" value={`-${result.summary.avgMaxDrawdown.toFixed(1)}%`} color="text-amber-600" />
            <StatCard label="超额收益" value={`${result.summary.alpha >= 0 ? '+' : ''}${result.summary.alpha.toFixed(1)}%`} color={result.summary.alpha > 0 ? 'text-red-500' : 'text-green-500'} />
            <StatCard label="评分有效" value={result.scoreValidated ? '是' : '否'} sub="高分→高收益" color={result.scoreValidated ? 'text-green-600' : 'text-amber-600'} />
          </div>

          {/* Picks table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">股票</th>
                    <th className="px-3 py-2">行业</th>
                    <th className="px-3 py-2 text-right">入选评分</th>
                    <th className="px-3 py-2 text-right">入选价</th>
                    <th className="px-3 py-2 text-right">当前价</th>
                    <th className="px-3 py-2 text-right">收益</th>
                    <th className="px-3 py-2 text-right">期间回撤</th>
                    <th className="px-3 py-2 text-center">达标?</th>
                  </tr>
                </thead>
                <tbody>
                  {result.picks.map(p => (
                    <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs text-slate-400">{p.rank}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-700">{p.name}</span>
                        <span className="text-xs text-slate-400 ml-1">{p.code}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{p.industry}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium">{p.scoreAtPick}</td>
                      <td className="px-3 py-2 text-right text-xs">{p.priceAtPick.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-xs">{p.priceNow.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right text-xs font-medium ${p.returnPct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {p.returnPct >= 0 ? '+' : ''}{p.returnPct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-slate-500">{p.maxDrawdownDuring.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-center">{p.hitTarget ? <Check className="w-3.5 h-3.5 text-green-500 mx-auto" /> : <X className="w-3.5 h-3.5 text-slate-300 mx-auto" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Validation bar */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> 评分有效性验证
            </h3>
            <p className="text-sm text-slate-600 mb-2">
              高分组的平均收益是否显著高于低分组？
            </p>
            <div className="flex gap-4 text-sm">
              <span className="text-slate-400">前半组（高分）均值：</span>
              <span className="font-medium">{(() => {
                const half = Math.floor(result.picks.length / 2);
                const topHalf = result.picks.slice(0, half);
                const avg = topHalf.reduce((s, p) => s + p.returnPct, 0) / topHalf.length;
                return `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`;
              })()}</span>
              <span className="text-slate-400">vs</span>
              <span>后半组（低分）均值：</span>
              <span className="font-medium">{(() => {
                const half = Math.floor(result.picks.length / 2);
                const bottomHalf = result.picks.slice(half);
                const avg = bottomHalf.reduce((s, p) => s + p.returnPct, 0) / bottomHalf.length;
                return `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`;
              })()}</span>
              <span className={`font-bold ${result.scoreValidated ? 'text-green-600' : 'text-amber-600'}`}>
                {result.scoreValidated ? '✓ 有效' : '△ 待验证'}
              </span>
            </div>
          </div>

          {/* Conclusion */}
          <div className={`border rounded-lg p-4 ${result.summary.winRate >= 55 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className="text-sm font-medium text-slate-800">回测期间：{result.asOfDate} → {result.endDate}（{result.lookbackDays}天）</p>
            <p className="text-sm text-slate-600 mt-1">{result.conclusion}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
