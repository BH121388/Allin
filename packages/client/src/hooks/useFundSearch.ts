import { useState, useCallback } from 'react';
import type { FundAnalysis, ApiResponse } from '@allin/shared';

interface UseFundSearchReturn {
  fund: FundAnalysis | null;
  loading: boolean;
  error: string | null;
  search: (code: string) => void;
  clear: () => void;
}

export function useFundSearch(): UseFundSearchReturn {
  const [fund, setFund] = useState<FundAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback((code: string) => {
    if (!code || code.length !== 6) {
      setError('请输入6位基金代码');
      return;
    }

    setLoading(true);
    setError(null);
    setFund(null);

    fetch(`/api/funds/search?code=${encodeURIComponent(code)}`)
      .then((res) => res.json())
      .then((json: ApiResponse<FundAnalysis>) => {
        if (json.success) {
          setFund(json.data);
        } else {
          setError(json.error);
          setFund(null);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '查询失败');
        setFund(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const clear = useCallback(() => {
    setFund(null);
    setError(null);
    setLoading(false);
  }, []);

  return { fund, loading, error, search, clear };
}
