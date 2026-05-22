import { useState, useEffect } from 'react';
import { Trash2, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PortfolioHolding } from '@/hooks/usePortfolio';
import SignalBadge from './SignalBadge';
import HoldingsPanel from '@/components/fund/HoldingsPanel';
import InvestModal from './InvestModal';

interface HoldingCardProps {
  holding: PortfolioHolding;
  onRemove: (code: string) => void;
}

export default function HoldingCard({ holding, onRemove }: HoldingCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [investOpen, setInvestOpen] = useState(false);
  const [takeProfitOpen, setTakeProfitOpen] = useState(false);
  const [holdingsOpen, setHoldingsOpen] = useState(false);

  const handleRemove = () => {
    if (confirmDelete) {
      onRemove(holding.code);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => {
        setConfirmDelete(false);
      }, 4000);
    }
  };

  const isPositive = holding.pnl >= 0;
  const pnlColor = isPositive ? 'text-red-600' : 'text-green-600';

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1.5">
                <CardTitle className="text-lg truncate">
                  {holding.code} {holding.name}
                </CardTitle>
                <SignalBadge signal={holding.signal} />
              </div>
              <p className="text-xs text-muted-foreground">
                {holding.signal.reason}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-slate-800">
                ¥{holding.currentValue.toLocaleString()}
              </div>
              <p className={cn('text-sm font-medium mt-0.5', pnlColor)}>
                {isPositive ? '+' : ''}¥{holding.pnl.toLocaleString()}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Detail row */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              投入: <span className="text-slate-700 font-medium">¥{holding.amount.toLocaleString()}</span>
            </span>
            <span className="text-muted-foreground">
              成本: <span className="text-slate-700 font-medium">{holding.costNav}</span>
            </span>
            <span className="text-muted-foreground">
              净值: <span className="text-slate-700 font-medium">{holding.currentNav}</span>
              {holding.navSource && (
                <span className={cn('ml-1 text-xs px-1 py-0.5 rounded', holding.navSource === '官方净值' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600')}>
                  {holding.navSource}
                </span>
              )}
              {holding.todayChange != null && holding.todayChange !== 0 && (
                <span className={cn('ml-1 text-xs', holding.todayChange >= 0 ? 'text-red-600' : 'text-green-500')}>
                  {holding.todayChange >= 0 ? '+' : ''}{holding.todayChange}%
                </span>
              )}
            </span>
            <span className={cn('font-medium', pnlColor)}>
              盈亏: {isPositive ? '+' : ''}{holding.pnlPercent}%
              {holding.todayPnl != null && holding.todayPnl !== 0 && (
                <span className={cn('ml-1 text-xs font-normal', holding.todayPnl >= 0 ? 'text-red-600' : 'text-green-500')}>
                  今日{holding.todayPnl >= 0 ? '+' : ''}¥{holding.todayPnl.toLocaleString()}
                </span>
              )}
            </span>
          </div>

          {/* Sell suggestion */}
          {holding.sellSuggestion && (
            <div className="px-3 py-1.5 rounded bg-amber-50 border border-amber-100 text-xs text-amber-700">
              {holding.sellSuggestion}
            </div>
          )}

          {/* Score bar */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">综合评分:</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-48">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  holding.score.total >= 70 ? 'bg-red-500' :
                  holding.score.total >= 50 ? 'bg-amber-500' :
                  'bg-green-500',
                )}
                style={{ width: `${holding.score.total}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {holding.score.total}/100
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInvestOpen(true)}
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              定投计算
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTakeProfitOpen(!takeProfitOpen)}
            >
              {takeProfitOpen ? (
                <ChevronUp className="w-4 h-4 mr-1" />
              ) : (
                <ChevronDown className="w-4 h-4 mr-1" />
              )}
              止盈评估
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHoldingsOpen(!holdingsOpen)}
            >
              {holdingsOpen ? (
                <ChevronUp className="w-4 h-4 mr-1" />
              ) : (
                <ChevronDown className="w-4 h-4 mr-1" />
              )}
              查看重仓股
            </Button>
            <Button
              variant={confirmDelete ? 'destructive' : 'ghost'}
              size="sm"
              onClick={handleRemove}
              className="ml-auto"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {confirmDelete ? '确认删除' : '删除'}
            </Button>
          </div>

          {/* Take-profit expandable section */}
          {takeProfitOpen && (
            <TakeProfitSection code={holding.code} />
          )}

          {/* Holdings expandable section */}
          {holdingsOpen && (
            <div className="mt-3">
              <HoldingsPanel code={holding.code} fundName={holding.name} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invest modal */}
      <InvestModal
        code={holding.code}
        name={holding.name}
        open={investOpen}
        onClose={() => setInvestOpen(false)}
      />
    </>
  );
}

function TakeProfitSection({ code }: { code: string }) {
  const [data, setData] = useState<{
    currentReturn: number;
    fundType: string;
    holdingDays: number;
    evaluation: {
      shouldTakeProfit: boolean;
      targetReturn: number;
      method: string;
      description: string;
      remainingRatio: number;
      action: string;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/portfolio/${code}/takeProfit`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : '请求失败'))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="mt-3 p-4 rounded-lg bg-slate-50 border border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">加载止盈评估...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mt-3 p-4 rounded-lg bg-slate-50 border border-slate-100">
        <p className="text-sm text-red-500">{error || '加载失败'}</p>
      </div>
    );
  }

  return (
    <div className="mt-3 p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">止盈评估</span>
        <span className={cn(
          'text-xs font-medium px-2 py-0.5 rounded-full',
          data.evaluation.shouldTakeProfit
            ? 'bg-amber-100 text-amber-700'
            : 'bg-blue-100 text-blue-700',
        )}>
          {data.evaluation.shouldTakeProfit ? '建议止盈' : '暂不止盈'}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>当前收益: <span className="text-slate-700 font-medium">{data.currentReturn}%</span></span>
        <span>持有天数: <span className="text-slate-700 font-medium">{data.holdingDays}天</span></span>
        <span>目标收益: <span className="text-slate-700 font-medium">{data.evaluation.targetReturn}%</span></span>
      </div>

      <p className="text-sm text-slate-600">{data.evaluation.description}</p>
      <p className="text-sm font-medium text-slate-800">{data.evaluation.action}</p>

      {data.evaluation.remainingRatio < 1 && (
        <p className="text-xs text-muted-foreground">
          建议保留比率: {(data.evaluation.remainingRatio * 100).toFixed(0)}%
        </p>
      )}
    </div>
  );
}
