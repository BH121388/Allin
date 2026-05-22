import { useScreener } from '@/hooks/useScreener';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, Shield, BarChart3, UserCheck, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

const PERIODS = [
  { value: '1y', label: '近1年' },
  { value: '6m', label: '近半年' },
  { value: '3m', label: '近3月' },
  { value: '3y', label: '近3年' },
];

const SCORE_LABELS: Record<string, { label: string; icon: React.ReactNode; max: number }> = {
  returnCapability: { label: '收益能力', icon: <TrendingUp className="w-3 h-3" />, max: 30 },
  riskControl: { label: '风险控制', icon: <Shield className="w-3 h-3" />, max: 25 },
  riskAdjustedReturn: { label: '风险调整收益', icon: <BarChart3 className="w-3 h-3" />, max: 20 },
  managerStability: { label: '经理稳定性', icon: <UserCheck className="w-3 h-3" />, max: 15 },
  marketAdaptability: { label: '市场适应性', icon: <Gauge className="w-3 h-3" />, max: 10 },
};

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-10 sm:w-16 h-1 sm:h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function getScoreColor(total: number): string {
  if (total >= 75) return 'text-red-600';
  if (total >= 60) return 'text-blue-600';
  if (total >= 45) return 'text-amber-600';
  return 'text-slate-400';
}

export default function ScreenerPage() {
  const { data, loading, error, period, refresh, changePeriod } = useScreener();

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-800">动态基金筛选</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">
            基于五维量化评分模型，每次刷新实时计算
          </p>
        </div>
        <Button onClick={refresh} disabled={loading} variant="outline" size="sm">
          <RefreshCw className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1', loading && 'animate-spin')} />
          <span className="hidden sm:inline">刷新</span>
        </Button>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <span className="text-xs sm:text-sm text-slate-500">周期:</span>
        {PERIODS.map(p => (
          <button
            key={p.value}
            type="button"
            onClick={() => changePeriod(p.value)}
            className={cn(
              'px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors',
              period === p.value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-slate-400 flex-wrap">
          <span>扫描 {data.totalScanned} 只</span>
          <span>粗筛 {data.coarsePassed} 只</span>
          <span>输出 {data.funds.length} 只</span>
          <span className="hidden sm:inline">{new Date(data.generatedAt).toLocaleTimeString('zh-CN')}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <Button onClick={refresh} variant="outline" size="sm" className="mt-3">
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="space-y-2 sm:space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-3 sm:py-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 sm:h-5 w-40 sm:w-48 bg-slate-200 rounded" />
                  <div className="h-2.5 sm:h-3 w-28 sm:w-32 bg-slate-100 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {data && data.funds.length > 0 && (
        <div className="space-y-2 sm:space-y-3">
          {data.funds.map((fund, index) => (
            <Card key={fund.code}>
              <CardContent className="py-3 sm:py-4 px-3 sm:px-6">
                {/* Mobile: stack vertically; Desktop: row */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                  {/* Top row: rank + name + score */}
                  <div className="flex items-center gap-2 sm:hidden">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                      index < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500',
                    )}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px] text-slate-400">{fund.code}</span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-1 py-0.5 rounded truncate">{fund.type}</span>
                      </div>
                      <h3 className="text-xs font-semibold text-slate-800 truncate">{fund.name}</h3>
                    </div>
                    <div className={cn('text-lg font-bold shrink-0', getScoreColor(fund.score.total))}>
                      {fund.score.total}
                    </div>
                  </div>

                  {/* Desktop: rank badge */}
                  <div className={cn(
                    'w-8 h-8 rounded-full items-center justify-center text-sm font-bold shrink-0 hidden sm:flex',
                    index < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500',
                  )}>
                    {index + 1}
                  </div>

                  {/* Fund info */}
                  <div className="flex-1 min-w-0">
                    {/* Desktop name row */}
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{fund.code}</span>
                      <h3 className="text-sm font-semibold text-slate-800 truncate">{fund.name}</h3>
                      <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{fund.type}</span>
                    </div>

                    {/* Key metrics */}
                    <div className="flex items-center gap-2 sm:gap-3 mt-0.5 sm:mt-1.5 text-[10px] sm:text-xs text-slate-500 flex-wrap">
                      <span>净值 <span className="font-mono text-slate-700">{fund.nav?.toFixed(4)}</span></span>
                      <span className="hidden sm:inline">{fund.navDate}</span>
                      <span className={cn('font-mono font-medium', fund.ret1y >= 0 ? 'text-red-600' : 'text-green-600')}>
                        1Y {fund.ret1y >= 0 ? '+' : ''}{fund.ret1y.toFixed(1)}%
                      </span>
                      <span className="text-slate-400">DD {fund.maxDrawdown.toFixed(1)}%</span>
                      <span className="text-slate-400">SR {fund.sharpe.toFixed(2)}</span>
                      <span className="hidden sm:inline text-slate-400">Calmar {fund.calmar.toFixed(2)}</span>
                    </div>

                    {/* Score bars */}
                    <div className="flex items-center gap-1.5 sm:gap-3 mt-1.5 sm:mt-2 flex-wrap">
                      {Object.entries(fund.score).filter(([k]) => k !== 'total').map(([key, value]) => {
                        const cfg = SCORE_LABELS[key];
                        if (!cfg) return null;
                        return (
                          <div key={key} className="flex items-center gap-0.5 sm:gap-1" title={`${cfg.label}: ${value}/${cfg.max}`}>
                            <span className="text-slate-400">{cfg.icon}</span>
                            <span className="text-[9px] sm:text-[10px] text-slate-500">{value}</span>
                            <ScoreBar value={value} max={cfg.max} color={
                              key === 'returnCapability' ? 'bg-blue-500' :
                              key === 'riskControl' ? 'bg-emerald-500' :
                              key === 'riskAdjustedReturn' ? 'bg-purple-500' :
                              key === 'managerStability' ? 'bg-amber-500' :
                              'bg-cyan-500'
                            } />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Desktop total score */}
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className={cn('text-2xl font-bold', getScoreColor(fund.score.total))}>
                      {fund.score.total}
                    </div>
                    <div className="text-xs text-slate-400">综合得分</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {data && data.funds.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-400">当前周期暂无符合粗筛条件的基金</p>
            <Button onClick={refresh} variant="outline" size="sm" className="mt-3">
              刷新
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Risk disclaimer */}
      <p className="text-[10px] sm:text-xs text-slate-300 text-center mt-3 sm:mt-4">
        历史业绩不预示未来，市场有风险，投资需谨慎。筛选结果基于客观指标，不构成投资建议。
      </p>
    </div>
  );
}
