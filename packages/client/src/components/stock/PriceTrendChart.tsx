import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface PricePoint {
  date: string;
  price: number;
}

interface PriceTrendChartProps {
  data: PricePoint[];
  currentPrice?: number;
}

export default function PriceTrendChart({ data, currentPrice }: PriceTrendChartProps) {
  if (!data || data.length < 2) {
    return (
      <div className="flex flex-col items-center py-8 text-slate-400">
        <TrendingUp className="w-8 h-8 mb-2 text-slate-300" />
        <p className="text-sm">暂无走势数据</p>
      </div>
    );
  }

  const firstPrice = data[0].price;
  const lastPrice = data[data.length - 1].price;
  const change = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const isUp = change >= 0;

  const step = Math.max(1, Math.floor(data.length / 8));
  const chartData = data.map((d, i) => ({
    ...d,
    label: i % step === 0 ? d.date.slice(5) : '',
  }));

  const prices = data.map(d => d.price);
  const priceMin = Math.min(...prices);
  const priceMax = Math.max(...prices);
  const padding = Math.max((priceMax - priceMin) * 0.1, 0.5);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">近期走势</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">
            最新 <span className="font-mono font-medium text-slate-700">{currentPrice?.toFixed(2) || lastPrice.toFixed(2)}</span>
          </span>
          <span className={isUp ? 'text-red-500 font-medium' : 'text-green-500 font-medium'}>
            30日 {isUp ? '+' : ''}{change.toFixed(2)}%
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={0} />
          <YAxis
            domain={[priceMin - padding, priceMax + padding]}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v.toFixed(1)}
            width={55}
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            formatter={(value: number) => [value.toFixed(2), '价格']}
            labelFormatter={(label: string) => `日期: ${label}`}
          />
          <Line type="monotone" dataKey="price" stroke={isUp ? '#ef4444' : '#10b981'} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
