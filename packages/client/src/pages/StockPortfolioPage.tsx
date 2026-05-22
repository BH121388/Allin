import { useState, useRef, useEffect } from 'react';
import { useStockPortfolio } from '@/hooks/useStockPortfolio';
import { RefreshCw, Briefcase, Plus, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function StockPortfolioPage() {
  const { holdings, snapshots, summary, loading, error, refresh, addStock, removeStock } = useStockPortfolio();
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form state（只需填代码和金额，其余自动获取）
  const [formCode, setFormCode] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const amountRef = useRef(''); // 闭包穿透，handleCodeBlur 始终读到最新金额
  const [formFetching, setFormFetching] = useState(false);
  const [formPrice, setFormPrice] = useState<number | null>(null);
  const [formName, setFormName] = useState('');

  // 股数 = 金额 ÷ 价格，任一变化自动重算
  const price = formPrice || 0;
  const amt = parseFloat(formAmount) || 0;
  const shares = price > 0 && amt > 0 ? Math.floor(amt / price / 100) * 100 : 0;
  const actualAmount = shares * price;

  // 输入代码后自动查询股票名称和实时价格
  const handleCodeBlur = async () => {
    const code = formCode.trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) return;
    setFormFetching(true);
    try {
      const res = await fetch(`/api/stocks/search?code=${code}`);
      const json = await res.json();
      if (json.success && json.data) {
        setFormName(json.data.name);
        setFormPrice(json.data.currentPrice || 0);
      } else {
        setFormName(''); setFormPrice(null);
      }
    } catch { setFormName(''); setFormPrice(null); }
    setFormFetching(false);
  };

  const handleAdd = async () => {
    if (!formCode || !formName || !formPrice || shares <= 0) return;
    const ok = await addStock({
      code: formCode,
      name: formName,
      amount: actualAmount,
      costPrice: formPrice,
      shares,
    });
    if (ok) {
      setFormCode(''); setFormAmount(''); setFormName(''); setFormPrice(null); setShowForm(false);
    }
  };

  // 金额输入同步到 ref（handleCodeBlur 异步回来时读到最新值）
  useEffect(() => { amountRef.current = formAmount; }, [formAmount]);

  const handleDelete = async (code: string) => {
    const ok = await removeStock(code);
    if (ok) setConfirmDelete(null);
  };

  const formatMoney = (v: number) => {
    if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
    if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
    return v.toFixed(2);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header + Summary */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">股票持仓</h1>
          {summary && (
            <p className="text-sm text-slate-500 mt-1">
              持仓 {summary.count} 只 · 总市值 {formatMoney(summary.totalValue)} ·
              总盈亏 <span className={summary.totalPnl >= 0 ? 'text-red-500' : 'text-green-500'}>
                {summary.totalPnl >= 0 ? '+' : ''}{formatMoney(summary.totalPnl)}
              </span>
              <span className={`ml-1 ${summary.pnlPercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                ({summary.pnlPercent >= 0 ? '+' : ''}{summary.pnlPercent.toFixed(2)}%)
              </span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700"
          >
            <Plus className="w-3.5 h-3.5" /> 添加
          </button>
          <button onClick={refresh} disabled={loading} className="p-1.5 text-slate-500 hover:text-slate-700">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Add form — 简化为只填代码+金额 */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-slate-400 mb-1 block">股票代码</label>
              <input
                type="text" placeholder="如 600519" value={formCode}
                onChange={e => setFormCode(e.target.value)}
                onBlur={handleCodeBlur}
                maxLength={6}
                className="w-full px-3 py-2 border border-slate-200 rounded text-sm"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-slate-400 mb-1 block">买入金额（元）</label>
              <input
                type="number" placeholder="如 10000" value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded text-sm"
              />
            </div>
            <button onClick={handleAdd} disabled={!formName || !formPrice || shares <= 0 || formFetching}
              className="px-6 py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-700 disabled:opacity-40 shrink-0">
              {formFetching ? '查询中...' : '确认添加'}
            </button>
          </div>

          {/* 自动查询预览 */}
          {formFetching && (
            <p className="text-xs text-slate-400 mt-2">正在查询股票信息...</p>
          )}
          {formName && formPrice && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
              <span>名称：<strong className="text-slate-700">{formName}</strong></span>
              <span>实时价：<strong className="text-slate-700">¥{formPrice.toFixed(2)}</strong></span>
              <span>股数：<strong className="text-slate-700">{shares}股</strong></span>
              <span>成交金额：<strong className="text-slate-700">¥{actualAmount.toFixed(2)}</strong></span>
            </div>
          )}
          {!formFetching && !formName && formCode.length === 6 && (
            <p className="text-xs text-red-400 mt-2">未找到该股票，请检查代码</p>
          )}
        </div>
      )}

      {/* Error */}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm mb-4">{error}</div>}

      {/* Equity curve */}
      {snapshots.length >= 2 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">持仓市值走势</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={snapshots.map(s => ({ ...s, label: s.date.slice(5) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v >= 1e8 ? `${(v/1e8).toFixed(1)}亿` : v >= 1e4 ? `${(v/1e4).toFixed(0)}万` : v.toFixed(0)} width={55} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [v >= 1e8 ? `${(v/1e8).toFixed(2)}亿` : `${(v/1e4).toFixed(1)}万`, '市值']} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty */}
      {!loading && holdings.length === 0 && !error && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-12 text-center">
          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">暂无股票持仓</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-slate-600 underline">添加持仓</button>
        </div>
      )}

      {/* Holdings list */}
      {holdings.map(h => (
        <div key={h.id} className="bg-white border border-slate-200 rounded-lg p-4 mb-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{h.name}</span>
                <span className="text-xs text-slate-400">{h.code}</span>
                {h.industry && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{h.industry}</span>}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                <span>成本 {h.costPrice.toFixed(2)}</span>
                <span>现价 {h.currentPrice.toFixed(2)}</span>
                <span>{h.shares}股</span>
              </div>
            </div>
            <div className="text-right">
              <SignalBadge signal={h.signal.signal} />
            </div>
          </div>

          {/* P&L */}
          <div className="grid grid-cols-3 gap-2 mb-2 text-sm">
            <div>
              <span className="text-xs text-slate-400">市值</span>
              <p className="text-slate-700">{formatMoney(h.currentValue)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">盈亏</span>
              <p className={h.pnl >= 0 ? 'text-red-500' : 'text-green-500'}>
                {h.pnl >= 0 ? '+' : ''}{formatMoney(h.pnl)}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400">盈亏率</span>
              <p className={h.pnlPercent >= 0 ? 'text-red-500' : 'text-green-500'}>
                {h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Trading plan */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 text-xs">
            {h.targetSellPrice && (
              <div>
                <span className="text-slate-400">目标卖价</span>
                <p className="font-medium text-red-500">¥{h.targetSellPrice.toFixed(2)}</p>
              </div>
            )}
            {h.stopLoss != null && (
              <div>
                <span className="text-slate-400">止损价</span>
                <p className="font-medium text-green-600">¥{h.stopLoss.toFixed(2)}</p>
              </div>
            )}
            <div>
              <span className="text-slate-400">持仓天数</span>
              <p className="font-medium text-slate-600">{h.holdingDays ?? '--'}天</p>
            </div>
            <div>
              <span className="text-slate-400">评分</span>
              <p className="font-medium text-slate-600">{h.score?.total ?? '--'}/100</p>
            </div>
          </div>

          {/* Today change */}
          <div className="flex items-center justify-between text-xs mb-2">
            {(h.todayChange ?? 0) !== 0 ? (
              <span className={(h.todayChange ?? 0) >= 0 ? 'text-red-500' : 'text-green-500'}>
                今日 {(h.todayChange ?? 0) >= 0 ? '+' : ''}{(h.todayChange ?? 0).toFixed(2)}% {h.todayPnl != null ? `(${(h.todayPnl ?? 0) >= 0 ? '+' : ''}${formatMoney(h.todayPnl ?? 0)})` : ''}
              </span>
            ) : <span />}
            <span className="text-slate-400">
              {h.signal?.signal === 'buy' ? '建议买入/加仓' : h.signal?.signal === 'hold' ? '建议持有' : h.signal?.signal === 'reduce' ? '建议减仓' : h.signal?.signal === 'sell' ? '建议清仓' : ''}
            </span>
          </div>

          {/* Sell suggestion */}
          {h.sellSuggestion && (
            <div className={`rounded px-3 py-1.5 text-xs mb-2 ${h.signal?.signal === 'sell' || h.signal?.signal === 'reduce' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-blue-50 border border-blue-200 text-blue-700'}`}>
              {h.sellSuggestion}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {confirmDelete === h.code ? (
              <>
                <button onClick={() => handleDelete(h.code)} className="text-xs text-red-600 hover:text-red-800">确认删除</button>
                <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-400">取消</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(h.code)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500">
                <Trash2 className="w-3 h-3" /> 删除
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    buy:    { bg: 'bg-red-100', text: 'text-red-700', label: '买入' },
    hold:   { bg: 'bg-blue-100',  text: 'text-blue-700',  label: '持有' },
    reduce: { bg: 'bg-amber-100', text: 'text-amber-700', label: '减持' },
    sell:   { bg: 'bg-red-100',   text: 'text-red-700',   label: '卖出' },
  };
  const c = config[signal] || { bg: 'bg-slate-100', text: 'text-slate-700', label: signal };
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
}
