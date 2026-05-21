import { useMemo } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Legend, ResponsiveContainer,
} from 'recharts';

interface StockScoreItem {
  code: string;
  name: string;
  momentum: number;
  riskControl: number;
  riskAdjusted: number;
  companyQuality: number;
  valuation: number;
  sectorMatch: number;
  total: number;
}

const DIMENSIONS = [
  { key: 'momentum' as const, label: '收益动量', max: 25 },
  { key: 'riskControl' as const, label: '风险控制', max: 20 },
  { key: 'riskAdjusted' as const, label: '风险调整', max: 15 },
  { key: 'companyQuality' as const, label: '公司质量', max: 15 },
  { key: 'valuation' as const, label: '估值性价比', max: 15 },
  { key: 'sectorMatch' as const, label: '行业景气', max: 10 },
];

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

interface StockScoreRadarProps {
  stocks: StockScoreItem[];
}

export default function StockScoreRadar({ stocks }: StockScoreRadarProps) {
  const radarData = useMemo(() => {
    return DIMENSIONS.map(dim => {
      const entry: Record<string, string | number> = { dimension: dim.label };
      stocks.forEach(s => {
        entry[s.code] = Math.round((s[dim.key] / dim.max) * 100);
      });
      return entry;
    });
  }, [stocks]);

  if (stocks.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 13, fill: '#475569' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickCount={5} angle={30} />
        {stocks.map((s, i) => (
          <Radar
            key={s.code}
            name={`${s.code} ${s.name}`}
            dataKey={s.code}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.12}
            strokeWidth={2}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} iconType="circle" />
      </RadarChart>
    </ResponsiveContainer>
  );
}
