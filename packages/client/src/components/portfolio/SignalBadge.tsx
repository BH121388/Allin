import { TrendingUp, Minus, TrendingDown, AlertTriangle } from 'lucide-react';
import type { SignalResult } from '@allin/shared';
import { cn } from '@/lib/utils';

interface SignalBadgeProps {
  signal: SignalResult;
}

const SIGNAL_CONFIG = {
  buy: {
    label: '买入',
    icon: TrendingUp,
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
  },
  hold: {
    label: '持有',
    icon: Minus,
    bg: 'bg-blue-100',
    text: 'text-blue-700',
  },
  reduce: {
    label: '减持',
    icon: TrendingDown,
    bg: 'bg-amber-100',
    text: 'text-amber-700',
  },
  sell: {
    label: '清仓',
    icon: AlertTriangle,
    bg: 'bg-red-100',
    text: 'text-red-700',
  },
} as const;

export default function SignalBadge({ signal }: SignalBadgeProps) {
  const config = SIGNAL_CONFIG[signal.signal];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.bg,
        config.text,
      )}
      title={signal.reason}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}
