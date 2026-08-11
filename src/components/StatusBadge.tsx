import { getStatusBadge, getAlertDot } from '../lib/alertUtils';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const cls = getStatusBadge(status);
  const px = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${px} ${cls}`}>
      {status}
    </span>
  );
}

interface AlertDotProps {
  status: string;
  size?: 'sm' | 'md';
}

export function AlertDot({ status, size = 'sm' }: AlertDotProps) {
  const sz = size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5';
  return (
    <span className={`inline-block rounded-full flex-shrink-0 ${sz} ${getAlertDot(status)}`} />
  );
}
