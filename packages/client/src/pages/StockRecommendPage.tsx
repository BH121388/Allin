import { useStockRecommendations } from '@/hooks/useStockRecommendations';
import { RefreshCw, TrendingUp, SlidersHorizontal } from 'lucide-react';
import StockScoreRadar from '@/components/stock/StockScoreRadar';
import { useState } from 'react';

const DEFAULT_WEIGHTS = { momentum: 25, riskControl: 20, riskAdjusted: 15, companyQuality: 15, valuation: 15, sectorMatch: 10 };

export default function StockRecommendPage() {
  const { recommendations, generatedAt, source, loading, error, refresh } = useStockRecommendations();
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [showWeights, setShowWeights] = useState(false);

  // Recalculate totals with custom weights
  const adjustTotal = (stock: typeof recommendations[0]) => {
    if (!stock) return stock;
    const s = stock.score;
    const w = weights;
    const total = Math.round(
      (s.momentum / 25) * w.momentum +
      (s.riskControl / 20) * w.riskControl +
      (s.riskAdjusted / 15) * w.riskAdjusted +
      (s.companyQuality / 15) * w.companyQuality +
      (s.valuation / 15) * w.valuation +
      (s.sectorMatch / 10) * w.sectorMatch
    );
    return { ...stock, score: { ...s, total: Math.min(100, total) } };
  };

  const adjusted = recommendations.map(adjustTotal).sort((a, b) => b.score.total - a.score.total);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">A股智能推荐</h1>
          <p className="text-sm text-slate-500 mt-1">
            {generatedAt ? `更新时间：${generatedAt}` : '加载中...'}
            {source === 'cache' && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">缓存</span>}
            {source === 'live' && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">实时</span>}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600 mb-2">{error}</p>
          <button onClick={refresh} className="text-sm text-red-700 underline">点击重试</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && recommendations.length === 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-12 text-center">
          <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">暂无推荐数据</p>
          <button onClick={refresh} className="mt-3 text-sm text-slate-600 underline">刷新获取</button>
        </div>
      )}

      {/* Weight adjustment panel */}
      {!loading && recommendations.length > 0 && (
        <div className="mb-4">
          <button onClick={() => setShowWeights(!showWeights)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-2">
            <SlidersHorizontal className="w-3.5 h-3.5" /> 自定义评分权重
          </button>
          {showWeights && (
            <div className="bg-white border border-slate-200 rounded-lg p-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
              {Object.entries(weights).map(([key, val]) => (
                <div key={key}>
                  <label className="text-xs text-slate-500 block mb-1">
                    {key === 'momentum' ? '收益动量' : key === 'riskControl' ? '风险控制' : key === 'riskAdjusted' ? '风险调整' : key === 'companyQuality' ? '公司质量' : key === 'valuation' ? '估值性价比' : '行业景气'}
                  </label>
                  <input type="range" min="5" max="30" value={val} onChange={e => setWeights(prev => ({ ...prev, [key]: parseInt(e.target.value) }))} className="w-full h-1.5" />
                  <span className="text-xs text-slate-400">{val}</span>
                </div>
              ))}
              <button onClick={() => setWeights(DEFAULT_WEIGHTS)} className="text-xs text-blue-600 hover:text-blue-800 self-end mb-0.5">重置</button>
            </div>
          )}
        </div>
      )}

      {/* Radar chart */}
      {!loading && recommendations.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <h3 className="font-semibold text-slate-800 mb-2">六维对比</h3>
          <StockScoreRadar stocks={recommendations.map(s => ({ code: s.code, name: s.name, ...s.score }))} />
        </div>
      )}

      {/* Recommendations grid */}
      {!loading && adjusted.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {adjusted.map((stock, index) => (
            <StockRecommendCard key={stock.code} stock={stock} rank={index + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function StockRecommendCard({ stock, rank }: { stock: import('@allin/shared').StockAnalysis; rank: number }) {
  const scoreColor = stock.score.total >= 80 ? 'text-red-600' : stock.score.total >= 65 ? 'text-blue-600' : stock.score.total >= 55 ? 'text-amber-600' : 'text-slate-600';
  const signalBg = stock.signal.signal === 'buy' ? 'bg-red-100 text-red-700' : stock.signal.signal === 'hold' ? 'bg-blue-100 text-blue-700' : stock.signal.signal === 'reduce' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`
              inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold text-white
              ${rank === 1 ? 'bg-amber-500' : rank === 2 ? 'bg-slate-400' : rank === 3 ? 'bg-amber-700' : 'bg-slate-300'}
            `}>
              {rank}
            </span>
            <span className="font-semibold text-slate-800">{stock.name}</span>
            <span className="text-xs text-slate-400">{stock.code}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{stock.industry}</span>
            <span className="text-xs text-slate-400">市值{stock.marketCap.toFixed(0)}亿</span>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-2xl font-bold ${scoreColor}`}>{stock.score.total}</span>
          <span className="text-xs text-slate-400 ml-0.5">分</span>
        </div>
      </div>

      {/* 6-dim score bars */}
      <div className="space-y-1.5 mb-3">
        <ScoreBar label="收益动量" value={stock.score.momentum} max={25} />
        <ScoreBar label="风险控制" value={stock.score.riskControl} max={20} />
        <ScoreBar label="风险调整" value={stock.score.riskAdjusted} max={15} />
        <ScoreBar label="公司质量" value={stock.score.companyQuality} max={15} />
        <ScoreBar label="估值性价比" value={stock.score.valuation} max={15} />
        <ScoreBar label="行业景气" value={stock.score.sectorMatch} max={10} />
      </div>

      {/* Price info & timing */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
        <span>当前价：{stock.currentPrice?.toFixed(2) ?? '--'}</span>
        {stock.pe > 0 && <span>PE：{stock.pe.toFixed(1)}</span>}
        <span>止损：{stock.stopLoss?.toFixed(2) ?? '--'}</span>
      </div>

      {/* Signal & action */}
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${signalBg}`}>
          {stock.signal.signal === 'buy' ? '买入' : stock.signal.signal === 'hold' ? '持有' : stock.signal.signal === 'reduce' ? '减持' : '卖出'}
        </span>
        <span className="text-xs text-slate-400">
          目标收益 +{stock.targetReturn}%
        </span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 65 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-500' : 'bg-slate-300';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{value}</span>
    </div>
  );
}
