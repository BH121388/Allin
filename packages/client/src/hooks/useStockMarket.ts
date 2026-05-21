import { useState, useCallback, useEffect } from 'react';
import type { ApiResponse } from '@allin/shared';

export interface IndexQuote {
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  upCount: number;
  downCount: number;
}

export interface SectorPerformance {
  name: string;
  changePct: number;
  upCount: number;
  downCount: number;
  leadingStock: string;
}

export interface MarketBreadth {
  totalStocks: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  limitUp: number;
  limitDown: number;
  upPct: number;
}

export interface MarketOverview {
  indices: IndexQuote[];
  topSectors: SectorPerformance[];
  bottomSectors: SectorPerformance[];
  allSectors: SectorPerformance[];
  breadth: MarketBreadth;
  hotStocks: Array<{ code: string; name: string; changePct: number; reason: string }>;
  mcpData?: {
    fearGreedIndex: number;
    marketTemperature: number;
    forwardLook: string;
    hotSectors: string[];
  } | null;
  generatedAt: string;
}

interface UseStockMarketReturn {
  data: MarketOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useStockMarket(): UseStockMarketReturn {
  const [data, setData] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback((forceRefresh = false) => {
    setLoading(true);
    setError(null);
    const url = forceRefresh ? '/api/stocks/market?refresh=true' : '/api/stocks/market';
    fetch(url)
      .then(res => res.json())
      .then((json: ApiResponse<MarketOverview>) => {
        if (json.success) setData(json.data);
        else setError(json.error);
      })
      .catch(err => setError(err instanceof Error ? err.message : '请求失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(false); }, [fetchData]);

  const refresh = useCallback(() => { fetchData(true); }, [fetchData]);

  return { data, loading, error, refresh };
}
