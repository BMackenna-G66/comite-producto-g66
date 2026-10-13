import { useState } from 'react';
import {
  SarlaftProductCause, SarlaftProductControl, SarlaftProductRisk, SfcScore,
} from '../../sarlaft/types';
import {
  CONTROL_TYPES, FORMALITIES, IMPACT_CRITERIA, NATURES, PERIODICITIES, PROBABILITY_CRITERIA, RESPONSIBILITIES,
  SEVERITY_COLORS, SFC_SCORE_LABELS, controlQuality, controlRating, reductionFactors, valueProductRisk,
} from '../../sarlaft/methodology';
import { createSarlaftRisk, deleteSarlaftRisk, updateSarlaftRisk } from '../../services/firestore';
import { useAuth } from '../../hooks/useAuth';
import { Risk } from '../../types';

export type SarlaftDraft = Omit<SarlaftProductRisk, 'id'> & { id?: string };

interface Props {
  risk: SarlaftDraft;
  operationalRisks: Risk[];
  onClose: () => void;
  onSaved: (risk: SarlaftProductRisk) => void;
  onDeleted: (id: string) => void;
}

const input = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand bg-white';
const label = 'text-[11px] font-medium text-gray-500 mb-0.5 block';

const newControl = (): SarlaftProductControl => ({
  code: '', name: '', description: '', tipo: 'ESPECÍFICO', naturaleza: 'COMBINADO', periodicidad: 'ADECUADO',
  responsabilidad: 'No Asignado', formalidad: 'No esta documentado', status: 'propuesto',
  sfc: { alertamiento: '', analisis: '', reporte: '', tomaDecisiones: '' }, sfcScore: 1,
});

const newCause = (): SarlaftProductCause => ({
  code: '', text: '', factor: '', sfc: { sujeto: '', accion: '', objeto: '', contexto: '' },
  sfcScore: 1, sfcObservation: '', controls: [],
});

function ScoreSelect({ value, onChange, max = 3 }: { value: SfcScore; onChange: (v: SfcScore) => void; max?: number }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value) as SfcScore)} className={input}>
      {([1, 2, 3] as SfcScore[]).map(s => (
        <option key={s} value={s} disabled={s > max}>{s} · {SFC_SCORE_LABELS[s]}</option>
      ))}
    </select>
  );
}

export default function SarlaftRiskEditor({ risk, operationalRisks, onClose, onSaved, onDeleted }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<SarlaftDraft>(risk);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const v = valueProductRisk({ ...form, id: form.id ?? '' });

  const set = <K extends keyof SarlaftDraft>(k: K, value: SarlaftDraft[K]) => setForm(f => ({ ...f, [k]: value }));
  const setCause = (ci: number, patch: Partial<SarlaftProductCause>) =>
    setForm(f => ({ ...f, causes: f.causes.map((c, i) => (i === ci ? { ...c, ...patch } : c)) }));
  const setControl = (ci: number, ki: number, patch: Partial<SarlaftProductControl>) =>
    setForm(f => ({
      ...f,
      causes: f.causes.map((c, i) => (i !== ci ? c : { ...c, controls: c.controls.map((k, j) => (j === ki ? { ...k, ...patch } : k)) })),
    }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      // El control nunca califica por encima de su causa (guía SFC).
      const causes = form.causes.map(c => ({
        ...c, controls: c.controls.map(k => ({ ...k, sfcScore: Math.min(k.sfcScore, c.sfcScore) as SfcScore })),
      }));
      const { id, ...data } = { ...form, causes, origin: 'manual' as const, updatedByName: user?.name ?? 'Usuario', updatedAt: new Date().toISOString() };
      if (id) {
        await updateSarlaftRisk(id, data);
        onSaved({ ...data, id });
      } else {
        const newId = await createSarlaftRisk(data);
        onSaved({ ...data, id: newId });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form.id || !confirm('¿Eliminar este riesgo SARLAFT del producto?')) return;
    await deleteSarlaftRisk(form.id);
    onDeleted(form.id);
  };

  const related = operationalRisks.filter(r => form.relatedOperationalRiskIds.includes(r.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{form.matrixRiskCode || 'Riesgo nuevo'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[v.inherentSeverity]}`}>Inherente {v.inherentScore} · {v.inherentSeverity}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[v.residualSeverity]}`}>Residual {v.residualScore} · {v.residualSeverity}</span>
              <span className="text-xs text-gray-400">{form.origin === 'ia' ? '✦ Generado por IA' : `✎ Editado por ${form.updatedByName}`}</span>
            </div>
            <p className="text-sm font-semibold text-gray-800 mt-1">{form.sourceCrime || 'Sin delito fuente'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Identificación */}
          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Delito fuente</label>
              <input value={form.sourceCrime} onChange={e => set('sourceCrime', e.target.value)} className={input} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Exposición del producto</label>
                <select value={form.applicability} onChange={e => set('applicability', e.target.value as 'directo' | 'indirecto')} className={input}>
                  <option value="directo">Directa</option>
                  <option value="indirecto">Indirecta</option>
                </select>
              </div>
              <div>
                <label className={label}>Calificación SFC del riesgo</label>
                <ScoreSelect value={form.sfcRiskScore} onChange={s => set('sfcRiskScore', s)} />
              </div>
            </div>
            <div className="col-span-2">
              <label className={label}>Descripción del riesgo</label>
              <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} className={input} />
            </div>
            <div className="col-span-2">
              <label className={label}>Justificación (por qué aplica al producto)</label>
              <textarea rows={2} value={form.justification} onChange={e => set('justification', e.target.value)} className={input} />
            </div>
            {related.length > 0 && (
              <div className="col-span-2 text-xs text-gray-500">
                Riesgos operacionales relacionados: {related.map(r => <span key={r.id} className="inline-block bg-gray-100 rounded px-1.5 py-0.5 mr-1 mb-1">{r.title}</span>)}
              </div>
            )}
          </section>

          {/* Valoración inherente */}
          <section className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Valoración inherente</h4>
            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className={label}>Probabilidad</label>
                <select value={form.probability} onChange={e => set('probability', Number(e.target.value))} className={input}>
                  {PROBABILITY_CRITERIA.map(c => <option key={c.level} value={c.level} title={c.criterion}>{c.level} · {c.label}</option>)}
                </select>
              </div>
              {([
                ['impactLegal', 'Legal (60%)', 'legal'],
                ['impactFinancial', 'Financiero (20%)', 'financial'],
                ['impactContagion', 'Contagio (15%)', 'contagion'],
                ['impactReputational', 'Reputacional (15%)', 'reputational'],
              ] as const).map(([key, text, crit]) => (
                <div key={key}>
                  <label className={label}>{text}</label>
                  <select value={form[key]} onChange={e => set(key, Number(e.target.value))} className={input}>
                    {IMPACT_CRITERIA.map(c => <option key={c.level} value={c.level} title={c[crit]}>{c.level} · {c[crit].slice(0, 28)}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Impacto total {v.impact} (ponderado) × probabilidad {form.probability} = <strong>{v.inherentScore}</strong> · {v.inherentSeverity} · {v.inherentAcceptability}
            </p>
          </section>

          {/* Causas y controles */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Causas y controles ({form.causes.length})</h4>
              <button onClick={() => set('causes', [...form.causes, newCause()])} className="text-xs text-brand hover:underline">+ Agregar causa</button>
            </div>
            {form.causes.map((c, ci) => (
              <div key={ci} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${c.code ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-800'}`}>{c.code || 'Causa nueva'}</span>
                  <span className="text-xs text-gray-400">{c.factor}</span>
                  <button onClick={() => set('causes', form.causes.filter((_, i) => i !== ci))} className="ml-auto text-xs text-red-400 hover:text-red-600">Quitar causa</button>
                </div>
                <textarea rows={3} value={c.text} onChange={e => setCause(ci, { text: e.target.value })} placeholder="Escenario: sujeto + acción + objeto + contexto" className={input} />
                <div className="grid grid-cols-4 gap-2">
                  {(['sujeto', 'accion', 'objeto', 'contexto'] as const).map(k => (
                    <div key={k}>
                      <label className={label}>{k === 'accion' ? 'Acción' : k[0].toUpperCase() + k.slice(1)}</label>
                      <input value={c.sfc[k]} onChange={e => setCause(ci, { sfc: { ...c.sfc, [k]: e.target.value } })}
                        className={`${input} ${c.sfc[k] ? '' : 'border-red-200'}`} placeholder="No explícito" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className={label}>Calificación SFC causa</label>
                    <ScoreSelect value={c.sfcScore} onChange={s => setCause(ci, { sfcScore: s })} />
                  </div>
                  <div className="col-span-3">
                    <label className={label}>Observación de la evaluación</label>
                    <input value={c.sfcObservation} onChange={e => setCause(ci, { sfcObservation: e.target.value })} className={input} />
                  </div>
                </div>

                <div className="pl-3 border-l-2 border-purple-100 space-y-2">
                  {c.controls.map((k, ki) => {
                    const quality = controlQuality(k);
                    const red = reductionFactors(k);
                    return (
                      <div key={ki} className="bg-purple-50/40 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${k.code ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-800'}`}>{k.code || 'Control nuevo'}</span>
                          <select value={k.status} onChange={e => setControl(ci, ki, { status: e.target.value as 'existente' | 'propuesto' })} className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                            <option value="existente">Existente (reduce residual)</option>
                            <option value="propuesto">Propuesto (no reduce)</option>
                          </select>
                          <span className="text-xs text-gray-500">Calidad {quality} · {controlRating(quality)} · reduce P {red.probability} / I {red.impact}</span>
                          <button onClick={() => setCause(ci, { controls: c.controls.filter((_, j) => j !== ki) })} className="ml-auto text-xs text-red-400 hover:text-red-600">Quitar</button>
                        </div>
                        <input value={k.name} onChange={e => setControl(ci, ki, { name: e.target.value })} placeholder="Nombre del control" className={input} />
                        <textarea rows={2} value={k.description} onChange={e => setControl(ci, ki, { description: e.target.value })} placeholder="Descripción" className={input} />
                        <div className="grid grid-cols-5 gap-2">
                          <div><label className={label}>Tipo (40)</label>
                            <select value={k.tipo} onChange={e => setControl(ci, ki, { tipo: e.target.value as SarlaftProductControl['tipo'] })} className={input}>{CONTROL_TYPES.map(o => <option key={o}>{o}</option>)}</select></div>
                          <div><label className={label}>Naturaleza (20)</label>
                            <select value={k.naturaleza} onChange={e => setControl(ci, ki, { naturaleza: e.target.value as SarlaftProductControl['naturaleza'] })} className={input}>{NATURES.map(o => <option key={o}>{o}</option>)}</select></div>
                          <div><label className={label}>Periodicidad (10)</label>
                            <select value={k.periodicidad} onChange={e => setControl(ci, ki, { periodicidad: e.target.value as SarlaftProductControl['periodicidad'] })} className={input}>{PERIODICITIES.map(o => <option key={o}>{o}</option>)}</select></div>
                          <div><label className={label}>Responsabilidad (20)</label>
                            <select value={k.responsabilidad} onChange={e => setControl(ci, ki, { responsabilidad: e.target.value as SarlaftProductControl['responsabilidad'] })} className={input}>{RESPONSIBILITIES.map(o => <option key={o}>{o}</option>)}</select></div>
                          <div><label className={label}>Formalidad (10)</label>
                            <select value={k.formalidad} onChange={e => setControl(ci, ki, { formalidad: e.target.value as SarlaftProductControl['formalidad'] })} className={input}>{FORMALITIES.map(o => <option key={o}>{o}</option>)}</select></div>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {(['alertamiento', 'analisis', 'reporte', 'tomaDecisiones'] as const).map(comp => (
                            <div key={comp}>
                              <label className={label}>{{ alertamiento: 'Alertamiento', analisis: 'Análisis', reporte: 'Reporte', tomaDecisiones: 'Toma de decisiones' }[comp]}</label>
                              <input value={k.sfc[comp]} onChange={e => setControl(ci, ki, { sfc: { ...k.sfc, [comp]: e.target.value } })}
                                className={`${input} ${k.sfc[comp] ? '' : 'border-red-200'}`} placeholder="No explícito" />
                            </div>
                          ))}
                          <div><label className={label}>Calificación SFC</label>
                            <ScoreSelect value={Math.min(k.sfcScore, c.sfcScore) as SfcScore} max={c.sfcScore} onChange={s => setControl(ci, ki, { sfcScore: s })} /></div>
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => setCause(ci, { controls: [...c.controls, newControl()] })} className="text-xs text-purple-600 hover:underline">+ Agregar control</button>
                </div>
              </div>
            ))}
          </section>

          {/* Residual */}
          <section className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 space-y-1">
            <h4 className="font-semibold uppercase tracking-wide">Valoración residual</h4>
            {v.activeControlRows === 0 ? (
              <p>Sin controles existentes: el residual es igual al inherente.</p>
            ) : (
              <p>
                Probabilidad {form.probability} → {v.residualProbability.toFixed(2)} · Impacto {v.impact} → {v.residualImpact.toFixed(2)} ·
                Score residual <strong>{v.residualScore}</strong> · {v.residualSeverity} · {v.residualAcceptability} ({v.activeControlRows} pares causa→control existentes)
              </p>
            )}
          </section>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <div>
            {form.id && <button onClick={handleDelete} className="text-xs text-red-500 hover:text-red-700">Eliminar riesgo</button>}
            {error && <span className="text-xs text-red-600 ml-3">{error}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cerrar</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
