import { useStockMarket } from '@/hooks/useStockMarket';
import { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, BarChart3, Activity, Flame, Target, ShieldAlert } from 'lucide-react';

interface PredictionData {
  buySignal: boolean;
  totalScore: number;
  dimensions: Record<string, { score: number; max: number; label: string; detail: string }>;
  predictedRange: { low: number; high: number; base: number };
  confidence: number;
  summary: string;
  riskNote: string;
}

export default function StockMarketPage() {
  const { data, loading, error, refresh } = useStockMarket();
  const [prediction, setPrediction] = useState<PredictionData | null>(null);

  const [predStats, setPredStats] = useState<{ totalPredictions: number; accuracy: number | null; recentPredictions: Array<{ date: string; buySignal: boolean; score: number; confidence: number }> } | null>(null);

  useEffect(() => {
    fetch('/api/stocks/predict')
      .then(r => r.json())
      .then(json => { if (json.success) setPrediction(json.data); })
      .catch(() => {});
    fetch('/api/stocks/predict/stats')
      .then(r => r.json())
      .then(json => { if (json.success) setPredStats(json.data); })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">A股市场概览</h1>
          {data && <p className="text-xs text-slate-400 mt-1">更新时间：{data.generatedAt}</p>}
        </div>
        <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      {/* Prediction panel */}
      {prediction && (
        <div className={`border-2 rounded-xl p-5 mb-4 ${prediction.buySignal ? 'bg-red-50/30 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black ${prediction.buySignal ? 'bg-red-500 text-white' : 'bg-slate-500 text-white'}`}>
                {prediction.buySignal ? '买' : '等'}
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {prediction.buySignal ? '建议明天买入' : '明天不建议买入'}
                </h2>
                <p className="text-xs text-slate-500">
                  综合评分 {prediction.totalScore}/100 · 置信度 {prediction.confidence}%
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">预测波动区间</p>
              <p className="text-sm font-mono font-medium text-slate-700">
                {prediction.predictedRange.low} ~ {prediction.predictedRange.high}
              </p>
            </div>
          </div>

          {/* Dimension scores */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
            {Object.entries(prediction.dimensions).map(([key, dim]) => (
              <div key={key} className="bg-white/70 rounded-lg p-2 text-center">
                <div className="text-xs text-slate-400 mb-0.5">{dim.label}</div>
                <div className={`text-lg font-bold ${dim.score / dim.max > 0.6 ? 'text-red-500' : dim.score / dim.max > 0.4 ? 'text-amber-500' : 'text-slate-400'}`}>
                  {dim.score}/{dim.max}
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <p className="text-sm text-slate-700 leading-relaxed">{prediction.summary}</p>
          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-600">
            <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{prediction.riskNote}</span>
          </div>

          {/* Prediction accuracy tracking */}
          {predStats && predStats.totalPredictions > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-400">预测追踪</span>
                <span>累计 {predStats.totalPredictions} 次</span>
                {predStats.accuracy != null && (
                  <span className={`font-medium ${predStats.accuracy >= 60 ? 'text-green-600' : predStats.accuracy >= 45 ? 'text-amber-600' : 'text-red-500'}`}>
                    准确率 {predStats.accuracy}%
                  </span>
                )}
              </div>
              {predStats.recentPredictions.length > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {predStats.recentPredictions.map(p => (
                    <div key={p.date} className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${p.buySignal ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`} title={`${p.date} ${p.buySignal?'买':'等'} ${p.score}分`}>
                      {p.buySignal ? '买' : '等'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm mb-4">{error}</div>}

      {data && (
        <div className="space-y-4">
          {/* MCP sentiment data */}
          {data.mcpData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">恐贪指数</p>
                <p className={`text-2xl font-bold ${data.mcpData.fearGreedIndex > 70 ? 'text-red-500' : data.mcpData.fearGreedIndex < 30 ? 'text-green-500' : 'text-amber-500'}`}>
                  {data.mcpData.fearGreedIndex}
                </p>
                <p className="text-xs text-slate-400">{data.mcpData.fearGreedIndex > 70 ? '贪婪' : data.mcpData.fearGreedIndex < 30 ? '恐惧' : '中性'}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">市场温度</p>
                <p className={`text-2xl font-bold ${data.mcpData.marketTemperature > 5 ? 'text-red-500' : data.mcpData.marketTemperature < -5 ? 'text-blue-500' : 'text-amber-500'}`}>
                  {data.mcpData.marketTemperature > 0 ? '+' : ''}{data.mcpData.marketTemperature}
                </p>
                <p className="text-xs text-slate-400">{data.mcpData.marketTemperature > 5 ? '过热' : data.mcpData.marketTemperature < -5 ? '冰点' : '适中'}</p>
              </div>
              {data.mcpData.hotSectors.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-slate-400 mb-1">热门板块（实时）</p>
                  <div className="flex flex-wrap gap-1">
                    {data.mcpData.hotSectors.map(s => (
                      <span key={s} className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.mcpData.forwardLook && (
                <div className="bg-white border border-slate-200 rounded-lg p-3 col-span-2 sm:col-span-4">
                  <p className="text-xs text-slate-400 mb-1">后市观点</p>
                  <p className="text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: data.mcpData.forwardLook.slice(0, 200) + '...' }} />
                </div>
              )}
            </div>
          )}

          {/* Major indices */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {data.indices.map(idx => (
              <div key={idx.code} className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-500">{idx.name}</p>
                <p className="text-lg font-bold text-slate-800 mt-1">{idx.price.toFixed(2)}</p>
                <p className={`text-sm font-medium mt-0.5 ${idx.changePct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {idx.changePct >= 0 ? '+' : ''}{idx.changePct.toFixed(2)}%
                </p>
                <div className="flex gap-3 mt-2 text-xs text-slate-400">
                  <span className="text-red-400">涨{idx.upCount}</span>
                  <span className="text-green-400">跌{idx.downCount}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Market breadth */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" /> 市场宽度
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-slate-700">{data.breadth.totalStocks}</p>
                <p className="text-xs text-slate-400">总数</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{data.breadth.upCount}</p>
                <p className="text-xs text-slate-400">上涨</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-500">{data.breadth.downCount}</p>
                <p className="text-xs text-slate-400">下跌</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-500">{data.breadth.flatCount}</p>
                <p className="text-xs text-slate-400">平盘</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{data.breadth.limitUp}</p>
                <p className="text-xs text-slate-400">涨停</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{data.breadth.limitDown}</p>
                <p className="text-xs text-slate-400">跌停</p>
              </div>
            </div>
            {/* Breadth bar */}
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-red-400" style={{ width: `${(data.breadth.upCount / data.breadth.totalStocks) * 100}%` }} />
              <div className="h-full bg-green-400" style={{ width: `${(data.breadth.downCount / data.breadth.totalStocks) * 100}%` }} />
              <div className="h-full bg-slate-300" style={{ width: `${(data.breadth.flatCount / data.breadth.totalStocks) * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>红: 上涨 {data.breadth.upPct}%</span>
              <span>绿: 下跌</span>
              <span>灰: 平盘</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sector rankings */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> 板块涨跌排名
              </h3>
              <div className="space-y-1.5">
                {data.allSectors.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-600 w-20">{s.name}</span>
                    <div className="flex-1 mx-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.changePct >= 0 ? 'bg-red-400' : 'bg-green-400'}`}
                        style={{
                          width: `${Math.min(Math.abs(s.changePct) * 15, 100)}%`,
                          marginLeft: s.changePct >= 0 ? 'auto' : '0',
                          marginRight: s.changePct >= 0 ? '0' : 'auto',
                        }}
                      />
                    </div>
                    <span className={`text-xs font-medium w-16 text-right ${s.changePct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hot stocks */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4" /> 热门异动
              </h3>
              <div className="space-y-3">
                {data.hotStocks.map(s => (
                  <div key={s.code} className="border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm text-slate-700">{s.name}</span>
                        <span className="text-xs text-slate-400 ml-2">{s.code}</span>
                      </div>
                      <span className={`text-sm font-bold ${s.changePct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{s.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top & Bottom sectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-red-500" /> 领涨板块
              </h3>
              <div className="space-y-2">
                {data.topSectors.map((s, i) => (
                  <div key={s.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-4">{i + 1}</span>
                      <span className="text-sm text-slate-700">{s.name}</span>
                    </div>
                    <span className="text-sm font-medium text-red-500">+{s.changePct.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-green-500" /> 领跌板块
              </h3>
              <div className="space-y-2">
                {data.bottomSectors.map((s, i) => (
                  <div key={s.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-4">{i + 1}</span>
                      <span className="text-sm text-slate-700">{s.name}</span>
                    </div>
                    <span className="text-sm font-medium text-green-500">{s.changePct.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
