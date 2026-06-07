import { useEffect, useState } from 'react';
import { getControlTests, createControlTest, updateControlTest } from '../services/firestore';
import { ControlTest, ControlEffectiveness, CorporateRiskCategory, CORPORATE_RISK_CATEGORY_LABELS } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

const EFF_COLORS: Record<ControlEffectiveness, string> = {
  Effective: 'bg-green-100 text-green-700', PartiallyEffective: 'bg-yellow-100 text-yellow-700',
  Ineffective: 'bg-red-100 text-red-700', NotTested: 'bg-gray-100 text-gray-500',
};
const EFF_ICON: Record<ControlEffectiveness, string> = {
  Effective: '✓', PartiallyEffective: '⚠', Ineffective: '✗', NotTested: '—',
};

export default function ControlTestingPage() {
  const [tests, setTests] = useState<ControlTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Omit<ControlTest, 'id'>>({
    controlId: '', controlName: '', riskCategory: 'OPERATIONAL', testDate: new Date().toISOString().split('T')[0],
    tester: '', result: 'NotTested', effectivenessScore: 0, evidence: '',
    findings: '', recommendations: '', nextTestDate: '',
  });

  const reload = () => getControlTests().then(setTests).finally(() => setLoading(false));
  useEffect(() => { reload(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    await createControlTest(form);
    setShowForm(false); setForm({ controlId: '', controlName: '', riskCategory: 'OPERATIONAL', testDate: new Date().toISOString().split('T')[0], tester: '', result: 'NotTested', effectivenessScore: 0, evidence: '', findings: '', recommendations: '', nextTestDate: '' });
    await reload(); setSaving(false);
  };

  const stats = {
    effective: tests.filter(t => t.result === 'Effective').length,
    partial: tests.filter(t => t.result === 'PartiallyEffective').length,
    ineffective: tests.filter(t => t.result === 'Ineffective').length,
    notTested: tests.filter(t => t.result === 'NotTested').length,
  };

  const avgScore = tests.length > 0 ? Math.round(tests.filter(t => t.result !== 'NotTested').reduce((s, t) => s + t.effectivenessScore, 0) / Math.max(tests.filter(t => t.result !== 'NotTested').length, 1)) : 0;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Control Testing</h1>
          <p className="text-gray-500 text-sm mt-1">Validación periódica de efectividad de controles</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark">
          + Nuevo Test
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-gray-700">{avgScore}%</div>
          <div className="text-xs text-gray-500 mt-1">Score Promedio</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{stats.effective}</div>
          <div className="text-xs text-green-600 mt-1">Efectivos</div>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">{stats.partial}</div>
          <div className="text-xs text-yellow-600 mt-1">Parcialmente</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{stats.ineffective}</div>
          <div className="text-xs text-red-600 mt-1">Inefectivos</div>
        </div>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-500">{stats.notTested}</div>
          <div className="text-xs text-gray-500 mt-1">Sin Testear</div>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border-2 border-brand shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Nuevo Test de Control</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nombre del Control *</label>
              <input required value={form.controlName} onChange={e => setForm(f => ({ ...f, controlName: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Ej: Segregación de funciones en pagos" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Categoría de Riesgo</label>
              <select value={form.riskCategory} onChange={e => setForm(f => ({ ...f, riskCategory: e.target.value as CorporateRiskCategory }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {(Object.keys(CORPORATE_RISK_CATEGORY_LABELS) as CorporateRiskCategory[]).map(c => <option key={c} value={c}>{CORPORATE_RISK_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fecha de Test</label>
              <input type="date" value={form.testDate} onChange={e => setForm(f => ({ ...f, testDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Próximo Test</label>
              <input type="date" value={form.nextTestDate} onChange={e => setForm(f => ({ ...f, nextTestDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Testeador</label>
              <input value={form.tester} onChange={e => setForm(f => ({ ...f, tester: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Resultado</label>
              <select value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value as ControlEffectiveness }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                <option value="Effective">Effective</option>
                <option value="PartiallyEffective">Partially Effective</option>
                <option value="Ineffective">Ineffective</option>
                <option value="NotTested">Not Tested</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Score de Efectividad (0-100): {form.effectivenessScore}%</label>
              <input type="range" min={0} max={100} value={form.effectivenessScore} onChange={e => setForm(f => ({ ...f, effectivenessScore: Number(e.target.value) }))} className="w-full" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Hallazgos</label>
              <textarea rows={2} value={form.findings} onChange={e => setForm(f => ({ ...f, findings: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Recomendaciones</label>
              <textarea rows={2} value={form.recommendations} onChange={e => setForm(f => ({ ...f, recommendations: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
            <button type="submit" disabled={saving} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Guardando...' : 'Registrar Test'}</button>
          </div>
        </form>
      )}

      {/* Tests table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Control</th>
              <th className="text-left px-4 py-3">Categoría</th>
              <th className="text-center px-4 py-3">Fecha</th>
              <th className="text-center px-4 py-3">Testeador</th>
              <th className="text-center px-4 py-3">Score</th>
              <th className="text-center px-4 py-3">Resultado</th>
              <th className="text-center px-4 py-3">Próx. Test</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tests.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No hay tests registrados. Crea el primero.</td></tr>
            )}
            {tests.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{t.controlName}</p>
                  {t.findings && <p className="text-xs text-red-500 mt-0.5 line-clamp-1">⚠ {t.findings}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{CORPORATE_RISK_CATEGORY_LABELS[t.riskCategory as CorporateRiskCategory]}</td>
                <td className="px-4 py-3 text-center text-xs text-gray-500">{new Date(t.testDate).toLocaleDateString('es-CL')}</td>
                <td className="px-4 py-3 text-center text-xs text-gray-500">{t.tester || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${t.effectivenessScore >= 75 ? 'bg-green-500' : t.effectivenessScore >= 40 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${t.effectivenessScore}%` }} />
                    </div>
                    <span className="text-xs font-medium">{t.effectivenessScore}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${EFF_COLORS[t.result]}`}>
                    {EFF_ICON[t.result]} {t.result === 'PartiallyEffective' ? 'Parcial' : t.result === 'NotTested' ? 'Sin test' : t.result}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-400">
                  {t.nextTestDate ? new Date(t.nextTestDate).toLocaleDateString('es-CL') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
