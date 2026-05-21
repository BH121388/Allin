import { useState, useCallback } from 'react';
import { Search, TrendingUp, Shield, BarChart3, Briefcase, User, X } from 'lucide-react';
import { useFundSearch } from '@/hooks/useFundSearch';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import SignalBadge from '@/components/portfolio/SignalBadge';
import HoldingsPanel from '@/components/fund/HoldingsPanel';
import NavTrendChart from '@/components/fund/NavTrendChart';
import { cn } from '@/lib/utils';
import type { FundAnalysis } from '@allin/shared';

// Dimension definitions with Chinese labels and max scores
const DIMENSIONS = [
  { key: 'momentum' as const, label: '收益动量', max: 25 },
  { key: 'riskControl' as const, label: '风险控制', max: 20 },
  { key: 'riskAdjusted' as const, label: '风险调整', max: 15 },
  { key: 'manager' as const, label: '经理能力', max: 15 },
  { key: 'scale' as const, label: '规模流动', max: 15 },
  { key: 'sectorMatch' as const, label: '景气匹配', max: 10 },
];

function getBarColor(ratio: number): string {
  if (ratio >= 0.85) return 'bg-emerald-500';
  if (ratio >= 0.65) return 'bg-amber-500';
  return 'bg-slate-300';
}

function getGrade(score: number): { stars: string; label: string; color: string } {
  if (score >= 85) return { stars: '⭐⭐⭐⭐⭐', label: '强烈推荐', color: 'text-emerald-600' };
  if (score >= 70) return { stars: '⭐⭐⭐⭐', label: '推荐', color: 'text-emerald-500' };
  if (score >= 60) return { stars: '⭐⭐⭐', label: '中性', color: 'text-amber-500' };
  if (score >= 50) return { stars: '⭐⭐', label: '谨慎', color: 'text-amber-600' };
  return { stars: '⭐', label: '回避', color: 'text-red-500' };
}

// ---- Sub-components ----

function InitialState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Search className="w-16 h-16 mb-4 text-slate-300" />
        <p className="text-lg font-medium text-slate-400">输入基金代码查询完整分析报告</p>
        <p className="text-sm text-slate-300 mt-2">如 005827, 110011, 161725 等</p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm">正在查询基金数据...</p>
      </CardContent>
    </Card>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-12 gap-4">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <X className="w-6 h-6 text-red-500" />
        </div>
        <p className="text-red-500 text-sm">{error}</p>
        <Button onClick={onRetry} variant="outline" size="sm">
          重试
        </Button>
      </CardContent>
    </Card>
  );
}

function RiskMetricItem({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-medium text-slate-800">
        {value}{unit || '%'}
      </span>
    </div>
  );
}

function FundReport({ fund }: { fund: FundAnalysis }) {
  const grade = getGrade(fund.score.total);

  return (
    <div className="space-y-4">
      {/* Basic Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl flex items-center gap-3">
                <span className="font-mono text-blue-600">{fund.code}</span>
                <span className="truncate">{fund.name}</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {fund.type} | {fund.company}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl font-bold text-primary">{fund.score.total}</div>
              <p className={cn('text-xs font-medium mt-0.5', grade.color)}>
                {grade.stars} {grade.label}
              </p>
              {fund.currentNav != null && (
                <p className="text-xs text-slate-500 mt-1">
                  净值 <span className="font-mono font-medium text-slate-700">{fund.currentNav.toFixed(4)}</span>
                  {fund.navDate && <span className="ml-1 text-slate-400">{fund.navDate}</span>}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">基金经理:</span>
              <span className="font-medium">{fund.manager || '暂无数据'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">任职回报:</span>
              <span className={cn('font-medium font-mono', fund.managerReturn?.startsWith('+') ? 'text-emerald-600' : 'text-red-500')}>
                {fund.managerReturn || '暂无数据'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">规模:</span>
              <span className="font-medium">{fund.scale > 0 ? `${fund.scale}亿` : '暂无数据'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">成立:</span>
              <span className="font-medium">{fund.inception || '暂无数据'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">任期:</span>
              <span className="font-medium">{fund.tenure || '暂无数据'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score + Signal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score bars */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">六维评分</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {DIMENSIONS.map((dim) => {
              const score = fund.score[dim.key];
              const ratio = score / dim.max;
              const barColor = getBarColor(ratio);

              return (
                <div key={dim.key} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-16 shrink-0 text-right">
                    {dim.label}
                  </span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', barColor)}
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono text-muted-foreground w-14 shrink-0">
                    {score}<span className="text-xs">/{dim.max}</span>
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Signal + Invest Advice */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">操作建议</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">交易信号:</span>
              <SignalBadge signal={fund.signal} />
            </div>
            {fund.signal.suggestedPosition && (
              <div>
                <span className="text-sm text-muted-foreground">建议仓位:</span>
                <span className="ml-2 text-sm font-medium">{fund.signal.suggestedPosition}</span>
              </div>
            )}
            {fund.signal.reason && (
              <div>
                <span className="text-sm text-muted-foreground">信号依据:</span>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{fund.signal.reason}</p>
              </div>
            )}
            {fund.investAdvice && (
              <div className="pt-3 border-t">
                <p className="text-sm font-medium text-slate-700 mb-1">定投建议</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  PE分位: {fund.investAdvice.pePercentile}%
                  {fund.investAdvice.multiplier !== 1.0 && (
                    <span className="ml-2">定投倍数: {fund.investAdvice.multiplier}x</span>
                  )}
                </p>
                {fund.investAdvice.strategy && (
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {fund.investAdvice.strategy}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analysis */}
      {fund.analysis && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">详细分析</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {fund.analysis}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Risk Metrics */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-base">风险指标</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <RiskMetricItem label="最大回撤" value={fund.riskMetrics.maxDrawdown} />
            <RiskMetricItem label="年化波动率" value={fund.riskMetrics.volatility} />
            <RiskMetricItem label="夏普比率" value={fund.riskMetrics.sharpe} unit="" />
            <RiskMetricItem label="索提诺比率" value={fund.riskMetrics.sortino} unit="" />
            <RiskMetricItem label="卡尔玛比率" value={fund.riskMetrics.calmar} unit="" />
            <RiskMetricItem label="信息比率" value={fund.riskMetrics.infoRatio} unit="" />
            <RiskMetricItem label="Beta" value={fund.riskMetrics.beta} unit="" />
            <RiskMetricItem label="Alpha" value={fund.riskMetrics.alpha} unit="" />
          </div>
        </CardContent>
      </Card>

      {/* Chart + Sectors + Peer Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* NAV Trend Chart */}
        <Card className="md:col-span-2 overflow-hidden">
          <NavTrendChart
            data={fund.navHistory || []}
            currentNav={fund.currentNav}
          />
        </Card>

        {/* Sector Tags + Peer Comparison */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">行业与排名</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fund.sectorTags && fund.sectorTags.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">行业标签</p>
                <div className="flex flex-wrap gap-1.5">
                  {fund.sectorTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {fund.peerComparison && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">同类比较</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">同类排名</span>
                    <span className="font-medium">
                      前 {fund.peerComparison.rankPercentile}% ({fund.peerComparison.totalPeers}只)
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">本基金收益</span>
                    <span className={cn('font-mono font-medium', fund.peerComparison.fundReturn >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {fund.peerComparison.fundReturn >= 0 ? '+' : ''}{fund.peerComparison.fundReturn}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">同类平均</span>
                    <span className={cn('font-mono font-medium', fund.peerComparison.categoryAvgReturn >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {fund.peerComparison.categoryAvgReturn >= 0 ? '+' : ''}{fund.peerComparison.categoryAvgReturn}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Page Component ----

export default function SearchPage() {
  const { fund, loading, error, search } = useFundSearch();
  const [inputValue, setInputValue] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed.length === 6) {
      setHasSearched(true);
      search(trimmed);
    }
  }, [inputValue, search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch]
  );

  const handleRetry = useCallback(() => {
    search(inputValue.trim());
  }, [inputValue, search]);

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">基金查询</h1>
        <p className="text-sm text-muted-foreground mt-1">
          输入6位基金代码，查看完整分析报告
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={6}
            placeholder="输入6位基金代码"
            className="w-full h-11 px-4 pr-10 rounded-lg border border-slate-200 bg-white text-sm
                       font-mono placeholder:text-slate-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50"
            disabled={loading}
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button
          onClick={handleSearch}
          disabled={loading || inputValue.trim().length !== 6}
          className="h-11 px-6"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Search className="w-4 h-4" />
              <span className="ml-2">搜索</span>
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-slate-400">
        提示: 如 005827, 110011, 161725 等
      </p>

      {/* States */}
      {!hasSearched && !loading && !error && !fund && <InitialState />}
      {loading && <LoadingState />}
      {!loading && error && <ErrorState error={error} onRetry={handleRetry} />}
      {!loading && !error && fund && (
        <>
          <FundReport fund={fund} />
          <HoldingsPanel code={fund.code} fundName={fund.name} />
        </>
      )}
    </div>
  );
}
