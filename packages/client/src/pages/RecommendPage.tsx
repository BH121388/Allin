import { useRecommendations } from '@/hooks/useRecommendations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import FundCard from '@/components/fund/FundCard';
import ScoreRadar from '@/components/fund/ScoreRadar';

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return isoString;
  }
}

export default function RecommendPage() {
  const { recommendations, generatedAt, loading, error, refresh } = useRecommendations();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Allin 基金智能投资决策工具
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              短期动量 Top 10
              {generatedAt && (
                <span className="ml-3">
                  生成时间: {formatTime(generatedAt)}
                </span>
              )}
            </p>
          </div>
          <Button
            onClick={refresh}
            disabled={loading}
            variant="outline"
            className="shrink-0"
          >
            {loading ? '刷新中...' : '刷新推荐'}
          </Button>
        </div>

        {/* Loading state */}
        {loading && recommendations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm">正在加载推荐数据...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && recommendations.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-12 gap-4">
              <p className="text-red-500 text-sm">{error}</p>
              <Button onClick={refresh} variant="outline" size="sm">
                重试
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!loading && !error && recommendations.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <p className="text-muted-foreground text-sm">暂无推荐数据</p>
            </CardContent>
          </Card>
        )}

        {/* Content */}
        {recommendations.length > 0 && (
          <>
            {/* Radar Chart */}
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-2">
                  六维评分雷达图
                </h2>
                <ScoreRadar funds={recommendations} />
              </CardContent>
            </Card>

            {/* Fund Cards */}
            {recommendations.map((fund, index) => (
              <FundCard key={fund.code} fund={fund} rank={index + 1} />
            ))}
          </>
        )}
    </div>
  );
}
