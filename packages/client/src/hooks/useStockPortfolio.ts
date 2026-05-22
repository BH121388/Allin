import { useState, useCallback, useEffect } from 'react';
import type { ApiResponse, StockScore, StockSignalResult } from '@allin/shared';

interface StockHolding {
  id: number;
  code: string;
  name: string;
  amount: number;
  costPrice: number;
  shares: number;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  score: StockScore;
  signal: StockSignalResult;
  addedAt: string;
  todayChange?: number;
  todayPnl?: number;
  industry?: string;
  sellSuggestion?: string;
  targetSellPrice?: number;
  stopLoss?: number;
  holdingDays?: number;
}

interface StockPortfolioData {
  holdings: StockHolding[];
  snapshots?: Array<{ date: string; value: number; pnl: number }>;
  summary: {
    totalValue: number;
    totalCost: number;
    totalPnl: number;
    pnlPercent: number;
    count: number;
  };
}

interface UseStockPortfolioReturn {
  holdings: StockHolding[];
  snapshots: Array<{ date: string; value: number; pnl: number }>;
  summary: StockPortfolioData['summary'] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  addStock: (params: { code: string; name: string; amount: number; costPrice: number; shares: number }) => Promise<boolean>;
  removeStock: (code: string) => Promise<boolean>;
}

export function useStockPortfolio(): UseStockPortfolioReturn {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [snapshots, setSnapshots] = useState<Array<{ date: string; value: number; pnl: number }>>([]);
  const [summary, setSummary] = useState<StockPortfolioData['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch('/api/stock-portfolio')
      .then(res => res.json())
      .then((json: ApiResponse<StockPortfolioData>) => {
        if (json.success) {
          setHoldings(json.data.holdings);
          setSnapshots(json.data.snapshots || []);
          setSummary(json.data.summary);
        } else {
          setError(json.error);
        }
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : '请求失败');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const refresh = useCallback(() => fetchData(), [fetchData]);

  const addStock = useCallback(async (params: { code: string; name: string; amount: number; costPrice: number; shares: number }): Promise<boolean> => {
    try {
      const res = await fetch('/api/stock-portfolio/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const json = await res.json() as ApiResponse<{ holding: { id: number } }>;
      if (json.success) {
        refresh();
        return true;
      }
      setError(json.error);
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
      return false;
    }
  }, [refresh]);

  const removeStock = useCallback(async (code: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/stock-portfolio/${code}`, { method: 'DELETE' });
      const json = await res.json() as ApiResponse<{ removed: string }>;
      if (json.success) {
        setHoldings(prev => prev.filter(h => h.code !== code));
        return true;
      }
      setError(json.error);
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      return false;
    }
  }, []);

  return { holdings, snapshots, summary, loading, error, refresh, addStock, removeStock };
}
