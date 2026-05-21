import { useState, useCallback } from 'react';
import type { StockAnalysis, ApiResponse } from '@allin/shared';

interface UseStockSearchReturn {
  stock: StockAnalysis | null;
  loading: boolean;
  error: string | null;
  search: (code: string) => void;
  clear: () => void;
}

export function useStockSearch(): UseStockSearchReturn {
  const [stock, setStock] = useState<StockAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback((code: string) => {
    if (!code || code.length !== 6) {
      setError('请输入6位股票代码');
      return;
    }

    setLoading(true);
    setError(null);
    setStock(null);

    fetch(`/api/stocks/search?code=${encodeURIComponent(code)}`)
      .then((res) => res.json())
      .then((json: ApiResponse<StockAnalysis>) => {
        if (json.success) {
          setStock(json.data);
        } else {
          setError(json.error);
          setStock(null);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '查询失败');
        setStock(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const clear = useCallback(() => {
    setStock(null);
    setError(null);
    setLoading(false);
  }, []);

  return { stock, loading, error, search, clear };
}
