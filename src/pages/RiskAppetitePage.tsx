import { useEffect, useState } from 'react';
import { getRiskAppetites, createRiskAppetite, updateRiskAppetite, getKRIs, getCorporateRisks } from '../services/firestore';
import { RiskAppetite, KRI, CorporateRisk, CorporateRiskCategory, CORPORATE_RISK_CATEGORY_LABELS, getKRIStatus, PATRIMONIO_BASE_USD, RISK_APPETITE_ZONES, calculateRiskAppetite } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

const ZONE_BADGE_COLOR: Record<string, string> = {
  green: 'bg-green-100 text-green-700 border-green-300',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  orange: 'bg-orange-100 text-orange-700 border-orange-300',
  red: 'bg-red-100 text-red-700 border-red-300',
};

const DEFAULT_APPETITES: Omit<RiskAppetite, 'id'>[] = [
  { riskCategory: 'FRAUD', metric: 'Fraud Loss Rate', description: 'Porcentaje del volumen mensual afectado por fraude', targetValue: 0.3, warningValue: 0.5, criticalValue: 1.0, unit: '%', approvedBy: 'General Counsel', approvalDate: '2024-04-18', reviewDate: '2025-04-18' },
  { riskCategory: 'AML_COMPLIANCE', metric: 'Clientes Sancionados Activos', description: 'Número de clientes activos en listas de sanción OFAC/ONU', targetValue: 0, warningValue: 0, criticalValue: 1, unit: 'clientes', approvedBy: 'General Counsel', approvalDate: '2024-04-18', reviewDate: '2025-04-18' },
  { riskCategory: 'OPERATIONAL', metric: 'Indisponibilidad Mensual', description: 'Horas de indisponibilidad de sistemas críticos por mes', targetValue: 1, warningValue: 2, criticalValue: 4, unit: 'horas', approvedBy: 'Gerente de Riesgos', approvalDate: '2024-04-18', reviewDate: '2025-04-18' },
  { riskCategory: 'FINANCIAL', metric: 'Posición de Caja Mínima', description: 'Días de operación cubiertos por caja disponible', targetValue: 90, warningValue: 60, criticalValue: 30, unit: 'días', approvedBy: 'General Counsel', approvalDate: '2024-04-18', reviewDate: '2025-04-18' },
  { riskCategory: 'CYBERSECURITY', metric: 'Vulnerabilidades Críticas Abiertas', description: 'Número de CVEs críticos sin remediar', targetValue: 0, warningValue: 2, criticalValue: 5, unit: 'vulns', approvedBy: 'Head Ciberseguridad', approvalDate: '2024-04-18', reviewDate: '2025-04-18' },
];

export default function RiskAppetitePage() {
  const [appetites, setAppetites] = useState<RiskAppetite[]>([]);
  const [kris, setKRIs] = useState<KRI[]>([]);
  const [corporateRisks, setCorporateRisks] = useState<CorporateRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Omit<RiskAppetite, 'id'>>({
    riskCategory: 'OPERATIONAL', metric: '', description: '', targetValue: 0,
    warningValue: 0, criticalValue: 0, unit: '', approvedBy: '', approvalDate: '', reviewDate: '',
  });

  const reload = async () => {
    const [a, k, cr] = await Promise.all([getRiskAppetites(), getKRIs(), getCorporateRisks()]);
    setAppetites(a); setKRIs(k); setCorporateRisks(cr); setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const scoredRisks = corporateRisks.filter(r => r.economicImpact > 0);
  const zoneCounts = RISK_APPETITE_ZONES.map(z => ({
    zone: z,
    count: scoredRisks.filter(r => calculateRiskAppetite(r.economicImpact, r.probability).zone.key === z.key).length,
  }));

  const handleSeedDefaults = async () => {
    setSaving(true);
    for (const a of DEFAULT_APPETITES) await createRiskAppetite(a);
    await reload(); setSaving(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    await createRiskAppetite(form);
    setShowForm(false); await reload(); setSaving(false);
  };

  // Match KRI to appetite
  const getMatchingKRI = (appetite: RiskAppetite): KRI | undefined =>
    kris.find(k => k.category === appetite.riskCategory);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Risk Appetite Framework</h1>
          <p className="text-gray-500 text-sm mt-1">Niveles de tolerancia al riesgo aprobados por el directorio</p>
        </div>
        <div className="flex gap-2">
          {appetites.length === 0 && (
            <button onClick={handleSeedDefaults} disabled={saving} className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
              + Cargar apetitos base
            </button>
          )}
          <button onClick={() => setShowForm(true)} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark">
            + Nuevo Apetito
          </button>
        </div>
      </div>

      {/* Marco de Apetito de Riesgo (RAF) — metodología cuantitativa */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800">Marco de Apetito de Riesgo (RAF)</h2>
          <p className="text-xs text-gray-500 mt-1">
            Metodología cuantitativa según la política "Apetito de Riesgo — Gestión Integral de Riesgo". Patrimonio Base: <span className="font-semibold text-gray-700">USD {PATRIMONIO_BASE_USD.toLocaleString('es-CL')}</span>.
            Exposición Esperada = Impacto Económico (USD) × Probabilidad de Ocurrencia (%).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">Zona</th>
                <th className="text-center px-3 py-2">% Patrimonio</th>
                <th className="text-center px-3 py-2">Exposición (USD)</th>
                <th className="text-left px-3 py-2">Tratamiento</th>
                <th className="text-center px-3 py-2">Riesgos Corp.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {zoneCounts.map(({ zone, count }) => (
                <tr key={zone.key}>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full font-medium border ${ZONE_BADGE_COLOR[zone.color]}`}>{zone.label}</span>
                    <span className="text-gray-400 ml-2">{zone.zone}</span>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600">
                    {zone.maxPct === null ? `> ${zone.minPct}%` : `${zone.minPct}% – ${zone.maxPct}%`}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600">
                    {zone.maxPct === null
                      ? `> USD ${Math.round(PATRIMONIO_BASE_USD * zone.minPct / 100).toLocaleString('es-CL')}`
                      : `USD ${Math.round(PATRIMONIO_BASE_USD * zone.minPct / 100).toLocaleString('es-CL')} – ${Math.round(PATRIMONIO_BASE_USD * zone.maxPct / 100).toLocaleString('es-CL')}`}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{zone.treatment}</td>
                  <td className="px-3 py-2 text-center font-semibold text-gray-700">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scoredRisks.length === 0 && (
          <p className="text-xs text-gray-400 italic">Aún no hay riesgos corporativos con Impacto Económico cargado — el perfil consolidado se completará a medida que se ingresen.</p>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-semibold">¿Qué es esto?</p>
        <p className="text-xs mt-1">Además del marco cuantitativo de arriba, el comité puede definir niveles de apetito operacionales por KRI (indicador clave de riesgo). Los valores aprobados aquí se comparan automáticamente con los KRIs registrados.</p>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border-2 border-brand shadow-sm p-5 space-y-3">
          <h3 className="font-semibold text-gray-700">Nuevo Nivel de Apetito</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Categoría de Riesgo</label>
              <select value={form.riskCategory} onChange={e => setForm(f => ({ ...f, riskCategory: e.target.value as CorporateRiskCategory }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {(Object.keys(CORPORATE_RISK_CATEGORY_LABELS) as CorporateRiskCategory[]).map(c => <option key={c} value={c}>{CORPORATE_RISK_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Métrica</label>
              <input required value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Ej: Fraud Loss Rate" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Unidad</label>
              <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="%, horas, días..." />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Valor Objetivo (verde)</label>
              <input type="number" step="0.01" value={form.targetValue} onChange={e => setForm(f => ({ ...f, targetValue: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Valor Alerta (amarillo)</label>
              <input type="number" step="0.01" value={form.warningValue} onChange={e => setForm(f => ({ ...f, warningValue: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Valor Crítico (rojo)</label>
              <input type="number" step="0.01" value={form.criticalValue} onChange={e => setForm(f => ({ ...f, criticalValue: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Aprobado por</label>
              <input value={form.approvedBy} onChange={e => setForm(f => ({ ...f, approvedBy: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fecha de Aprobación</label>
              <input type="date" value={form.approvalDate} onChange={e => setForm(f => ({ ...f, approvalDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
            <button type="submit" disabled={saving} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Guardar</button>
          </div>
        </form>
      )}

      {/* Appetite cards */}
      {appetites.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center space-y-3">
          <div className="text-5xl">⚖</div>
          <p className="text-gray-600 font-medium">No hay niveles de apetito definidos</p>
          <p className="text-gray-400 text-sm">Carga los apetitos base o crea niveles personalizados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {appetites.map(a => {
            const matchedKRI = getMatchingKRI(a);
            const kriStatus = matchedKRI ? getKRIStatus(matchedKRI) : null;
            const isBreached = matchedKRI && matchedKRI.currentValue >= a.criticalValue;
            const isWarning = matchedKRI && !isBreached && matchedKRI.currentValue >= a.warningValue;

            return (
              <div key={a.id} className={`bg-white rounded-xl border-l-4 shadow-sm p-5 space-y-3 ${isBreached ? 'border-red-500' : isWarning ? 'border-yellow-400' : 'border-green-400'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{CORPORATE_RISK_CATEGORY_LABELS[a.riskCategory as CorporateRiskCategory]}</span>
                    <h3 className="font-semibold text-gray-800 mt-0.5">{a.metric}</h3>
                    {a.description && <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>}
                  </div>
                  {kriStatus && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${kriStatus === 'red' ? 'bg-red-100 text-red-700' : kriStatus === 'yellow' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      KRI: {kriStatus === 'red' ? 'Crítico' : kriStatus === 'yellow' ? 'Alerta' : 'Normal'}
                    </span>
                  )}
                </div>

                {/* Thresholds */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-green-50 rounded-lg p-2">
                    <div className="text-sm font-bold text-green-700">{a.targetValue}{a.unit}</div>
                    <div className="text-xs text-green-600">Objetivo</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-2">
                    <div className="text-sm font-bold text-yellow-700">{a.warningValue}{a.unit}</div>
                    <div className="text-xs text-yellow-600">Alerta</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-2">
                    <div className="text-sm font-bold text-red-700">{a.criticalValue}{a.unit}</div>
                    <div className="text-xs text-red-600">Crítico</div>
                  </div>
                </div>

                {/* KRI value if linked */}
                {matchedKRI && (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${isBreached ? 'bg-red-50' : isWarning ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                    <span className="text-xs text-gray-500">Valor actual ({matchedKRI.name}):</span>
                    <span className={`text-sm font-bold ${isBreached ? 'text-red-700' : isWarning ? 'text-yellow-700' : 'text-green-700'}`}>
                      {matchedKRI.currentValue}{matchedKRI.unit}
                      {isBreached && ' 🔴 BREACH'}
                      {isWarning && ' ⚠ ALERTA'}
                      {!isBreached && !isWarning && ' ✓'}
                    </span>
                  </div>
                )}

                <div className="text-xs text-gray-400 flex justify-between">
                  <span>Aprobado: {a.approvedBy}</span>
                  <span>Rev: {a.reviewDate ? new Date(a.reviewDate).toLocaleDateString('es-CL') : '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
