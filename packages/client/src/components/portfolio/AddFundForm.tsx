import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FundAnalysis, ApiResponse } from '@allin/shared';

interface AddFundFormProps {
  onAdd: (data: { code: string; name: string; amount: number; costNav: number }) => Promise<void>;
}

export default function AddFundForm({ onAdd }: AddFundFormProps) {
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundInfo, setFundInfo] = useState<FundAnalysis | null>(null);
  const [fetchingFund, setFetchingFund] = useState(false);

  const fetchFund = useCallback(async (fundCode: string) => {
    if (fundCode.length !== 6) {
      setFundInfo(null);
      return;
    }
    setFetchingFund(true);
    setError(null);
    try {
      const res = await fetch(`/api/funds/search?code=${encodeURIComponent(fundCode)}`);
      const json: ApiResponse<FundAnalysis> = await res.json();
      if (json.success) {
        setFundInfo(json.data);
      } else {
        setFundInfo(null);
        setError(json.error || '基金代码不存在');
      }
    } catch {
      setFundInfo(null);
    } finally {
      setFetchingFund(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed.length === 6 && /^\d{6}$/.test(trimmed)) {
      fetchFund(trimmed);
    } else {
      setFundInfo(null);
    }
  }, [code, fetchFund]);

  const handleSubmit = async () => {
    setError(null);

    const trimmed = code.trim();
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setError('请输入6位数字基金代码');
      return;
    }

    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError('投入金额必须大于0');
      return;
    }

    if (!fundInfo) {
      setError('未找到该基金信息，请检查代码');
      return;
    }

    // 成本价 = 最近已公布的官方净值（非盘中估算），来自 navHistory 最后一条
    const lastOfficialNav = fundInfo.navHistory && fundInfo.navHistory.length > 0
      ? fundInfo.navHistory[fundInfo.navHistory.length - 1].nav
      : undefined;
    const costNav = lastOfficialNav ?? fundInfo.currentNav;
    if (!costNav || costNav <= 0) {
      setError('无法获取当前净值，请稍后重试');
      return;
    }

    setLoading(true);
    try {
      await onAdd({
        code: trimmed,
        name: fundInfo.name,
        amount: amountNum,
        costNav,
      });
      setCode('');
      setAmount('');
      setFundInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
            <Plus className="w-4 h-4" />
            添加基金
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">基金代码</label>
              <div className="relative">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="输入6位代码"
                  maxLength={6}
                  className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-lg text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {fetchingFund && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />
                )}
                {!fetchingFund && fundInfo && (
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">投入金额 (元)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例: 10000"
                min={100}
                step={100}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {fundInfo && (() => {
            const lastNav = fundInfo.navHistory && fundInfo.navHistory.length > 0
              ? fundInfo.navHistory[fundInfo.navHistory.length - 1].nav
              : fundInfo.currentNav;
            const lastNavDate = fundInfo.navHistory && fundInfo.navHistory.length > 0
              ? fundInfo.navHistory[fundInfo.navHistory.length - 1].date
              : fundInfo.navDate;
            const isIntraday = fundInfo.currentNav != null && lastNav != null &&
              Math.abs(fundInfo.currentNav - lastNav) > 0.0001;
            return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-blue-50 rounded-lg text-xs">
              <span className="font-medium text-slate-700">{fundInfo.name}</span>
              <span className="text-slate-500">
                成本净值 <span className="font-mono font-medium text-slate-700">{lastNav?.toFixed(4)}</span>
                <span className="text-slate-400 ml-1">({lastNavDate})</span>
              </span>
              {isIntraday && (
                <span className="text-slate-400">
                  盘中估算 <span className="font-mono text-orange-600">{fundInfo.currentNav?.toFixed(4)}</span>
                </span>
              )}
              <span className="text-slate-500">
                份额 <span className="font-mono font-medium text-slate-700">
                  {amount && lastNav ? (Number(amount) / lastNav).toFixed(2) : '—'}
                </span>
              </span>
            </div>
            );
          })()}

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={loading || !fundInfo}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                添加中...
              </>
            ) : (
              '确认添加'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
