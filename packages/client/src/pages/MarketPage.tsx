import { useMarket } from '@/hooks/useMarket';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import type { SectorInfo, MarketEvent } from '@allin/shared';

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtInflow(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}亿`;
}

// ============================================================
// Loading skeleton
// ============================================================

function Skeleton() {
  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-32 bg-slate-200 rounded" />
          <div className="h-4 w-24 bg-slate-200 rounded mt-2" />
        </div>
        <div className="h-9 w-20 bg-slate-200 rounded-lg" />
      </div>

      {/* Hot sectors skeleton */}
      <div className="h-16 bg-slate-200 rounded-xl" />

      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="h-5 w-24 bg-slate-200 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-200 rounded" />
          ))}
        </div>
      </div>

      {/* Events skeleton */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="h-5 w-24 bg-slate-200 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-slate-200 rounded" />
        ))}
      </div>

      {/* Opportunities skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-40 bg-slate-200 rounded-xl" />
        <div className="h-40 bg-slate-200 rounded-xl" />
      </div>
    </div>
  );
}

// ============================================================
// Hot sectors bar
// ============================================================

function HotSectorsBar({ sectors }: { sectors: SectorInfo[] }) {
  if (sectors.length === 0) return null;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🔥</span>
          <h3 className="text-sm font-semibold text-slate-700">热门板块</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {sectors.map((s) => (
            <span
              key={s.name}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200"
            >
              {s.name}
              <span className="text-emerald-600 text-xs font-semibold">
                {fmtPct(s.changePercent)}
              </span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Sector rankings table
// ============================================================

function SectorTable({ allSectors, topGainers, topLosers, hotSectors }: {
  allSectors: SectorInfo[];
  topGainers: SectorInfo[];
  topLosers: SectorInfo[];
  hotSectors: SectorInfo[];
}) {
  const topGainerNames = new Set(topGainers.map((s) => s.name));
  const topLoserNames = new Set(topLosers.map((s) => s.name));
  const hotNames = new Set(hotSectors.map((s) => s.name));

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📊</span>
          <h3 className="text-sm font-semibold text-slate-700">板块排行</h3>
          <span className="text-xs text-muted-foreground ml-auto">
            {allSectors.length} 个板块
          </span>
        </div>

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">板块</th>
                <th className="px-3 py-2 text-right">涨跌</th>
                <th className="px-3 py-2 text-right">5日%</th>
                <th className="px-3 py-2 text-right">资金</th>
                <th className="px-3 py-2 text-right">涨跌比</th>
                <th className="px-3 py-2">逻辑</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {allSectors.map((sector, index) => {
                const isTop5 = topGainerNames.has(sector.name);
                const isBottom5 = topLoserNames.has(sector.name);
                const isHot = hotNames.has(sector.name);

                // Determine ratio display
                const ratioStr = `${sector.upCount}/${sector.downCount}`;

                return (
                  <tr
                    key={sector.name}
                    className={cn(
                      'border-b border-slate-100 hover:bg-slate-50 transition-colors',
                      isTop5 && 'bg-emerald-50/60 hover:bg-emerald-50',
                      isBottom5 && 'bg-red-50/60 hover:bg-red-50',
                    )}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {index + 1}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {sector.name}
                      {isHot && (
                        <span className="ml-1.5 text-amber-500 text-xs" title="连续3日上涨">
                          🔥
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right font-mono text-xs font-semibold',
                        sector.changePercent >= 0 ? 'text-emerald-600' : 'text-red-600',
                      )}
                    >
                      {fmtPct(sector.changePercent)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right font-mono text-xs',
                        sector.change5d >= 0 ? 'text-emerald-600' : 'text-red-600',
                      )}
                    >
                      {fmtPct(sector.change5d)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right font-mono text-xs',
                        sector.netInflow >= 0 ? 'text-emerald-600' : 'text-red-600',
                      )}
                    >
                      {fmtInflow(sector.netInflow)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-600">
                      {ratioStr}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[200px] truncate">
                      {sector.reason}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {(isTop5 || isBottom5) && (
                        <span
                          className={cn(
                            'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs',
                            isTop5 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600',
                          )}
                          title={isTop5 ? '领涨板块' : '领跌板块'}
                        >
                          {isTop5 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Event severity config
// ============================================================

const SEVERITY_CONFIG: Record<MarketEvent['severity'], {
  dot: string;
  border: string;
  bg: string;
  label: string;
  labelClass: string;
}> = {
  critical: {
    dot: '🔴',
    border: 'border-l-red-500',
    bg: 'bg-red-50/40',
    label: '重要',
    labelClass: 'bg-red-100 text-red-700',
  },
  important: {
    dot: '🟡',
    border: 'border-l-amber-500',
    bg: 'bg-amber-50/40',
    label: '关注',
    labelClass: 'bg-amber-100 text-amber-700',
  },
  normal: {
    dot: '⚪',
    border: 'border-l-slate-300',
    bg: 'bg-white',
    label: '资讯',
    labelClass: 'bg-slate-100 text-slate-600',
  },
};

// ============================================================
// News events
// ============================================================

function NewsEvents({ events }: { events: MarketEvent[] }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📰</span>
          <h3 className="text-sm font-semibold text-slate-700">今日要闻</h3>
          <span className="text-xs text-muted-foreground ml-auto">
            {events.length} 条
          </span>
        </div>

        <div className="space-y-3">
          {events.map((event, idx) => {
            const config = SEVERITY_CONFIG[event.severity];
            return (
              <div
                key={idx}
                className={cn(
                  'rounded-lg border-l-4 p-4',
                  config.border,
                  config.bg,
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">{config.dot}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                          config.labelClass,
                        )}
                      >
                        {config.label}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">
                        {event.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      <span>时间: {event.time}</span>
                      <span>来源: {event.source}</span>
                    </div>

                    <p className="text-xs text-slate-600 mb-2">
                      {event.summary}
                    </p>

                    {(event.bullishSectors.length > 0 || event.bearishSectors.length > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {event.bullishSectors.map((s) => (
                          <span
                            key={`bull-${s}`}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700"
                          >
                            <TrendingUp className="w-3 h-3" />
                            {s}
                          </span>
                        ))}
                        {event.bearishSectors.map((s) => (
                          <span
                            key={`bear-${s}`}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700"
                          >
                            <TrendingDown className="w-3 h-3" />
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Market impact summary
// ============================================================

function MarketImpact({ events, topGainers, topLosers }: {
  events: MarketEvent[];
  topGainers: SectorInfo[];
  topLosers: SectorInfo[];
}) {
  // Collect unique bullish/bearish sectors from events
  const bullishFromEvents = new Set<string>();
  const bearishFromEvents = new Set<string>();
  for (const event of events) {
    for (const s of event.bullishSectors) bullishFromEvents.add(s);
    for (const s of event.bearishSectors) bearishFromEvents.add(s);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">💡</span>
          <h3 className="text-sm font-semibold text-slate-700">市场影响总结</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Bullish */}
          <div>
            <h4 className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              利好板块
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {bullishFromEvents.size > 0 ? (
                [...bullishFromEvents].map((s) => {
                  const sector = [...topGainers].find((g) => g.name === s);
                  return (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      {s}
                      {sector && (
                        <span className="text-emerald-500 text-[10px]">
                          {fmtPct(sector.changePercent)}
                        </span>
                      )}
                    </span>
                  );
                })
              ) : (
                <span className="text-xs text-muted-foreground">暂无明确利好板块</span>
              )}
            </div>
          </div>

          {/* Bearish */}
          <div>
            <h4 className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              承压板块
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {bearishFromEvents.size > 0 ? (
                [...bearishFromEvents].map((s) => {
                  const sector = [...topLosers].find((l) => l.name === s);
                  return (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200"
                    >
                      {s}
                      {sector && (
                        <span className="text-red-500 text-[10px]">
                          {fmtPct(sector.changePercent)}
                        </span>
                      )}
                    </span>
                  );
                })
              ) : (
                <span className="text-xs text-muted-foreground">暂无明确承压板块</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Opportunities & Risks panels
// ============================================================

function OpportunityPanels({ opportunities, risks }: {
  opportunities: string[];
  risks: string[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Opportunities */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🎯</span>
            <h3 className="text-sm font-semibold text-slate-700">今日红利机会</h3>
          </div>
          {opportunities.length > 0 ? (
            <ol className="space-y-2">
              {opportunities.map((opp, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-xs font-bold text-emerald-500 mt-0.5 shrink-0">
                    {idx + 1}.
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">{opp}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">暂无突出机会</p>
          )}
        </CardContent>
      </Card>

      {/* Risks */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">⚠️</span>
            <h3 className="text-sm font-semibold text-slate-700">风险提示</h3>
          </div>
          {risks.length > 0 ? (
            <ul className="space-y-2">
              {risks.map((risk, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-xs text-red-500 mt-0.5 shrink-0">!</span>
                  <p className="text-xs text-slate-700 leading-relaxed">{risk}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">暂无显著风险</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Main page
// ============================================================

export default function MarketPage() {
  const { data, loading, error, refresh } = useMarket();

  // Loading state with skeleton
  if (loading && !data) {
    return <Skeleton />;
  }

  // Error state
  if (error && !data) {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <Card>
          <CardContent className="flex flex-col items-center py-16 gap-4">
            <p className="text-red-500 text-sm">{error}</p>
            <Button onClick={refresh} variant="outline" size="sm">
              重试
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No data
  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <p className="text-muted-foreground text-sm">暂无市场数据</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">市场概览</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.date}
          </p>
        </div>
        <Button
          onClick={refresh}
          disabled={loading}
          variant="outline"
          className="shrink-0 gap-2"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          {loading ? '刷新中...' : '刷新'}
        </Button>
      </div>

      {/* Hot sectors */}
      <HotSectorsBar sectors={data.hotSectors} />

      {/* Sector rankings table */}
      <SectorTable
        allSectors={data.allSectors}
        topGainers={data.topGainers}
        topLosers={data.topLosers}
        hotSectors={data.hotSectors}
      />

      {/* News events */}
      <NewsEvents events={data.events} />

      {/* Market impact summary */}
      <MarketImpact
        events={data.events}
        topGainers={data.topGainers}
        topLosers={data.topLosers}
      />

      {/* Opportunities & Risks */}
      <OpportunityPanels
        opportunities={data.opportunities}
        risks={data.risks}
      />
    </div>
  );
}
