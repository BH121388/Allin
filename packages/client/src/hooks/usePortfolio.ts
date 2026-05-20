import { useState, useCallback, useEffect } from 'react';
import type { FundScore, SignalResult, ApiResponse } from '@allin/shared';

export interface PortfolioHolding {
  id: number;
  code: string;
  name: string;
  amount: number;
  costNav: number;
  shares: number;
  currentNav: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  score: FundScore;
  signal: SignalResult;
  addedAt: string;
  todayChange?: number;
  todayPnl?: number;
  lastNAV?: number;
  navDate?: string;
  sellSuggestion?: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  pnlPercent: number;
}

interface PortfolioData {
  holdings: PortfolioHolding[];
  summary: PortfolioSummary;
}

interface AddFundParams {
  code: string;
  name: string;
  amount: number;
  costNav: number;
}

interface UsePortfolioReturn {
  holdings: PortfolioHolding[];
  summary: PortfolioSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  addFund: (params: AddFundParams) => Promise<void>;
  removeFund: (code: string) => Promise<void>;
}

export function usePortfolio(): UsePortfolioReturn {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch('/api/portfolio')
      .then((res) => res.json())
      .then((json: ApiResponse<PortfolioData>) => {
        if (json.success) {
          setHoldings(json.data.holdings);
          setSummary(json.data.summary);
        } else {
          setError(json.error);
          setHoldings([]);
          setSummary(null);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '请求失败');
        setHoldings([]);
        setSummary(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const refresh = useCallback(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const addFund = useCallback(async (params: AddFundParams) => {
    const res = await fetch('/api/portfolio/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const json: ApiResponse<unknown> = await res.json();

    if (!json.success) {
      throw new Error(json.error || '添加失败');
    }

    // Refresh portfolio after adding
    fetchPortfolio();
  }, [fetchPortfolio]);

  const removeFund = useCallback(async (code: string) => {
    const res = await fetch(`/api/portfolio/${code}`, {
      method: 'DELETE',
    });

    const json: ApiResponse<unknown> = await res.json();

    if (!json.success) {
      throw new Error(json.error || '删除失败');
    }

    // Refresh portfolio after removing
    fetchPortfolio();
  }, [fetchPortfolio]);

  return {
    holdings,
    summary,
    loading,
    error,
    refresh,
    addFund,
    removeFund,
  };
}
