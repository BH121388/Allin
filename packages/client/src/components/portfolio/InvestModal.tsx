import { useState, useEffect } from 'react';
import { X, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiResponse } from '@allin/shared';

interface InvestModalProps {
  code: string;
  name: string;
  open: boolean;
  onClose: () => void;
}

interface InvestResult {
  code: string;
  pePercentile: number;
  baseAmount: number;
  multiplier: number;
  actualAmount: number;
  strategy: string;
}

export default function InvestModal({ code, name, open, onClose }: InvestModalProps) {
  const [pePercentile, setPePercentile] = useState(50);
  const [monthlyBudget, setMonthlyBudget] = useState(5000);
  const [result, setResult] = useState<InvestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const handleCalculate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/portfolio/${code}/invest?pePercentile=${pePercentile}&monthlyBudget=${monthlyBudget}`,
      );

      const json: ApiResponse<InvestResult> = await res.json();

      if (json.success) {
        setResult(json.data);
      } else {
        setError(json.error || '计算失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5 animate-in fade-in zoom-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">定投计算</h2>
            <p className="text-sm text-muted-foreground">
              {code} {name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              PE 百分位: <span className="text-slate-900 font-semibold">{pePercentile}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={pePercentile}
              onChange={(e) => setPePercentile(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>低估</span>
              <span>合理</span>
              <span>高估</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              月定投预算
            </label>
            <input
              type="number"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(Number(e.target.value))}
              min={100}
              step={100}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-xs text-muted-foreground mt-1 block">单位: 元</span>
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading}
            className={cn(
              'w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
              'bg-blue-500 text-white hover:bg-blue-600',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                计算中...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" />
                计算
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">定投倍数</span>
              <span className="text-lg font-bold text-blue-600">{result.multiplier}x</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">策略</span>
              <span className="text-sm font-medium text-slate-700">{result.strategy}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-sm font-medium text-slate-700">本次投入</span>
              <span className="text-xl font-bold text-emerald-600">
                ¥{result.actualAmount.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
