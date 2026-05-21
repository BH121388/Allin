import { useState, useCallback } from 'react';
import type { ApiResponse, StockScore } from '@allin/shared';

interface ScreenedStock {
  code: string;
  name: string;
  industry: string;
  marketCap: number;
  pe: number;
  pb: number;
  roe: number;
  score: StockScore;
  currentPrice: number;
  priceDate: string;
  ret5d: number;
  ret30d: number;
  maxDrawdown: number;
  sharpe: number;
  volatility: number;
}

interface StockScreenerFilters {
  minPE?: number;
  maxPE?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  industry?: string;
  minROE?: number;
  minRevenueGrowth?: number;
}

interface StockScreenerData {
  filters: StockScreenerFilters;
  stocks: ScreenedStock[];
  totalScanned: number;
  coarsePassed: number;
  generatedAt: string;
}

interface UseStockScreenerReturn {
  result: StockScreenerData | null;
  loading: boolean;
  error: string | null;
  search: (filters: StockScreenerFilters) => void;
}

export function useStockScreener(): UseStockScreenerReturn {
  const [result, setResult] = useState<StockScreenerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback((filters: StockScreenerFilters) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== null) params.set(k, String(v));
    });

    fetch(`/api/stocks/screener?${params.toString()}`)
      .then(res => res.json())
      .then((json: ApiResponse<StockScreenerData>) => {
        if (json.success) {
          setResult(json.data);
        } else {
          setError(json.error);
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : '请求失败'))
      .finally(() => setLoading(false));
  }, []);

  return { result, loading, error, search };
}
