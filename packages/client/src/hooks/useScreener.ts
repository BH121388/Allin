import { useState, useEffect, useCallback } from 'react';
import type { ApiResponse } from '@allin/shared';

export interface FiveDimScore {
  returnCapability: number;
  riskControl: number;
  riskAdjustedReturn: number;
  managerStability: number;
  marketAdaptability: number;
  total: number;
}

export interface ScreenedFund {
  code: string;
  name: string;
  type: string;
  score: FiveDimScore;
  nav: number;
  navDate: string;
  ret1y: number;
  maxDrawdown: number;
  sharpe: number;
  calmar: number;
  annualVolatility: number;
  managerYears: number;
}

export interface ScreenerResult {
  period: string;
  funds: ScreenedFund[];
  totalScanned: number;
  coarsePassed: number;
  generatedAt: string;
}

export function useScreener() {
  const [data, setData] = useState<ScreenerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('1y');

  const fetchData = useCallback(async (p?: string) => {
    const selectedPeriod = p || period;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/screener?period=${encodeURIComponent(selectedPeriod)}`);
      const json: ApiResponse<ScreenerResult> = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || '请求失败');
      }
    } catch {
      setError('网络请求失败');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    fetchData(period);
  }, [fetchData, period]);

  const changePeriod = useCallback((p: string) => {
    setPeriod(p);
    fetchData(p);
  }, [fetchData]);

  return { data, loading, error, period, refresh, changePeriod };
}
