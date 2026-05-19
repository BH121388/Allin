import { useHoldings } from '@/hooks/useHoldings';
import { cn } from '@/lib/utils';

interface HoldingsPanelProps {
  code: string;
  fundName?: string;
}

const SECTOR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-cyan-100 text-cyan-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
];

function getSectorColor(index: number): string {
  return SECTOR_COLORS[index % SECTOR_COLORS.length];
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-3 py-2.5"><div className="h-4 w-5 bg-slate-200 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-4 w-14 bg-slate-200 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-4 w-12 bg-slate-200 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-4 w-10 bg-slate-200 rounded" /></td>
    </tr>
  );
}

export default function HoldingsPanel({ code, fundName }: HoldingsPanelProps) {
  const { holdings, loading, error, refetch } = useHoldings(code);

  // Loading state
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-28 bg-slate-200 rounded animate-pulse" />
            </div>
            <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
          </div>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <div className="h-5 w-12 bg-slate-200 rounded-full animate-pulse" />
            <div className="h-5 w-16 bg-slate-200 rounded-full animate-pulse" />
            <div className="h-5 w-12 bg-slate-200 rounded-full animate-pulse" />
          </div>
          <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">代码</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">名称</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">占比</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">涨跌</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-6 flex flex-col items-center gap-3">
          <p className="text-sm text-red-500">{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="text-sm text-blue-600 hover:text-blue-700 underline underline-offset-2"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // Empty state — should not happen with valid codes, but handle gracefully
  if (!holdings || !holdings.holdings || holdings.holdings.length === 0) {
    return null;
  }

  const top10 = holdings.holdings.slice(0, 10);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            {fundName ? `${fundName} - ` : ''}十大重仓股
          </h3>
          {holdings.dataDate && (
            <span className="text-xs text-slate-400">
              截止 {holdings.dataDate}
            </span>
          )}
          {holdings.source && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded',
              holdings.source === '模拟数据' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            )}>
              {holdings.source === '模拟数据' ? '⚠ ' : '✓ '}{holdings.source}
            </span>
          )}
        </div>
      </div>

      {/* Meta row: sectors, style, weighted change */}
      <div className="px-4 py-2.5 space-y-2">
        {/* Sector tags */}
        {holdings.sectorTags && holdings.sectorTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 shrink-0">板块:</span>
            {holdings.sectorTags.map((tag, i) => (
              <span
                key={tag}
                className={cn(
                  'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                  getSectorColor(i),
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Style */}
        {holdings.style && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 shrink-0">风格:</span>
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {holdings.style}
            </span>
          </div>
        )}

        {/* Weighted change */}
        {holdings.weightedChange !== undefined && holdings.weightedChange !== null && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 shrink-0">加权涨跌:</span>
            <span
              className={cn(
                'text-xs font-mono font-medium',
                holdings.weightedChange >= 0 ? 'text-emerald-600' : 'text-red-600',
              )}
            >
              {holdings.weightedChange >= 0 ? '+' : ''}{holdings.weightedChange.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Holdings table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 w-8">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">代码</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">名称</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">占比</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">涨跌</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((h, i) => {
              const isEven = i % 2 === 1;
              const changeColor = h.changeToday >= 0 ? 'text-emerald-600' : 'text-red-600';
              return (
                <tr
                  key={h.stockCode}
                  className={cn(
                    'text-sm',
                    isEven && 'bg-slate-50',
                  )}
                >
                  <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{h.stockCode}</td>
                  <td className="px-3 py-2 text-slate-800">{h.stockName}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-slate-700">
                    {h.weight.toFixed(2)}%
                  </td>
                  <td className={cn('px-3 py-2 text-right font-mono text-xs', changeColor)}>
                    {h.changeToday >= 0 ? '+' : ''}{h.changeToday.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
