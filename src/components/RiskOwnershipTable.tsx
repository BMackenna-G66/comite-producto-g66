import { Risk, COMMITTEE_ROLES, RISK_LEVEL_LABELS, assignRiskOwner } from '../types';
import { updateRisk } from '../services/firestore';
import { useState } from 'react';
import RiskBadge from './RiskBadge';

interface Props {
  risks: Risk[];
  onRefresh: () => void;
  readOnly?: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  'General Counsel':                  'bg-purple-100 text-purple-700 border-purple-200',
  'Legal Lead':                       'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Oficial de Cumplimiento Colombia': 'bg-blue-100 text-blue-700 border-blue-200',
  'Oficial de Cumplimiento Argentina':'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Data Compliance Specialist':       'bg-teal-100 text-teal-700 border-teal-200',
  'Head Fraude':                      'bg-orange-100 text-orange-700 border-orange-200',
  'Head Ciberseguridad':              'bg-red-100 text-red-700 border-red-200',
  'Gerente de Riesgos':               'bg-gray-100 text-gray-700 border-gray-200',
};

export default function RiskOwnershipTable({ risks, onRefresh, readOnly = false }: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [view, setView] = useState<'by-risk' | 'by-member'>('by-risk');

  const handleAssignOwner = async (riskId: string, owner: string) => {
    setSaving(riskId);
    await updateRisk(riskId, { owner });
    onRefresh();
    setSaving(null);
  };

  const handleAutoAssign = async () => {
    setSaving('all');
    for (const risk of risks) {
      if (!risk.owner || risk.owner === '' || risk.owner === 'Análisis IA' || risk.owner === 'Sin asignar') {
        const suggested = assignRiskOwner(risk.category);
        if (suggested) await updateRisk(risk.id, { owner: suggested.roleLabel });
      }
    }
    onRefresh();
    setSaving(null);
  };

  // Group risks by owner
  const byMember = COMMITTEE_ROLES.map(role => ({
    role,
    risks: risks.filter(r => r.owner === role.roleLabel),
    unassigned: risks.filter(r => !r.owner || r.owner === '' || r.owner === 'Sin asignar' || r.owner === 'Análisis IA'),
  }));

  const unassigned = risks.filter(r => !r.owner || r.owner === '' || r.owner === 'Sin asignar' || r.owner === 'Análisis IA');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          <button onClick={() => setView('by-risk')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${view === 'by-risk' ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:border-brand'}`}>
            Por Riesgo
          </button>
          <button onClick={() => setView('by-member')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${view === 'by-member' ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:border-brand'}`}>
            Por Miembro ({COMMITTEE_ROLES.length})
          </button>
        </div>
        {!readOnly && unassigned.length > 0 && (
          <button
            onClick={handleAutoAssign}
            disabled={saving === 'all'}
            className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving === 'all' ? <span className="animate-spin">⟳</span> : '✦'}
            Auto-asignar {unassigned.length} sin responsable
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Miembros del Comité — Estatuto Global81 SpA</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {COMMITTEE_ROLES.map(role => (
            <div key={role.roleLabel} className={`rounded-lg border px-3 py-2 ${ROLE_COLORS[role.roleLabel] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold leading-tight">{role.shortLabel}</span>
                <span className="text-xs opacity-70 shrink-0">{risks.filter(r => r.owner === role.roleLabel).length} riesgos</span>
              </div>
              <p className="text-xs opacity-60 mt-0.5 leading-tight">{role.rolInComite}</p>
            </div>
          ))}
        </div>
      </div>

      {/* BY RISK VIEW */}
      {view === 'by-risk' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Riesgo</th>
                <th className="text-left px-4 py-3">Categoría</th>
                <th className="text-center px-4 py-3">Nivel</th>
                <th className="text-left px-4 py-3">Responsable del Comité</th>
                <th className="text-center px-4 py-3">ROAM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {risks.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No hay riesgos registrados.</td></tr>
              )}
              {risks.map(risk => {
                const suggested = assignRiskOwner(risk.category);
                const currentRole = COMMITTEE_ROLES.find(r => r.roleLabel === risk.owner);
                const isUnassigned = !risk.owner || risk.owner === '' || risk.owner === 'Sin asignar' || risk.owner === 'Análisis IA';
                return (
                  <tr key={risk.id} className={`hover:bg-gray-50 ${risk.isRedFlag ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-start gap-2">
                        {risk.isRedFlag && <span className="text-red-500 shrink-0 mt-0.5 text-xs">🚩</span>}
                        <div>
                          <p className="font-medium text-gray-800 text-sm leading-tight">{risk.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{risk.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{risk.category || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <RiskBadge level={risk.riskLevel} />
                    </td>
                    <td className="px-4 py-3">
                      {readOnly ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${currentRole ? ROLE_COLORS[currentRole.roleLabel] ?? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-yellow-50 text-yellow-600 border-yellow-200'}`}>
                          {risk.owner || 'Sin asignar'}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={risk.owner || ''}
                            onChange={e => handleAssignOwner(risk.id, e.target.value)}
                            disabled={saving === risk.id}
                            className={`text-xs border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand min-w-0 ${isUnassigned ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'}`}
                          >
                            <option value="">Sin asignar</option>
                            {COMMITTEE_ROLES.map(r => (
                              <option key={r.roleLabel} value={r.roleLabel}>{r.shortLabel}</option>
                            ))}
                          </select>
                          {isUnassigned && suggested && (
                            <button
                              onClick={() => handleAssignOwner(risk.id, suggested.roleLabel)}
                              disabled={saving === risk.id}
                              className="text-xs text-purple-600 hover:text-purple-800 whitespace-nowrap flex items-center gap-1 disabled:opacity-50"
                              title={`Sugerido: ${suggested.roleLabel}`}
                            >
                              {saving === risk.id ? <span className="animate-spin">⟳</span> : '✦'}
                              {suggested.shortLabel}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${risk.roamStatus === 'Resolved' ? 'bg-green-100 text-green-700' : risk.roamStatus === 'Mitigated' ? 'bg-blue-100 text-blue-700' : risk.roamStatus === 'Accepted' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                        {risk.roamStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* BY MEMBER VIEW */}
      {view === 'by-member' && (
        <div className="space-y-3">
          {COMMITTEE_ROLES.map(role => {
            const memberRisks = risks.filter(r => r.owner === role.roleLabel);
            const highCount = memberRisks.filter(r => r.riskLevel === 'muy_alto' || r.riskLevel === 'alto').length;
            return (
              <div key={role.roleLabel} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={`px-4 py-3 border-b flex items-center justify-between gap-3 ${ROLE_COLORS[role.roleLabel] ?? 'bg-gray-50 border-gray-100'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{role.roleLabel}</span>
                      <span className="text-xs opacity-70 border border-current/30 rounded-full px-1.5 py-0.5">{role.rolInComite}</span>
                    </div>
                    <p className="text-xs opacity-60 mt-0.5">{role.expertise}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {highCount > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{highCount} alto/muy alto</span>
                    )}
                    <span className="text-sm font-bold">{memberRisks.length} riesgo{memberRisks.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                {memberRisks.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-400 italic">Sin riesgos asignados</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {memberRisks.map(r => (
                      <div key={r.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 ${r.isRedFlag ? 'bg-red-50/50' : ''}`}>
                        <div className="flex items-start gap-2 min-w-0">
                          {r.isRedFlag && <span className="text-red-400 text-xs shrink-0 mt-0.5">🚩</span>}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 leading-tight">{r.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{r.category}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <RiskBadge level={r.riskLevel} />
                          <span className={`text-xs px-1.5 py-0.5 rounded ${r.roamStatus === 'Resolved' ? 'bg-green-100 text-green-600' : r.roamStatus === 'Mitigated' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                            {r.roamStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {unassigned.length > 0 && (
            <div className="bg-yellow-50 rounded-xl border border-yellow-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-yellow-200 flex items-center justify-between">
                <span className="font-semibold text-sm text-yellow-800">⚠ Sin responsable asignado</span>
                <span className="text-sm font-bold text-yellow-700">{unassigned.length} riesgo{unassigned.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-yellow-100">
                {unassigned.map(r => (
                  <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-700">{r.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <RiskBadge level={r.riskLevel} />
                      {!readOnly && (
                        <select
                          value=""
                          onChange={e => handleAssignOwner(r.id, e.target.value)}
                          className="text-xs border border-yellow-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                        >
                          <option value="">Asignar →</option>
                          {COMMITTEE_ROLES.map(role => (
                            <option key={role.roleLabel} value={role.roleLabel}>{role.shortLabel}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
