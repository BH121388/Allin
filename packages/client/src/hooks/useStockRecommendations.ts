import { useState, useCallback, useEffect } from 'react';
import type { StockAnalysis, ApiResponse } from '@allin/shared';

interface StockRecommendationsData {
  recommendations: StockAnalysis[];
  generatedAt: string;
  source: string;
}

interface UseStockRecommendationsReturn {
  recommendations: StockAnalysis[];
  generatedAt: string | null;
  source: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useStockRecommendations(): UseStockRecommendationsReturn {
  const [recommendations, setRecommendations] = useState<StockAnalysis[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback((forceRefresh: boolean) => {
    setLoading(true);
    setError(null);

    const url = forceRefresh
      ? '/api/stocks/recommend?refresh=true'
      : '/api/stocks/recommend';

    fetch(url)
      .then((res) => res.json())
      .then((json: ApiResponse<StockRecommendationsData>) => {
        if (json.success) {
          setRecommendations(json.data.recommendations);
          setGeneratedAt(json.data.generatedAt);
          setSource(json.data.source);
        } else {
          setError(json.error);
          setRecommendations([]);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '请求失败');
        setRecommendations([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const refresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  return { recommendations, generatedAt, source, loading, error, refresh };
}
