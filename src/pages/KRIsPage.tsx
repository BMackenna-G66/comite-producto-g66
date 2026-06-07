import { useEffect, useState } from 'react';
import { getKRIs, createKRI, updateKRI, deleteKRI } from '../services/firestore';
import { KRI, CorporateRiskCategory, CORPORATE_RISK_CATEGORY_LABELS, getKRIStatus } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

const STATUS_COLOR = { green: 'bg-green-100 text-green-700 border-green-300', yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300', red: 'bg-red-100 text-red-800 border-red-300' };
const STATUS_LABEL = { green: '✓ Normal', yellow: '⚠ Alerta', red: '🔴 Crítico' };
const TREND_ICON = { up: '↑', down: '↓', stable: '→' };
const TREND_COLOR = { up: 'text-red-500', down: 'text-green-500', stable: 'text-gray-400' };
const FREQ_LABELS = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral' };

const DEFAULT_KRIS: Omit<KRI, 'id'>[] = [
  { name: 'Alertas AML Pendientes', category: 'AML_COMPLIANCE', description: 'Número de alertas AML sin resolver', currentValue: 0, warningThreshold: 10, criticalThreshold: 25, unit: 'alertas', measurementFrequency: 'daily', owner: 'Oficial de Cumplimiento Colombia', source: 'Sistema AML', status: 'green', trend: 'stable', lastUpdated: new Date().toISOString(), historicalValues: [] },
  { name: 'Chargeback Rate', category: 'FRAUD', description: '% de transacciones que resultaron en chargeback', currentValue: 0, warningThreshold: 0.5, criticalThreshold: 1.0, unit: '%', measurementFrequency: 'monthly', owner: 'Head Fraude', source: 'Sistema de Pagos', status: 'green', trend: 'stable', lastUpdated: new Date().toISOString(), historicalValues: [] },
  { name: 'Vulnerabilidades Críticas Abiertas', category: 'CYBERSECURITY', description: 'Vulnerabilidades críticas sin remediar', currentValue: 0, warningThreshold: 3, criticalThreshold: 8, unit: 'vulns', measurementFrequency: 'weekly', owner: 'Head Ciberseguridad', source: 'Scanner de Seguridad', status: 'green', trend: 'stable', lastUpdated: new Date().toISOString(), historicalValues: [] },
  { name: 'SLA Breach Rate', category: 'OPERATIONAL', description: '% de casos que superaron el SLA acordado', currentValue: 0, warningThreshold: 5, criticalThreshold: 15, unit: '%', measurementFrequency: 'weekly', owner: 'Gerente de Riesgos', source: 'Sistema de Tickets', status: 'green', trend: 'stable', lastUpdated: new Date().toISOString(), historicalValues: [] },
  { name: 'RFIs Abiertos', category: 'AML_COMPLIANCE', description: 'Solicitudes de información regulatoria pendientes', currentValue: 0, warningThreshold: 5, criticalThreshold: 10, unit: 'RFIs', measurementFrequency: 'weekly', owner: 'Legal Lead', source: 'Registro Legal', status: 'green', trend: 'stable', lastUpdated: new Date().toISOString(), historicalValues: [] },
];

export default function KRIsPage() {
  const [kris, setKRIs] = useState<KRI[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<Record<string, string>>({});

  const [form, setForm] = useState<Partial<Omit<KRI, 'id'>>>({
    name: '', category: 'OPERATIONAL', description: '', currentValue: 0,
    warningThreshold: 0, criticalThreshold: 0, unit: '', measurementFrequency: 'monthly',
    owner: '', source: '', status: 'green', trend: 'stable', lastUpdated: new Date().toISOString(), historicalValues: [],
  });

  const reload = () => getKRIs().then(kris => {
    // compute status from thresholds
    setKRIs(kris.map(k => ({ ...k, status: getKRIStatus(k) })));
  }).finally(() => setLoading(false));

  useEffect(() => { reload(); }, []);

  const handleSeedDefaults = async () => {
    setSaving(true);
    for (const k of DEFAULT_KRIS) await createKRI(k);
    await reload(); setSaving(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const data = { ...form, status: getKRIStatus(form as KRI), lastUpdated: new Date().toISOString() } as Omit<KRI, 'id'>;
    if (editingId) await updateKRI(editingId, data); else await createKRI(data);
    setShowForm(false); setEditingId(null); await reload(); setSaving(false);
  };

  const handleUpdateValue = async (id: string) => {
    const val = parseFloat(newValue[id] ?? '');
    if (isNaN(val)) return;
    setUpdating(id);
    const kri = kris.find(k => k.id === id);
    if (kri) {
      const historical = [...(kri.historicalValues || []), { date: new Date().toISOString(), value: kri.currentValue }].slice(-12);
      await updateKRI(id, { currentValue: val, historicalValues: historical, lastUpdated: new Date().toISOString() });
    }
    setNewValue(prev => { const n = { ...prev }; delete n[id]; return n; });
    setUpdating(null); await reload();
  };

  const stats = { green: kris.filter(k => k.status === 'green').length, yellow: kris.filter(k => k.status === 'yellow').length, red: kris.filter(k => k.status === 'red').length };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Key Risk Indicators (KRI)</h1>
          <p className="text-gray-500 text-sm mt-1">Monitoreo permanente de exposición al riesgo</p>
        </div>
        <div className="flex gap-2">
          {kris.length === 0 && (
            <button onClick={handleSeedDefaults} disabled={saving} className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
              + Cargar KRIs base
            </button>
          )}
          <button onClick={() => { setShowForm(true); setEditingId(null); }} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark">
            + Nuevo KRI
          </button>
        </div>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-4">
        {(['green', 'yellow', 'red'] as const).map(s => (
          <div key={s} className={`rounded-xl border-2 p-4 text-center ${STATUS_COLOR[s]}`}>
            <div className="text-3xl font-bold">{stats[s]}</div>
            <div className="text-sm font-medium mt-1">{STATUS_LABEL[s]}</div>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border-2 border-brand shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-gray-700">{editingId ? 'Editar' : 'Nuevo'} KRI</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Nombre *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Categoría</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as CorporateRiskCategory }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {(Object.keys(CORPORATE_RISK_CATEGORY_LABELS) as CorporateRiskCategory[]).map(c => <option key={c} value={c}>{CORPORATE_RISK_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Unidad (%, alertas, días...)</label>
              <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Umbral Alerta (⚠)</label>
              <input type="number" step="0.01" value={form.warningThreshold} onChange={e => setForm(f => ({ ...f, warningThreshold: parseFloat(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Umbral Crítico (🔴)</label>
              <input type="number" step="0.01" value={form.criticalThreshold} onChange={e => setForm(f => ({ ...f, criticalThreshold: parseFloat(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Owner</label>
              <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Frecuencia</label>
              <select value={form.measurementFrequency} onChange={e => setForm(f => ({ ...f, measurementFrequency: e.target.value as KRI['measurementFrequency'] }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {(Object.keys(FREQ_LABELS) as KRI['measurementFrequency'][]).map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
            <button type="submit" disabled={saving} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Guardar</button>
          </div>
        </form>
      )}

      {/* KRI cards */}
      {kris.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center space-y-3">
          <div className="text-5xl">📊</div>
          <p className="text-gray-600 font-medium">No hay KRIs configurados</p>
          <p className="text-gray-400 text-sm">Carga los KRIs base o crea uno manualmente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {kris.map(k => {
            const status = getKRIStatus(k);
            const pct = Math.min(100, (k.currentValue / k.criticalThreshold) * 100);
            return (
              <div key={k.id} className={`bg-white rounded-xl border-l-4 shadow-sm p-5 space-y-3 ${status === 'red' ? 'border-red-500' : status === 'yellow' ? 'border-yellow-400' : 'border-green-400'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm leading-tight">{k.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{CORPORATE_RISK_CATEGORY_LABELS[k.category as CorporateRiskCategory]}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>
                </div>

                {/* Value display */}
                <div className="flex items-end gap-3">
                  <div>
                    <span className={`text-3xl font-bold ${status === 'red' ? 'text-red-600' : status === 'yellow' ? 'text-yellow-600' : 'text-green-600'}`}>{k.currentValue}</span>
                    <span className="text-sm text-gray-400 ml-1">{k.unit}</span>
                    <span className={`ml-2 text-sm font-bold ${TREND_COLOR[k.trend]}`}>{TREND_ICON[k.trend]}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${status === 'red' ? 'bg-red-500' : status === 'yellow' ? 'bg-yellow-400' : 'bg-green-400'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0</span>
                    <span className="text-yellow-600">⚠ {k.warningThreshold}</span>
                    <span className="text-red-600">🔴 {k.criticalThreshold}</span>
                  </div>
                </div>

                {/* Update value */}
                <div className="flex gap-2 pt-1 border-t border-gray-50">
                  <input type="number" step="0.01" placeholder="Nuevo valor" value={newValue[k.id] ?? ''} onChange={e => setNewValue(prev => ({ ...prev, [k.id]: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand" />
                  <button onClick={() => handleUpdateValue(k.id)} disabled={updating === k.id || !newValue[k.id]}
                    className="bg-brand text-white px-2 py-1 rounded text-xs disabled:opacity-40 hover:bg-brand-dark">
                    {updating === k.id ? '⟳' : 'Actualizar'}
                  </button>
                  <button onClick={async () => { await deleteKRI(k.id); reload(); }} className="text-red-400 hover:text-red-600 px-1 text-xs">✕</button>
                </div>
                <p className="text-xs text-gray-400">👤 {k.owner} · {FREQ_LABELS[k.measurementFrequency]}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
