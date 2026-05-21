import { useState } from 'react';
import { useStockScreener } from '@/hooks/useStockScreener';
import { Search, RefreshCw, Filter } from 'lucide-react';

// 行业选项
const INDUSTRIES = [
  '食品饮料', '医药生物', '电子', '计算机', '通信',
  '电力设备', '汽车', '机械设备', '国防军工',
  '银行', '非银金融', '房地产', '家用电器',
  '煤炭', '钢铁', '有色金属', '基础化工',
  '公用事业', '交通运输', '传媒', '商贸零售',
];

export default function StockScreenerPage() {
  const { result, loading, error, search } = useStockScreener();

  const [minPE, setMinPE] = useState('');
  const [maxPE, setMaxPE] = useState('');
  const [minCap, setMinCap] = useState('');
  const [maxCap, setMaxCap] = useState('');
  const [industry, setIndustry] = useState('');
  const [minROE, setMinROE] = useState('');
  const [minRevGrowth, setMinRevGrowth] = useState('');

  const doSearch = (overrides?: Record<string, string | number>) => {
    const filters: Record<string, string | number> = { ...overrides };
    const vPE = overrides?.minPE ?? minPE;
    const vMaxPE = overrides?.maxPE ?? maxPE;
    const vCap = overrides?.minMarketCap ?? minCap;
    const vMaxCap = overrides?.maxMarketCap ?? maxCap;
    const vInd = overrides?.industry ?? industry;
    const vROE = overrides?.minROE ?? minROE;
    const vRev = overrides?.minRevenueGrowth ?? minRevGrowth;

    if (vPE) filters.minPE = typeof vPE === 'number' ? vPE : parseFloat(vPE as string);
    if (vMaxPE) filters.maxPE = typeof vMaxPE === 'number' ? vMaxPE : parseFloat(vMaxPE as string);
    if (vCap) filters.minMarketCap = typeof vCap === 'number' ? vCap : parseFloat(vCap as string);
    if (vMaxCap) filters.maxMarketCap = typeof vMaxCap === 'number' ? vMaxCap : parseFloat(vMaxCap as string);
    if (vInd) filters.industry = vInd;
    if (vROE) filters.minROE = typeof vROE === 'number' ? vROE : parseFloat(vROE as string);
    if (vRev) filters.minRevenueGrowth = typeof vRev === 'number' ? vRev : parseFloat(vRev as string);
    search(filters);
  };

  const formatMoney = (v: number) => v >= 1e4 ? `${(v / 1e4).toFixed(1)}万亿` : `${v.toFixed(1)}亿`;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-800">股票筛选器</h1>
        {result && (
          <span className="text-xs text-slate-400">
            扫描 {result.totalScanned} 只 → 输出 {result.stocks.length} 只
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <input
            type="number" placeholder="PE ≥" value={minPE} onChange={e => setMinPE(e.target.value)}
            onKeyDown={handleKeyDown} className="px-2 py-1.5 border border-slate-200 rounded text-xs"
          />
          <input
            type="number" placeholder="PE ≤" value={maxPE} onChange={e => setMaxPE(e.target.value)}
            onKeyDown={handleKeyDown} className="px-2 py-1.5 border border-slate-200 rounded text-xs"
          />
          <input
            type="number" placeholder="市值≥(亿)" value={minCap} onChange={e => setMinCap(e.target.value)}
            onKeyDown={handleKeyDown} className="px-2 py-1.5 border border-slate-200 rounded text-xs"
          />
          <input
            type="number" placeholder="市值≤(亿)" value={maxCap} onChange={e => setMaxCap(e.target.value)}
            onKeyDown={handleKeyDown} className="px-2 py-1.5 border border-slate-200 rounded text-xs"
          />
          <select
            value={industry} onChange={e => setIndustry(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded text-xs"
          >
            <option value="">全部行业</option>
            {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
          </select>
          <input
            type="number" placeholder="ROE≥(%)" value={minROE} onChange={e => setMinROE(e.target.value)}
            onKeyDown={handleKeyDown} className="px-2 py-1.5 border border-slate-200 rounded text-xs"
          />
          <button
            onClick={() => doSearch()} disabled={loading}
            className="px-3 py-1.5 bg-slate-800 text-white rounded text-xs hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            筛选
          </button>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <QuickBtn label="低估值白马" onClick={() => { setMinPE('5'); setMaxPE('20'); setMinROE('15'); setMinCap('500'); doSearch({ minPE:5, maxPE:20, minROE:15, minMarketCap:500 }); }} />
          <QuickBtn label="高成长赛道" onClick={() => { setMinROE('10'); setMinRevGrowth('30'); setMaxPE('60'); doSearch({ minROE:10, minRevenueGrowth:30, maxPE:60 }); }} />
          <QuickBtn label="科技股" onClick={() => { setIndustry('电子'); setMinCap('50'); doSearch({ industry:'电子', minMarketCap:50 }); }} />
          <QuickBtn label="消费龙头" onClick={() => { setIndustry('食品饮料'); setMinCap('200'); setMinROE('15'); doSearch({ industry:'食品饮料', minMarketCap:200, minROE:15 }); }} />
          <QuickBtn label="高ROE" onClick={() => { setMinROE('20'); setMinCap('100'); doSearch({ minROE:20, minMarketCap:100 }); }} />
        </div>
      </div>

      {/* Error */}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm mb-4">{error}</div>}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-16 text-center">
          <Filter className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">设置条件筛选A股</p>
          <p className="text-xs text-slate-400 mt-1">例如：PE 10-30、市值≥100亿、ROE≥10%</p>
        </div>
      )}

      {/* Results table */}
      {result && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 w-8">#</th>
                  <th className="px-3 py-2">股票</th>
                  <th className="px-3 py-2">行业</th>
                  <th className="px-3 py-2 text-right">市值</th>
                  <th className="px-3 py-2 text-right">PE</th>
                  <th className="px-3 py-2 text-right">ROE%</th>
                  <th className="px-3 py-2 text-right">5日%</th>
                  <th className="px-3 py-2 text-right">30日%</th>
                  <th className="px-3 py-2 text-right">回撤%</th>
                  <th className="px-3 py-2 text-right">总分</th>
                </tr>
              </thead>
              <tbody>
                {result.stocks.map((stock, idx) => (
                  <tr key={stock.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-800">{stock.name}</span>
                      <span className="text-xs text-slate-400 ml-1">{stock.code}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{stock.industry}</td>
                    <td className="px-3 py-2 text-right text-xs">{formatMoney(stock.marketCap)}</td>
                    <td className="px-3 py-2 text-right text-xs">{stock.pe > 0 ? stock.pe.toFixed(1) : '亏损'}</td>
                    <td className="px-3 py-2 text-right text-xs">{stock.roe.toFixed(1)}</td>
                    <td className={`px-3 py-2 text-right text-xs ${stock.ret5d >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {stock.ret5d >= 0 ? '+' : ''}{stock.ret5d.toFixed(1)}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs ${stock.ret30d >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {stock.ret30d >= 0 ? '+' : ''}{stock.ret30d.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{stock.maxDrawdown.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">
                      <ScoreBadge total={stock.score.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.stocks.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">
              未找到符合条件的股票，请放宽筛选条件
            </div>
          )}
        </div>
      )}

      {/* Score micro-bars legend */}
      {result && result.stocks.length > 0 && (
        <div className="mt-4 bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-2">评分维度说明</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs text-slate-500">
            <span>收益动量 25分</span>
            <span>风险控制 20分</span>
            <span>风险调整 15分</span>
            <span>公司质量 15分</span>
            <span>估值性价比 15分</span>
            <span>行业景气 10分</span>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
    >
      {label}
    </button>
  );
}

function ScoreBadge({ total }: { total: number }) {
  let color: string;
  if (total >= 80) color = 'bg-green-100 text-green-700';
  else if (total >= 65) color = 'bg-blue-100 text-blue-700';
  else if (total >= 50) color = 'bg-amber-100 text-amber-700';
  else color = 'bg-slate-100 text-slate-500';

  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>{total}</span>;
}
