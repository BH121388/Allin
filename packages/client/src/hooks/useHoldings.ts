import { useState, useEffect, useCallback } from 'react';
import type { TopHolding, ApiResponse } from '@allin/shared';

export interface HoldingsData {
  fundCode: string;
  fundName: string;
  holdings: TopHolding[];
  weightedChange: number;
  sectorTags: string[];
  sectorBreakdown: { sector: string; weight: number; tag: string }[];
  style: string;
  dataDate: string;
  source?: string;
}

interface UseHoldingsReturn {
  holdings: HoldingsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useHoldings(code: string | null): UseHoldingsReturn {
  const [holdings, setHoldings] = useState<HoldingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHoldings = useCallback(() => {
    if (!code) {
      setHoldings(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/funds/${encodeURIComponent(code)}/holdings`)
      .then((res) => res.json())
      .then((json: ApiResponse<HoldingsData>) => {
        if (json.success) {
          setHoldings(json.data);
        } else {
          setError(json.error);
          setHoldings(null);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '查询失败');
        setHoldings(null);
      })
      .finally(() => setLoading(false));
  }, [code]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  const refetch = useCallback(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  return { holdings, loading, error, refetch };
}
