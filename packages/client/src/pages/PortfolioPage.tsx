import { useState } from 'react';
import { RefreshCw, Wallet, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePortfolio } from '@/hooks/usePortfolio';
import AddFundForm from '@/components/portfolio/AddFundForm';
import HoldingCard from '@/components/portfolio/HoldingCard';

export default function PortfolioPage() {
  const { holdings, summary, loading, error, refresh, addFund, removeFund } = usePortfolio();
  const [addFormOpen, setAddFormOpen] = useState(false);

  const handleAdd = async (data: { code: string; name: string; amount: number; costNav: number }) => {
    await addFund(data);
  };

  const handleRemove = async (code: string) => {
    try {
      await removeFund(code);
    } catch {
      // Error handled by the hook
    }
  };

  const isPositive = (summary?.totalPnl ?? 0) >= 0;
  const pnlColor = isPositive ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">我的持仓</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {summary && (
                <>
                  总市值 <span className="text-slate-700 font-semibold">¥{summary.totalValue.toLocaleString()}</span>
                  <span className="mx-2">|</span>
                  总盈亏{' '}
                  <span className={cn('font-semibold', pnlColor)}>
                    {isPositive ? '+' : ''}¥{summary.totalPnl.toLocaleString()}
                  </span>
                  <span className="mx-2">|</span>
                  持仓 {holdings.length} 只
                </>
              )}
            </p>
          </div>
          <Button
            onClick={refresh}
            disabled={loading}
            variant="outline"
            size="sm"
            className="shrink-0"
          >
            <RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} />
            {loading ? '刷新中...' : '刷新'}
          </Button>
        </div>

        {/* Loading — skeleton */}
        {loading && holdings.length === 0 && (
          <div className="space-y-4">
            {/* Summary skeleton */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-slate-200 rounded" />
                    <div className="h-4 w-32 bg-slate-200 rounded" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-24 bg-slate-200 rounded" />
                    <div className="h-4 w-24 bg-slate-200 rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Skeleton cards */}
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="animate-pulse space-y-3">
                    <div className="flex justify-between">
                      <div className="space-y-2">
                        <div className="h-5 w-48 bg-slate-200 rounded" />
                        <div className="h-3 w-64 bg-slate-200 rounded" />
                      </div>
                      <div className="space-y-2 text-right">
                        <div className="h-6 w-28 bg-slate-200 rounded ml-auto" />
                        <div className="h-4 w-20 bg-slate-200 rounded ml-auto" />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="h-3 w-24 bg-slate-200 rounded" />
                      <div className="h-3 w-24 bg-slate-200 rounded" />
                      <div className="h-3 w-24 bg-slate-200 rounded" />
                    </div>
                    <div className="h-2 w-48 bg-slate-200 rounded" />
                    <div className="flex gap-2">
                      <div className="h-8 w-24 bg-slate-200 rounded" />
                      <div className="h-8 w-24 bg-slate-200 rounded" />
                      <div className="h-8 w-16 bg-slate-200 rounded ml-auto" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && holdings.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-12 gap-4">
              <p className="text-red-500 text-sm">{error}</p>
              <Button onClick={refresh} variant="outline" size="sm">
                重试
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Content */}
        {!loading && !error && (
          <>
            {/* Summary bar */}
            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="bg-white">
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <Wallet className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">总市值</p>
                      <p className="text-lg font-bold text-slate-800">
                        ¥{summary.totalValue.toLocaleString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white">
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      isPositive ? 'bg-emerald-100' : 'bg-red-100',
                    )}>
                      {isPositive ? (
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">总盈亏</p>
                      <p className={cn('text-lg font-bold', pnlColor)}>
                        {isPositive ? '+' : ''}¥{summary.totalPnl.toLocaleString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white">
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <PiggyBank className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">持有基金</p>
                      <p className="text-lg font-bold text-slate-800">{holdings.length} 只</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Add fund form toggle */}
            <div>
              <Button
                variant={addFormOpen ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setAddFormOpen(!addFormOpen)}
                className="mb-3"
              >
                {addFormOpen ? '收起' : '+ 添加基金'}
              </Button>
              {addFormOpen && (
                <AddFundForm onAdd={handleAdd} />
              )}
            </div>

            {/* Empty state */}
            {holdings.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center py-16 gap-3">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                    <PiggyBank className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-muted-foreground text-sm">还没有持仓基金</p>
                  <p className="text-xs text-muted-foreground">
                    点击上方「添加基金」按钮添加第一只基金
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Holding cards */}
            {holdings.length > 0 && (
              <div className="space-y-4">
                {holdings.map((holding) => (
                  <HoldingCard
                    key={holding.id}
                    holding={holding}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            )}
          </>
        )}
    </div>
  );
}
