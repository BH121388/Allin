import type { FundAnalysis } from '@allin/shared';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FundCardProps {
  fund: FundAnalysis;
  rank: number; // 1-5
}

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

function getRankStyle(rank: number): { bg: string; text: string } {
  switch (rank) {
    case 1:
      return { bg: 'bg-amber-300', text: 'text-amber-900' };
    case 2:
      return { bg: 'bg-slate-300', text: 'text-slate-700' };
    case 3:
      return { bg: 'bg-amber-600', text: 'text-white' };
    default:
      return { bg: 'bg-slate-200', text: 'text-slate-500' };
  }
}

export default function FundCard({ fund, rank }: FundCardProps) {
  const grade = getGrade(fund.score.total);
  const rankStyle = getRankStyle(rank);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span
                className={cn(
                  'inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold shrink-0',
                  rankStyle.bg,
                  rankStyle.text
                )}
              >
                {rank}
              </span>
              <div className="min-w-0">
                <CardTitle className="text-lg truncate">
                  {fund.code} {fund.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">{fund.type}</p>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-bold text-primary">{fund.score.total}</div>
            <p className={cn('text-xs font-medium mt-0.5', grade.color)}>
              {grade.stars} {grade.label}
            </p>
            {fund.currentNav != null && (
              <p className="text-xs text-slate-400 mt-0.5 font-mono">净值 {fund.currentNav.toFixed(4)}</p>
            )}
          </div>
        </div>
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

        {fund.buyDate && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 mt-1 border-t border-slate-100">
            <div className="text-center px-2 py-1 bg-emerald-50 rounded">
              <p className="text-xs text-slate-500">买入日</p>
              <p className="text-sm font-mono font-medium text-emerald-700">{fund.buyDate}</p>
            </div>
            <div className="text-center px-2 py-1 bg-amber-50 rounded">
              <p className="text-xs text-slate-500">清仓日</p>
              <p className="text-sm font-mono font-medium text-amber-700">{fund.sellDate}</p>
            </div>
            <div className="text-center px-2 py-1 bg-red-50 rounded">
              <p className="text-xs text-slate-500">止损价</p>
              <p className="text-sm font-mono font-medium text-red-600">{fund.stopLoss?.toFixed(4)}</p>
            </div>
            <div className="text-center px-2 py-1 bg-blue-50 rounded">
              <p className="text-xs text-slate-500">目标收益</p>
              <p className="text-sm font-mono font-medium text-blue-600">+{fund.targetReturn}%</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
