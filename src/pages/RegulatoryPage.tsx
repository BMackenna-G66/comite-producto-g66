import { useEffect, useState } from 'react';
import { getRegulatoryUpdates, createRegulatoryUpdate, updateRegulatoryUpdate } from '../services/firestore';
import { RegulatoryUpdate, RegulatoryImpact, REGULATORS, REGULATORY_COUNTRIES, COMPANIES } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

const IMPACT_COLORS: Record<RegulatoryImpact, string> = {
  Critical: 'bg-red-100 text-red-800 border-red-300',
  High: 'bg-orange-100 text-orange-700 border-orange-200',
  Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Low: 'bg-blue-100 text-blue-700 border-blue-200',
};

const STATUS_COLOR: Record<RegulatoryUpdate['status'], string> = {
  Monitoring: 'bg-gray-100 text-gray-600', Analyzing: 'bg-blue-100 text-blue-700',
  Implementing: 'bg-yellow-100 text-yellow-700', Completed: 'bg-green-100 text-green-700',
};

export default function RegulatoryPage() {
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterReg, setFilterReg] = useState('all');
  const [filterImpact, setFilterImpact] = useState<RegulatoryImpact | 'all'>('all');

  const [form, setForm] = useState({
    country: 'Chile', regulator: 'CMF', title: '', summary: '',
    publicationDate: new Date().toISOString().split('T')[0],
    effectiveDate: '', impactLevel: 'Medium' as RegulatoryImpact,
    affectedProcesses: [] as string[], affectedCompanies: [] as string[],
    status: 'Monitoring' as RegulatoryUpdate['status'],
    owner: '', actionRequired: '',
  });

  const reload = () => getRegulatoryUpdates().then(setUpdates).finally(() => setLoading(false));
  useEffect(() => { reload(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    await createRegulatoryUpdate(form);
    setShowForm(false); await reload(); setSaving(false);
  };

  const filtered = updates.filter(u => {
    if (filterReg !== 'all' && u.regulator !== filterReg) return false;
    if (filterImpact !== 'all' && u.impactLevel !== filterImpact) return false;
    return true;
  });

  const critical = updates.filter(u => u.impactLevel === 'Critical' || u.impactLevel === 'High').length;
  const pending = updates.filter(u => u.status !== 'Completed').length;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Regulatory Intelligence</h1>
          <p className="text-gray-500 text-sm mt-1">Radar de cambios regulatorios — CMF · UAF · SFC · UIAF · BCRA · OFAC · GAFI</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark">
          + Nueva Alerta Regulatoria
        </button>
      </div>

      {/* Regulator radar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Reguladores Monitoreados</p>
        <div className="flex flex-wrap gap-2">
          {REGULATORS.map(reg => {
            const count = updates.filter(u => u.regulator === reg).length;
            const hasCritical = updates.some(u => u.regulator === reg && (u.impactLevel === 'Critical' || u.impactLevel === 'High'));
            return (
              <button key={reg} onClick={() => setFilterReg(filterReg === reg ? 'all' : reg)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${filterReg === reg ? 'border-brand bg-brand text-white' : hasCritical ? 'border-orange-300 bg-orange-50 text-orange-700' : count > 0 ? 'border-gray-300 bg-gray-50 text-gray-700' : 'border-gray-100 bg-white text-gray-400'}`}>
                {reg} {count > 0 && <span className="ml-1 font-bold">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-gray-700">{updates.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total Alertas</div>
        </div>
        <div className={`rounded-xl border shadow-sm p-4 text-center ${critical > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <div className={`text-2xl font-bold ${critical > 0 ? 'text-red-700' : 'text-gray-400'}`}>{critical}</div>
          <div className="text-xs text-gray-500 mt-1">Críticas / Altas</div>
        </div>
        <div className={`rounded-xl border shadow-sm p-4 text-center ${pending > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
          <div className={`text-2xl font-bold ${pending > 0 ? 'text-yellow-700' : 'text-gray-400'}`}>{pending}</div>
          <div className="text-xs text-gray-500 mt-1">Pendientes</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'Critical', 'High', 'Medium', 'Low'] as const).map(imp => (
          <button key={imp} onClick={() => setFilterImpact(imp as RegulatoryImpact | 'all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterImpact === imp ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand'}`}>
            {imp === 'all' ? 'Todos' : imp}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border-2 border-brand shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Nueva Alerta Regulatoria</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">País</label>
              <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {REGULATORY_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Regulador</label>
              <select value={form.regulator} onChange={e => setForm(f => ({ ...f, regulator: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {REGULATORS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Título de la Norma / Circular *</label>
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Ej: Circular 3 sobre activos virtuales CMF" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Resumen</label>
              <textarea rows={2} value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fecha Publicación</label>
              <input type="date" value={form.publicationDate} onChange={e => setForm(f => ({ ...f, publicationDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fecha Vigencia</label>
              <input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Impacto</label>
              <select value={form.impactLevel} onChange={e => setForm(f => ({ ...f, impactLevel: e.target.value as RegulatoryImpact }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                <option value="Critical">Critical</option><option value="High">High</option>
                <option value="Medium">Medium</option><option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Estado</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as RegulatoryUpdate['status'] }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                <option value="Monitoring">Monitoring</option><option value="Analyzing">Analyzing</option>
                <option value="Implementing">Implementing</option><option value="Completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Owner</label>
              <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Acción Requerida</label>
              <input value={form.actionRequired} onChange={e => setForm(f => ({ ...f, actionRequired: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Qué debe hacer el equipo..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
            <button type="submit" disabled={saving} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Guardando...' : 'Registrar'}</button>
          </div>
        </form>
      )}

      {/* Updates list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center space-y-2">
          <div className="text-5xl">🛡</div>
          <p className="text-gray-600 font-medium">Sin alertas regulatorias</p>
          <p className="text-gray-400 text-sm">Registra cambios normativos para anticipar impactos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => (
            <div key={u.id} className={`bg-white rounded-xl border shadow-sm p-5 ${u.impactLevel === 'Critical' ? 'border-red-300' : u.impactLevel === 'High' ? 'border-orange-200' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${IMPACT_COLORS[u.impactLevel]}`}>{u.impactLevel}</span>
                    <span className="text-xs font-semibold text-brand">{u.regulator}</span>
                    <span className="text-xs text-gray-400">{u.country}</span>
                    <span className="text-xs text-gray-400">Pub: {new Date(u.publicationDate).toLocaleDateString('es-CL')}</span>
                    {u.effectiveDate && <span className="text-xs text-orange-600 font-medium">Vigente: {new Date(u.effectiveDate).toLocaleDateString('es-CL')}</span>}
                  </div>
                  <h3 className="font-semibold text-gray-800">{u.title}</h3>
                  {u.summary && <p className="text-sm text-gray-500 mt-0.5">{u.summary}</p>}
                  {u.actionRequired && <div className="mt-2 bg-yellow-50 rounded-lg px-3 py-1.5 text-xs text-yellow-800"><span className="font-medium">Acción: </span>{u.actionRequired}</div>}
                  {u.owner && <p className="text-xs text-gray-400 mt-1">👤 {u.owner}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[u.status]}`}>{u.status}</span>
                  <select value={u.status} onChange={async e => { await updateRegulatoryUpdate(u.id, { status: e.target.value as RegulatoryUpdate['status'] }); reload(); }}
                    className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand">
                    <option value="Monitoring">Monitoring</option><option value="Analyzing">Analyzing</option>
                    <option value="Implementing">Implementing</option><option value="Completed">Completed</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
