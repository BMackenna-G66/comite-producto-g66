import { GateStatus, STATUS_LABELS } from '../types';

const COLORS: Record<GateStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  blocked: 'bg-red-200 text-red-800 font-semibold',
};

export default function GateStatusBadge({ status }: { status: GateStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
