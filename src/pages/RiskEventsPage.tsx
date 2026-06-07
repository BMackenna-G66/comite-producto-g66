import { useEffect, useState } from 'react';
import { getRiskEvents, createRiskEvent, updateRiskEvent, getOperationalLosses, createOperationalLoss } from '../services/firestore';
import { RiskEvent, OperationalLoss, CorporateRiskCategory, CORPORATE_RISK_CATEGORY_LABELS, ImpactLevel, IMPACT_COLORS, COMPANIES } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

const STATUS_COLOR: Record<RiskEvent['status'], string> = {
  Open: 'bg-red-100 text-red-700', Investigating: 'bg-orange-100 text-orange-700',
  Mitigating: 'bg-yellow-100 text-yellow-700', Closed: 'bg-green-100 text-green-700',
};

const LOSS_TYPES: OperationalLoss['lossType'][] = ['Direct', 'Indirect', 'Regulatory', 'Legal', 'Reputational'];

export default function RiskEventsPage() {
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [losses, setLosses] = useState<OperationalLoss[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showLossForm, setShowLossForm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<RiskEvent | null>(null);

  const [form, setForm] = useState({
    title: '', description: '', eventDate: new Date().toISOString().split('T')[0],
    category: 'OPERATIONAL' as CorporateRiskCategory, impactLevel: 'Medium' as ImpactLevel,
    affectedArea: '', affectedCompanies: [] as string[], rootCause: '',
    lossAmount: 0, currency: 'USD' as RiskEvent['currency'], status: 'Open' as RiskEvent['status'],
    owner: '', lessonsLearned: '',
  });

  const [lossForm, setLossForm] = useState({ lossType: 'Direct' as OperationalLoss['lossType'], grossLoss: 0, recoveredAmount: 0, currency: 'USD' as OperationalLoss['currency'], date: new Date().toISOString().split('T')[0], description: '' });

  const reload = async () => {
    const [e, l] = await Promise.all([getRiskEvents(), getOperationalLosses()]);
    setEvents(e); setLosses(l); setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    await createRiskEvent(form);
    setShowForm(false); await reload(); setSaving(false);
  };

  const handleLossSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!showLossForm) return; setSaving(true);
    await createOperationalLoss({ ...lossForm, riskEventId: showLossForm, netLoss: lossForm.grossLoss - lossForm.recoveredAmount });
    setShowLossForm(null); await reload(); setSaving(false);
  };

  const totalLoss = losses.reduce((sum, l) => sum + l.netLoss, 0);
  const openEvents = events.filter(e => e.status !== 'Closed').length;
  const criticalEvents = events.filter(e => e.impactLevel === 'Critical' || e.impactLevel === 'High').length;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Eventos de Riesgo</h1>
          <p className="text-gray-500 text-sm mt-1">Registro de incidentes y pérdidas operacionales</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark">
          + Registrar Evento
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{events.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total Eventos</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className={`text-2xl font-bold ${openEvents > 0 ? 'text-red-600' : 'text-green-600'}`}>{openEvents}</div>
          <div className="text-xs text-gray-500 mt-1">Eventos Abiertos</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className={`text-2xl font-bold ${criticalEvents > 0 ? 'text-orange-600' : 'text-gray-700'}`}>{criticalEvents}</div>
          <div className="text-xs text-gray-500 mt-1">Alto/Crítico</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-red-700">${totalLoss.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">Pérdida Neta Total USD</div>
        </div>
      </div>

      {/* Event form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border-2 border-brand shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Registrar Evento de Riesgo</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Título *</label>
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Ej: Caída proveedor ACH, Error onboarding masivo..." />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Descripción *</label>
              <textarea required rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fecha del Evento</label>
              <input type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Categoría</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as CorporateRiskCategory }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {(Object.keys(CORPORATE_RISK_CATEGORY_LABELS) as CorporateRiskCategory[]).map(c => <option key={c} value={c}>{CORPORATE_RISK_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nivel de Impacto</label>
              <select value={form.impactLevel} onChange={e => setForm(f => ({ ...f, impactLevel: e.target.value as ImpactLevel }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {(['Critical', 'High', 'Medium', 'Low', 'Negligible'] as ImpactLevel[]).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Área Afectada</label>
              <input value={form.affectedArea} onChange={e => setForm(f => ({ ...f, affectedArea: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Owner</label>
              <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Pérdida Estimada (USD)</label>
              <input type="number" value={form.lossAmount} onChange={e => setForm(f => ({ ...f, lossAmount: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Causa Raíz</label>
              <input value={form.rootCause} onChange={e => setForm(f => ({ ...f, rootCause: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
            <button type="submit" disabled={saving} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Registrar</button>
          </div>
        </form>
      )}

      {/* Loss form */}
      {showLossForm && (
        <form onSubmit={handleLossSubmit} className="bg-orange-50 rounded-xl border-2 border-orange-300 shadow-sm p-5 space-y-3">
          <h3 className="font-semibold text-orange-800 text-sm">Registrar Pérdida Operacional</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tipo de Pérdida</label>
              <select value={lossForm.lossType} onChange={e => setLossForm(f => ({ ...f, lossType: e.target.value as OperationalLoss['lossType'] }))} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {LOSS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fecha</label>
              <input type="date" value={lossForm.date} onChange={e => setLossForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Pérdida Bruta (USD)</label>
              <input type="number" value={lossForm.grossLoss} onChange={e => setLossForm(f => ({ ...f, grossLoss: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Monto Recuperado (USD)</label>
              <input type="number" value={lossForm.recoveredAmount} onChange={e => setLossForm(f => ({ ...f, recoveredAmount: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Pérdida Neta: <strong>${(lossForm.grossLoss - lossForm.recoveredAmount).toLocaleString()} USD</strong></label>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowLossForm(null)} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
            <button type="submit" disabled={saving} className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Registrar Pérdida</button>
          </div>
        </form>
      )}

      {/* Events list */}
      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
            <div className="text-5xl mb-3">⚡</div>
            <p className="font-medium text-gray-600">No hay eventos registrados</p>
            <p className="text-sm mt-1">Registra incidentes operacionales para construir historial.</p>
          </div>
        ) : events.map(ev => {
          const evLosses = losses.filter(l => l.riskEventId === ev.id);
          const totalEvLoss = evLosses.reduce((s, l) => s + l.netLoss, 0);
          return (
            <div key={ev.id} className={`bg-white rounded-xl border shadow-sm p-5 ${ev.status === 'Closed' ? 'border-gray-100 opacity-75' : ev.impactLevel === 'Critical' ? 'border-red-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${IMPACT_COLORS[ev.impactLevel]}`}>{ev.impactLevel}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[ev.status]}`}>{ev.status}</span>
                    <span className="text-xs text-gray-400">{CORPORATE_RISK_CATEGORY_LABELS[ev.category as CorporateRiskCategory]}</span>
                    <span className="text-xs text-gray-400">{new Date(ev.eventDate).toLocaleDateString('es-CL')}</span>
                  </div>
                  <h3 className="font-semibold text-gray-800 mt-1.5">{ev.title}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{ev.description}</p>
                  {ev.rootCause && <p className="text-xs text-gray-400 mt-1">Causa raíz: {ev.rootCause}</p>}
                  {ev.owner && <p className="text-xs text-gray-400 mt-0.5">👤 {ev.owner}</p>}
                  {evLosses.length > 0 && (
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-xs font-medium text-red-700">💸 Pérdidas registradas: {evLosses.length} · Neto: ${totalEvLoss.toLocaleString()} USD</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <select value={ev.status} onChange={async e => { await updateRiskEvent(ev.id, { status: e.target.value as RiskEvent['status'] }); reload(); }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand">
                    <option value="Open">Open</option><option value="Investigating">Investigating</option>
                    <option value="Mitigating">Mitigating</option><option value="Closed">Closed</option>
                  </select>
                  <button onClick={() => setShowLossForm(ev.id)} className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-lg hover:bg-orange-200">
                    + Pérdida
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
