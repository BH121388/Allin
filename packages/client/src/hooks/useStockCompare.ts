import { useState, useCallback } from 'react';
import type { ApiResponse, StockScore } from '@allin/shared';

interface CompareItem {
  code: string; name: string; industry: string;
  currentPrice: number; changePct: number; marketCap: number;
  pe: number; pb: number; roe: number;
  revenueGrowth: number; profitGrowth: number;
  score: StockScore;
  ret5d: number; ret30d: number;
  maxDrawdown: number; sharpe: number; volatility: number;
  boll: any; kdj: any; obv: any; trend: string;
}

interface ComparisonResult {
  stocks: CompareItem[];
  bestPick: { code: string; name: string; reason: string };
  analysis: string;
}

interface UseStockCompareReturn {
  result: ComparisonResult | null;
  loading: boolean;
  error: string | null;
  compare: (codes: string[]) => void;
}

export function useStockCompare(): UseStockCompareReturn {
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback((codes: string[]) => {
    setLoading(true); setError(null);
    fetch(`/api/stocks/compare?codes=${codes.join(',')}`)
      .then(r => r.json())
      .then((json: ApiResponse<ComparisonResult>) => {
        if (json.success) setResult(json.data); else setError(json.error);
      })
      .catch(err => setError(err instanceof Error ? err.message : '请求失败'))
      .finally(() => setLoading(false));
  }, []);

  return { result, loading, error, compare };
}
