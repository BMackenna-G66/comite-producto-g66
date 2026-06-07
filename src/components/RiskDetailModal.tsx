import { useState, useEffect } from 'react';
import { Risk, RoamState, RISK_CATEGORIES, COMMITTEE_ROLES, riskLevelFromScore, RISK_LEVEL_LABELS } from '../types';
import { updateRisk } from '../services/firestore';
import { suggestMitigations } from '../services/geminiService';
import RiskBadge from './RiskBadge';

interface Props {
  risk: Risk;
  onClose: () => void;
  onSaved: () => void;
}

const ROAM_COLORS: Record<RoamState, string> = {
  Owned: 'bg-red-100 text-red-700 border-red-300',
  Accepted: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  Mitigated: 'bg-blue-100 text-blue-700 border-blue-300',
  Resolved: 'bg-green-100 text-green-700 border-green-300',
};

const ROAM_DESC: Record<RoamState, string> = {
  Owned: 'Riesgo identificado, sin acción tomada aún',
  Accepted: 'Riesgo aceptado conscientemente, sin mitigación',
  Mitigated: 'Controles implementados, riesgo reducido',
  Resolved: 'Riesgo cerrado, ya no aplica',
};

export default function RiskDetailModal({ risk, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    title: risk.title,
    description: risk.description,
    category: risk.category,
    macroprocess: risk.macroprocess,
    process: risk.process,
    impact: risk.impact,
    probability: risk.probability,
    control: risk.control ?? '',
    controlPeriodicity: risk.controlPeriodicity ?? '',
    controlEvidence: risk.controlEvidence ?? '',
    controlType: risk.controlType ?? '',
    roamStatus: risk.roamStatus,
    owner: risk.owner,
    mitigationPlan: risk.mitigationPlan ?? '',
    isRedFlag: risk.isRedFlag,
    observations: risk.observations ?? '',
  });

  const [newComment, setNewComment] = useState('');
  const [author, setAuthor] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [tab, setTab] = useState<'detail' | 'control' | 'history'>('detail');
  const [saved, setSaved] = useState(false);

  const score = form.impact * form.probability;
  const level = riskLevelFromScore(score);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    await updateRisk(risk.id, {
      ...form,
      impact: form.impact as Risk['impact'],
      probability: form.probability as Risk['probability'],
      inherentRisk: score,
      riskLevel: level,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
    onSaved();
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const entry = { date: new Date().toISOString(), author: author || 'Usuario', comment: newComment };
    const history = [...(risk.reviewHistory ?? []), entry];
    await updateRisk(risk.id, { reviewHistory: history });
    setNewComment('');
    onSaved();
  };

  const handleAISuggest = async () => {
    setAiLoading(true);
    try {
      const suggestion = await suggestMitigations(form.title, form.description, form.category);
      set('mitigationPlan', suggestion);
    } finally {
      setAiLoading(false);
    }
  };

  const reviewHistory = risk.reviewHistory ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <RiskBadge level={level} />
              {form.isRedFlag && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">🚩 Red Flag</span>}
              <span className="text-xs text-gray-400">{form.category || 'Sin categoría'}</span>
            </div>
            <h2 className="font-semibold text-gray-800 text-lg leading-tight">{risk.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">ID: {risk.id.slice(0, 8)}... · Producto: {risk.productId.slice(0, 8)}...</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none shrink-0">×</button>
        </div>

        {/* ROAM status bar */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex gap-2">
          {(['Owned', 'Accepted', 'Mitigated', 'Resolved'] as RoamState[]).map(s => (
            <button key={s} onClick={() => set('roamStatus', s)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${form.roamStatus === s ? ROAM_COLORS[s] + ' border-current' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
              title={ROAM_DESC[s]}>
              {s}
            </button>
          ))}
        </div>
        <p className="px-6 py-1.5 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">{ROAM_DESC[form.roamStatus]}</p>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          {([['detail', 'Detalle'], ['control', 'Control & Mitigación'], ['history', `Historial (${reviewHistory.length})`]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key as typeof tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* DETALLE TAB */}
          {tab === 'detail' && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Título</label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Descripción</label>
                <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Categoría</label>
                  <select value={form.category} onChange={e => set('category', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">Sin categoría</option>
                    {RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Responsable (Comité)</label>
                  <select value={form.owner} onChange={e => set('owner', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">Sin asignar</option>
                    {COMMITTEE_ROLES.map(r => <option key={r.roleLabel} value={r.roleLabel}>{r.shortLabel}</option>)}
                    <option value="Análisis IA">Análisis IA (pendiente asignar)</option>
                  </select>
                </div>
              </div>

              {/* Impact & Probability */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Impacto: <span className="text-gray-800 font-bold">{form.impact}</span>/5</label>
                  <input type="range" min={1} max={5} value={form.impact} onChange={e => set('impact', Number(e.target.value))} className="w-full accent-brand" />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Mínimo</span><span>Severo</span></div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Probabilidad: <span className="text-gray-800 font-bold">{form.probability}</span>/5</label>
                  <input type="range" min={1} max={5} value={form.probability} onChange={e => set('probability', Number(e.target.value))} className="w-full accent-brand" />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Raramente</span><span>Muy alta</span></div>
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-500">Score inherente: </span>
                    <span className="font-bold text-gray-800">{score}</span>
                    <span className="text-xs text-gray-400 ml-1">({form.impact}×{form.probability})</span>
                  </div>
                  <RiskBadge level={level} />
                </div>
              </div>

              {/* Red Flag toggle */}
              <div className="flex items-center justify-between bg-red-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">🚩 Red Flag</p>
                  <p className="text-xs text-gray-500">Bloqueante crítico para la aprobación del producto</p>
                </div>
                <button onClick={() => set('isRedFlag', !form.isRedFlag)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.isRedFlag ? 'bg-red-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isRedFlag ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* Observations */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Observaciones generales</label>
                <textarea rows={3} value={form.observations} onChange={e => set('observations', e.target.value)}
                  placeholder="Agrega contexto adicional, aclaraciones, notas del equipo..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
              </div>
            </>
          )}

          {/* CONTROL TAB */}
          {tab === 'control' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-500">Plan de Mitigación</label>
                  <button onClick={handleAISuggest} disabled={aiLoading}
                    className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 disabled:opacity-50">
                    {aiLoading ? <span className="animate-spin">⟳</span> : '✦'} Sugerir con IA
                  </button>
                </div>
                <textarea rows={4} value={form.mitigationPlan} onChange={e => set('mitigationPlan', e.target.value)}
                  placeholder="Describe las acciones de mitigación, controles a implementar, responsables y plazos..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Control Identificado</label>
                <textarea rows={3} value={form.control} onChange={e => set('control', e.target.value)}
                  placeholder="Describe el control existente o propuesto..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Periodicidad</label>
                  <select value={form.controlPeriodicity} onChange={e => set('controlPeriodicity', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">Seleccionar</option>
                    <option value="Diaria-Semanal">Diaria/Semanal</option>
                    <option value="Mensual">Mensual</option>
                    <option value="Mayor a Mensual">Mayor a Mensual</option>
                    <option value="No Definida">No Definida</option>
                    <option value="Sin Control">Sin Control</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo de Control</label>
                  <select value={form.controlType} onChange={e => set('controlType', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">Seleccionar</option>
                    <option value="Preventivo">Preventivo</option>
                    <option value="Detectivo">Detectivo</option>
                    <option value="Correctivo">Correctivo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Evidencia</label>
                  <select value={form.controlEvidence} onChange={e => set('controlEvidence', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">Seleccionar</option>
                    <option value="Electronica">Electrónica</option>
                    <option value="Papel">Papel</option>
                    <option value="Sin Evidencia">Sin Evidencia</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Macroproceso</label>
                <input value={form.macroprocess} onChange={e => set('macroprocess', e.target.value)}
                  placeholder="Ej: Administración Financiera, Cumplimiento Normativo..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
            </>
          )}

          {/* HISTORY TAB */}
          {tab === 'history' && (
            <>
              {/* Add comment */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-gray-600">Agregar revisión / comentario</p>
                <input value={author} onChange={e => setAuthor(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <textarea rows={2} value={newComment} onChange={e => setNewComment(e.target.value)}
                  placeholder="Escribe tu observación, actualización de estado, o nota de revisión..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
                <button onClick={handleAddComment} disabled={!newComment.trim()}
                  className="bg-brand text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-brand-dark disabled:opacity-40">
                  Agregar Revisión
                </button>
              </div>

              {/* History list */}
              {reviewHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No hay revisiones registradas aún.</div>
              ) : (
                <div className="space-y-3">
                  {[...reviewHistory].reverse().map((entry, i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">{entry.author}</span>
                        <span className="text-xs text-gray-400">{new Date(entry.date).toLocaleString('es-CL')}</span>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{entry.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            Creado: {new Date(risk.createdAt).toLocaleDateString('es-CL')} ·
            Actualizado: {new Date(risk.updatedAt).toLocaleDateString('es-CL')}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cerrar
            </button>
            {tab !== 'history' && (
              <button onClick={handleSave} disabled={saving}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-brand text-white hover:bg-brand-dark'} disabled:opacity-50`}>
                {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
