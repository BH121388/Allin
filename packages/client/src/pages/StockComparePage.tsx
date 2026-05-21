import { useState } from 'react';
import { useStockCompare } from '@/hooks/useStockCompare';
import StockScoreRadar from '@/components/stock/StockScoreRadar';
import { Search, RefreshCw, TrendingUp, TrendingDown, ChevronRight, Crown } from 'lucide-react';

export default function StockComparePage() {
  const { result, loading, error, compare } = useStockCompare();
  const [codes, setCodes] = useState(['', '', '']);

  const handleCompare = () => {
    const valid = codes.map(c => c.trim()).filter(c => /^\d{6}$/.test(c));
    if (valid.length >= 2) compare(valid);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleCompare(); };

  const formatMoney = (v: number) => v >= 1e4 ? `${(v / 1e4).toFixed(1)}万亿` : `${v.toFixed(1)}亿`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-800 mb-4">股票对比</h1>

      {/* Input */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-slate-500 mb-3">输入2-3只股票代码进行多维度对比</p>
        <div className="flex gap-3 flex-wrap">
          {codes.map((c, i) => (
            <input
              key={i}
              type="text"
              value={c}
              onChange={e => { const n = [...codes]; n[i] = e.target.value; setCodes(n); }}
              onKeyDown={handleKeyDown}
              placeholder={`股票${i+1}代码`}
              maxLength={6}
              className="px-3 py-2 border border-slate-200 rounded text-sm w-32"
            />
          ))}
          <button onClick={handleCompare} disabled={loading || codes.filter(c => c.trim().length === 6).length < 2}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} 对比
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">例如：300502, 688017, 688041</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm mb-4">{error}</div>}

      {loading && <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>}

      {result && (
        <div className="space-y-4">
          {/* Best pick banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
            <Crown className="w-8 h-8 text-amber-500 shrink-0" />
            <div>
              <p className="font-bold text-slate-800">最佳选择：{result.bestPick.name} ({result.bestPick.code})</p>
              <p className="text-sm text-slate-600">{result.bestPick.reason}</p>
            </div>
          </div>

          {/* Radar chart */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-semibold text-slate-800 mb-2">六维雷达对比</h3>
            <StockScoreRadar stocks={result.stocks.map(s => ({ code: s.code, name: s.name, ...s.score }))} />
          </div>

          {/* Score comparison table */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
            <h3 className="font-semibold text-slate-800 mb-3">综合指标对比</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 text-xs text-slate-400">指标</th>
                  {result.stocks.map(s => (
                    <th key={s.code} className="text-center py-2 px-3 font-semibold text-slate-700">{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow label="总分" values={result.stocks.map(s => `${s.score.total}/100`)} highlight />
                <CompareRow label="收益动量" values={result.stocks.map(s => `${s.score.momentum}/25`)} />
                <CompareRow label="风险控制" values={result.stocks.map(s => `${s.score.riskControl}/20`)} />
                <CompareRow label="风险调整" values={result.stocks.map(s => `${s.score.riskAdjusted}/15`)} />
                <CompareRow label="公司质量" values={result.stocks.map(s => `${s.score.companyQuality}/15`)} />
                <CompareRow label="估值性价比" values={result.stocks.map(s => `${s.score.valuation}/15`)} />
                <CompareRow label="行业景气" values={result.stocks.map(s => `${s.score.sectorMatch}/10`)} />
                <tr><td colSpan={4} className="py-1"><hr /></td></tr>
                <CompareRow label="当前价格" values={result.stocks.map(s => s.currentPrice.toFixed(2))} />
                <CompareRow label="今日涨跌" values={result.stocks.map(s => `${s.changePct>=0?'+':''}${s.changePct.toFixed(2)}%`)} />
                <CompareRow label="PE(TTM)" values={result.stocks.map(s => s.pe>0?s.pe.toFixed(1):'亏损')} />
                <CompareRow label="ROE" values={result.stocks.map(s => `${s.roe.toFixed(1)}%`)} />
                <CompareRow label="市值" values={result.stocks.map(s => formatMoney(s.marketCap))} />
                <CompareRow label="利润增速" values={result.stocks.map(s => `${s.profitGrowth.toFixed(1)}%`)} />
                <tr><td colSpan={4} className="py-1"><hr /></td></tr>
                <CompareRow label="近5日" values={result.stocks.map(s => `${s.ret5d>=0?'+':''}${s.ret5d.toFixed(2)}%`)} />
                <CompareRow label="近30日" values={result.stocks.map(s => `${s.ret30d>=0?'+':''}${s.ret30d.toFixed(2)}%`)} />
                <CompareRow label="最大回撤" values={result.stocks.map(s => `${s.maxDrawdown.toFixed(1)}%`)} />
                <CompareRow label="夏普比率" values={result.stocks.map(s => s.sharpe.toFixed(2))} />
                <CompareRow label="趋势" values={result.stocks.map(s => s.trend)} />
              </tbody>
            </table>
          </div>

          {/* Technical indicators side by side */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {result.stocks.map(s => (
              <div key={s.code} className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="font-semibold text-sm text-slate-700 mb-2">{s.name} ({s.code})</p>
                {s.boll && (
                  <div className="text-xs space-y-0.5 mb-2">
                    <p className="text-slate-400">BOLL</p>
                    <p>上{s.boll.upper} 中{s.boll.middle} 下{s.boll.lower}</p>
                  </div>
                )}
                {s.kdj && (
                  <div className="text-xs space-y-0.5 mb-2">
                    <p className="text-slate-400">KDJ</p>
                    <p>K:{Math.round(s.kdj.k)} D:{Math.round(s.kdj.d)} J:{Math.round(s.kdj.j)}</p>
                    <p className={s.kdj.signal === 'overbought' ? 'text-red-500' : s.kdj.signal === 'oversold' ? 'text-green-500' : 'text-slate-500'}>{s.kdj.description}</p>
                  </div>
                )}
                {s.obv && (
                  <div className="text-xs">
                    <p className="text-slate-400">OBV</p>
                    <p className={s.obv.divergence === 'bullish' ? 'text-green-500' : s.obv.divergence === 'bearish' ? 'text-red-500' : 'text-slate-500'}>{s.obv.description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Analysis text */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-semibold text-slate-800 mb-2">对比分析</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{result.analysis}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, values, highlight }: { label: string; values: string[]; highlight?: boolean }) {
  return (
    <tr className={`border-b border-slate-50 ${highlight ? 'bg-slate-50 font-medium' : ''}`}>
      <td className="py-1.5 text-xs text-slate-500">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="text-center py-1.5 px-3 text-xs text-slate-700">{v}</td>
      ))}
    </tr>
  );
}
