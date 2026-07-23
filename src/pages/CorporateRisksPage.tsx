import { useEffect, useState } from 'react';
import { getCorporateRisks, createCorporateRisk, updateCorporateRisk, deleteCorporateRisk } from '../services/firestore';
import { CorporateRisk, CorporateRiskCategory, CORPORATE_RISK_CATEGORY_LABELS, calculateRiskAppetite, PROBABILITY_PCT, riskLevelFromScore, RISK_LEVEL_LABELS, COMPANIES } from '../types';
import RiskBadge from '../components/RiskBadge';
import LoadingSpinner from '../components/LoadingSpinner';

const ZONE_BADGE_COLOR: Record<string, string> = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
};

const STATUS_COLOR: Record<CorporateRisk['status'], string> = {
  Open: 'bg-red-100 text-red-700', Mitigating: 'bg-yellow-100 text-yellow-700',
  Accepted: 'bg-blue-100 text-blue-700', Closed: 'bg-green-100 text-green-700',
};
const CATEGORIES = Object.keys(CORPORATE_RISK_CATEGORY_LABELS) as CorporateRiskCategory[];

const BUSINESS_UNITS = ['Compliance', 'Riesgos', 'Fraude', 'Ciberseguridad', 'Legal', 'Operaciones', 'Producto', 'Finanzas', 'Tecnología'];

const emptyForm = (): Omit<CorporateRisk, 'id' | 'createdAt' | 'updatedAt'> => ({
  title: '', description: '', category: 'OPERATIONAL', owner: '', businessUnit: '',
  impact: 3, probability: 3, inherentRisk: 9, residualRisk: 0,
  economicImpact: 0, status: 'Open',
  relatedProducts: [], relatedControls: [], relatedIncidents: [],
});

export default function CorporateRisksPage() {
  const [risks, setRisks] = useState<CorporateRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<CorporateRiskCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<CorporateRisk['status'] | 'all'>('all');

  const reload = () => getCorporateRisks().then(setRisks).finally(() => setLoading(false));
  useEffect(() => { reload(); }, []);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const score = form.impact * form.probability;
    const data = { ...form, inherentRisk: score };
    if (editing) await updateCorporateRisk(editing, data);
    else await createCorporateRisk(data);
    setShowForm(false); setEditing(null); setForm(emptyForm());
    await reload(); setSaving(false);
  };

  const handleEdit = (r: CorporateRisk) => {
    setForm({ title: r.title, description: r.description, category: r.category, owner: r.owner,
      businessUnit: r.businessUnit, impact: r.impact, probability: r.probability,
      inherentRisk: r.inherentRisk, residualRisk: r.residualRisk, economicImpact: r.economicImpact ?? 0,
      status: r.status, relatedProducts: r.relatedProducts, relatedControls: r.relatedControls, relatedIncidents: r.relatedIncidents });
    setEditing(r.id); setShowForm(true);
  };

  const filtered = risks.filter(r => {
    if (filterCat !== 'all' && r.category !== filterCat) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    return true;
  });

  const byCategory = CATEGORIES.map(cat => ({ cat, count: risks.filter(r => r.category === cat).length })).filter(x => x.count > 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Matriz Corporativa de Riesgos</h1>
          <p className="text-gray-500 text-sm mt-1">Riesgos transversales de la organización independientes de productos</p>
          <p className="text-gray-400 text-xs mt-0.5">La zona de apetito se calcula según el Marco de Apetito de Riesgo (RAF) — ver detalle en la pestaña "Apetito de Riesgo".</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm(emptyForm()); }}
          className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark">
          + Nuevo Riesgo Corporativo
        </button>
      </div>

      {/* Category heatmap */}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-1.5">
        {CATEGORIES.map(cat => {
          const count = risks.filter(r => r.category === cat).length;
          const high = risks.filter(r => r.category === cat && (r.inherentRisk >= 10)).length;
          return (
            <button key={cat} onClick={() => setFilterCat(filterCat === cat ? 'all' : cat)}
              className={`rounded-lg p-2 text-center border-2 transition-all ${filterCat === cat ? 'border-brand scale-105' : 'border-transparent bg-white shadow-sm hover:shadow-md'}`}>
              <div className={`text-lg font-bold ${high > 0 ? 'text-red-600' : count > 0 ? 'text-brand' : 'text-gray-300'}`}>{count}</div>
              <div className="text-xs text-gray-500 leading-tight mt-0.5 truncate">{CORPORATE_RISK_CATEGORY_LABELS[cat].split('/')[0].trim()}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'Open', 'Mitigating', 'Accepted', 'Closed'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s as CorporateRisk['status'] | 'all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand'}`}>
            {s === 'all' ? 'Todos' : s} {s !== 'all' && `(${risks.filter(r => r.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border-2 border-brand shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-700">{editing ? 'Editar' : 'Nuevo'} Riesgo Corporativo</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Título *</label>
              <input required value={form.title} onChange={e => set('title', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Descripción *</label>
              <textarea required rows={2} value={form.description} onChange={e => set('description', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Categoría</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {CATEGORIES.map(c => <option key={c} value={c}>{CORPORATE_RISK_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Unidad de Negocio</label>
              <select value={form.businessUnit} onChange={e => set('businessUnit', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                <option value="">Seleccionar...</option>
                {BUSINESS_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Owner / Responsable</label>
              <input value={form.owner} onChange={e => set('owner', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Impacto Económico Estimado (USD)</label>
              <input type="number" min={0} step={1000} value={form.economicImpact} onChange={e => set('economicImpact', Number(e.target.value))}
                placeholder="Ej: 8000000" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Impacto (1-5): {form.impact}</label>
              <input type="range" min={1} max={5} value={form.impact} onChange={e => set('impact', Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Probabilidad de Ocurrencia (1-5 · {(PROBABILITY_PCT[form.probability as 1|2|3|4|5] * 100).toFixed(0)}%)</label>
              <input type="range" min={1} max={5} value={form.probability} onChange={e => set('probability', Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Riesgo Residual (0-25): {form.residualRisk}</label>
              <input type="range" min={0} max={25} value={form.residualRisk} onChange={e => set('residualRisk', Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Estado</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                <option value="Open">Open</option><option value="Mitigating">Mitigating</option>
                <option value="Accepted">Accepted</option><option value="Closed">Closed</option>
              </select>
            </div>
          </div>

          {form.economicImpact > 0 && (() => {
            const calc = calculateRiskAppetite(form.economicImpact, form.probability as 1|2|3|4|5);
            return (
              <div className={`rounded-lg px-4 py-3 text-xs ${ZONE_BADGE_COLOR[calc.zone.color]}`}>
                <p className="font-semibold">Exposición Esperada: USD {calc.expectedExposureUSD.toLocaleString('es-CL')} ({calc.pctOfPatrimonio.toFixed(1)}% del patrimonio)</p>
                <p>Zona: {calc.zone.label} — {calc.zone.zone} · {calc.zone.treatment}</p>
              </div>
            );
          })()}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
            <button type="submit" disabled={saving} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear Riesgo'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Riesgo</th>
              <th className="text-left px-4 py-3">Categoría</th>
              <th className="text-left px-4 py-3">Unidad</th>
              <th className="text-center px-4 py-3">I×P</th>
              <th className="text-center px-4 py-3">Inherente</th>
              <th className="text-center px-4 py-3">Residual</th>
              <th className="text-center px-4 py-3">Apetito</th>
              <th className="text-center px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                {risks.length === 0 ? 'No hay riesgos corporativos. Crea el primero.' : 'Sin resultados con los filtros aplicados.'}
              </td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800 text-sm">{r.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{r.description}</p>
                  {r.owner && <p className="text-xs text-gray-400 mt-0.5">👤 {r.owner}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{CORPORATE_RISK_CATEGORY_LABELS[r.category]}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{r.businessUnit || '—'}</td>
                <td className="px-4 py-3 text-center text-xs font-mono font-bold">{r.impact}×{r.probability}</td>
                <td className="px-4 py-3 text-center"><RiskBadge level={riskLevelFromScore(r.inherentRisk)} /></td>
                <td className="px-4 py-3 text-center">
                  {r.residualRisk > 0 ? <RiskBadge level={riskLevelFromScore(r.residualRisk)} /> : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.economicImpact > 0 ? (() => {
                    const calc = calculateRiskAppetite(r.economicImpact, r.probability);
                    return (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ZONE_BADGE_COLOR[calc.zone.color]}`} title={`USD ${calc.expectedExposureUSD.toLocaleString('es-CL')} (${calc.pctOfPatrimonio.toFixed(1)}% patrimonio) · ${calc.zone.treatment}`}>
                        {calc.zone.label}
                      </span>
                    );
                  })() : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status]}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(r)} className="text-xs text-brand hover:underline">Editar</button>
                    <button onClick={async () => { await deleteCorporateRisk(r.id); reload(); }} className="text-xs text-red-400 hover:text-red-600">✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
