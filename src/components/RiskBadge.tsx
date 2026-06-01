import { RiskLevel, RISK_LEVEL_LABELS } from '../types';

const COLORS: Record<RiskLevel, string> = {
  muy_alto: 'bg-red-100 text-red-800',
  alto: 'bg-orange-100 text-orange-700',
  moderado: 'bg-yellow-100 text-yellow-700',
  bajo: 'bg-blue-100 text-blue-700',
  muy_bajo: 'bg-green-100 text-green-700',
};

export default function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${COLORS[level]}`}>
      {RISK_LEVEL_LABELS[level]}
    </span>
  );
}
