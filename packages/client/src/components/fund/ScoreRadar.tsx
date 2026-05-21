import { useMemo } from 'react';
import type { FundAnalysis } from '@allin/shared';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ScoreRadarProps {
  funds: FundAnalysis[];
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

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'];

export default function ScoreRadar({ funds }: ScoreRadarProps) {
  const radarData = useMemo(() => {
    // Transform to recharts shape: each entry is { dimension: string, [fundCode]: percentage }
    return DIMENSIONS.map((dim) => {
      const entry: Record<string, string | number> = {
        dimension: dim.label,
      };
      funds.forEach((fund) => {
        const score = fund.score[dim.key];
        entry[fund.code] = Math.round((score / dim.max) * 100);
      });
      return entry;
    });
  }, [funds]);

  if (funds.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fontSize: 13, fill: '#475569' }}
        />
        <PolarRadiusAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickCount={5}
          angle={30}
        />
        {funds.map((fund, index) => (
          <Radar
            key={fund.code}
            name={fund.code}
            dataKey={fund.code}
            stroke={COLORS[index % COLORS.length]}
            fill={COLORS[index % COLORS.length]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
        <Legend
          wrapperStyle={{ fontSize: 13, paddingTop: 16 }}
          iconType="circle"
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
