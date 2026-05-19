import { useState, useCallback, useEffect } from 'react';
import type { MarketOverview, ApiResponse } from '@allin/shared';

interface UseMarketReturn {
  data: MarketOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMarket(): UseMarketReturn {
  const [data, setData] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback((forceRefresh: boolean) => {
    setLoading(true);
    setError(null);

    const url = forceRefresh
      ? '/api/market/overview?refresh=true'
      : '/api/market/overview';

    fetch(url)
      .then((res) => res.json())
      .then((json: ApiResponse<MarketOverview>) => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error);
          setData(null);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '请求失败');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const refresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  return { data, loading, error, refresh };
}
