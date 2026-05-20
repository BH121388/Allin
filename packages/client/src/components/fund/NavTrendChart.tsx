import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface NavPoint {
  date: string;
  nav: number;
}

interface NavTrendChartProps {
  data: NavPoint[];
  currentNav?: number;
}

export default function NavTrendChart({ data, currentNav }: NavTrendChartProps) {
  if (!data || data.length < 2) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-8 text-muted-foreground">
          <TrendingUp className="w-8 h-8 mb-2 text-slate-300" />
          <p className="text-sm">暂无走势数据</p>
        </CardContent>
      </Card>
    );
  }

  const firstNav = data[0].nav;
  const lastNav = data[data.length - 1].nav;
  const change = ((lastNav - firstNav) / firstNav) * 100;
  const isUp = change >= 0;

  // Format chart data — show every nth date label to avoid crowding
  const step = Math.max(1, Math.floor(data.length / 8));
  const chartData = data.map((d, i) => ({
    ...d,
    label: i % step === 0 ? d.date.slice(5) : '', // MM-DD
  }));

  const navMin = Math.min(...data.map(d => d.nav));
  const navMax = Math.max(...data.map(d => d.nav));
  const padding = (navMax - navMin) * 0.1 || 0.01;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-base">近期净值走势</CardTitle>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              当前 <span className="font-mono font-medium text-slate-700">{currentNav?.toFixed(4) || lastNav.toFixed(4)}</span>
            </span>
            <span className={isUp ? 'text-emerald-600' : 'text-red-500'}>
              区间 {isUp ? '+' : ''}{change.toFixed(2)}%
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              domain={[navMin - padding, navMax + padding]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(2)}
              width={55}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
              }}
              formatter={(value: number) => [value.toFixed(4), '净值']}
              labelFormatter={(label: string) => `日期: ${label}`}
            />
            <Line
              type="monotone"
              dataKey="nav"
              stroke={isUp ? '#10b981' : '#ef4444'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: isUp ? '#10b981' : '#ef4444' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
