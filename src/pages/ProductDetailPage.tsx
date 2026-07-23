import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getProduct, getRisks, getCommitteeSessions, getRedFlags, getProductLinks, createProductLink, deleteProductLink, updateProduct, createRisk, updateRisk, deleteRisk } from '../services/firestore';
import { analyzeProductRisks, suggestMitigations, analyzeCountryScope } from '../services/geminiService';
import { Product, Risk, CommitteeSession, RedFlag, ProductLink, ProductPlanning, PRINCIPLES, RISK_CATEGORIES, RISK_LEVEL_LABELS, STATUS_LABELS, GATE_LABELS, RoamState, riskLevelFromScore } from '../types';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import GateStatusBadge from '../components/GateStatusBadge';
import RiskBadge from '../components/RiskBadge';
import RiskDetailModal from '../components/RiskDetailModal';
import RiskOwnershipTable from '../components/RiskOwnershipTable';

type Tab = 'overview' | 'risks' | 'ownership' | 'sessions' | 'redflags' | 'links' | 'planning' | 'report';

const PLANNING_FIELDS: { key: keyof ProductPlanning; label: string; kind: 'date' | 'url'; placeholder?: string }[] = [
  { key: 'startDate', label: 'Fecha de Inicio', kind: 'date' },
  { key: 'eta', label: 'ETA', kind: 'date' },
  { key: 'ganttUrl', label: 'Gantt', kind: 'url', placeholder: 'Link a Google Sheets / Excel del Gantt' },
  { key: 'jiraUrl', label: 'Backlog Jira', kind: 'url', placeholder: 'Link al board de Jira' },
  { key: 'figmaUrl', label: 'UX Figma', kind: 'url', placeholder: 'Link al diseño en Figma' },
  { key: 'scopeDocUrl', label: 'Documento de Alcance', kind: 'url', placeholder: 'Link al documento de alcance' },
  { key: 'flowDiagramUrl', label: 'Diagrama de Flujo', kind: 'url', placeholder: 'Link a Miro / Lucidchart' },
  { key: 'onePagerUrl', label: 'One Pager', kind: 'url', placeholder: 'Link al one pager' },
];

const EMPTY_PLANNING: ProductPlanning = {};

const LINK_ICONS: { match: RegExp; icon: string; label: string }[] = [
  { match: /figma\.com/i, icon: '🎨', label: 'Figma' },
  { match: /docs\.google\.com\/spreadsheets|\.xlsx?$/i, icon: '📊', label: 'Excel / Sheets' },
  { match: /drive\.google\.com/i, icon: '📁', label: 'Drive' },
  { match: /docs\.google\.com\/document/i, icon: '📄', label: 'Google Docs' },
  { match: /notion\.so/i, icon: '🗒️', label: 'Notion' },
];

const getLinkMeta = (url: string) => LINK_ICONS.find(l => l.match.test(url)) ?? { icon: '🔗', label: 'Enlace' };

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [sessions, setSessions] = useState<CommitteeSession[]>([]);
  const [redFlags, setRedFlags] = useState<RedFlag[]>([]);
  const [links, setLinks] = useState<ProductLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string>('');
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [riskForm, setRiskForm] = useState({ title: '', description: '', category: '', macroprocess: '', process: '', impact: 3, probability: 3, owner: '', isRedFlag: false });
  const [mitLoading, setMitLoading] = useState<string | null>(null);
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkForm, setLinkForm] = useState({ title: '', url: '' });
  const [linkError, setLinkError] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [planningForm, setPlanningForm] = useState<ProductPlanning>(EMPTY_PLANNING);
  const [planningSaving, setPlanningSaving] = useState(false);
  const [planningSaved, setPlanningSaved] = useState(false);
  const [countryScopeLoading, setCountryScopeLoading] = useState(false);

  const canEdit = true;

  const reload = async () => {
    if (!id) return;
    const [p, r, s, rf, lk] = await Promise.all([getProduct(id), getRisks(id), getCommitteeSessions(id), getRedFlags(id), getProductLinks(id)]);
    setProduct(p);
    setRisks(r);
    setSessions(s);
    setRedFlags(rf);
    setLinks(lk);
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [id]);

  // Sincroniza el formulario de planificación solo cuando cambia el producto
  // (no en cada reload()), para no pisar ediciones en curso.
  useEffect(() => {
    if (product) setPlanningForm(product.planning ?? {});
  }, [product?.id]);

  const handleAIAnalysis = async () => {
    if (!product) return;
    setAiLoading(true);
    setAiResult('');
    try {
      const result = await analyzeProductRisks(product.name, product.description, product.businessCase, risks);
      // Auto-add new risks
      for (const r of result.risks.filter((x: { isNew: boolean }) => x.isNew)) {
        await createRisk({
          productId: product.id,
          title: r.title,
          description: r.description,
          category: r.category,
          macroprocess: '',
          process: '',
          impact: r.riskLevel === 'muy_alto' ? 5 : r.riskLevel === 'alto' ? 4 : r.riskLevel === 'moderado' ? 3 : 2,
          probability: r.riskLevel === 'muy_alto' ? 4 : r.riskLevel === 'alto' ? 3 : 2,
          inherentRisk: 0,
          riskLevel: r.riskLevel,
          roamStatus: 'Owned',
          owner: '',
          mitigationPlan: r.suggestedControl,
          isRedFlag: r.riskLevel === 'muy_alto',
          control: r.suggestedControl,
        });
      }
      setAiResult(`✅ Análisis completado. ${result.risks.filter(x => x.isNew).length} nuevos riesgos añadidos.\n\n**Resumen:** ${result.summary}\n\n**Recomendaciones:**\n${result.recommendations.map(r => `• ${r}`).join('\n')}`);
      await reload();
    } catch (e) {
      setAiResult('❌ Error al analizar con IA: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAiLoading(false);
    }
  };

  const handleSuggestMitigation = async (risk: Risk) => {
    setMitLoading(risk.id);
    try {
      const mit = await suggestMitigations(risk.title, risk.description, risk.category);
      await updateRisk(risk.id, { mitigationPlan: mit });
      await reload();
    } finally {
      setMitLoading(null);
    }
  };

  const handleAddRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    const score = riskForm.impact * riskForm.probability;
    await createRisk({
      productId: product.id,
      ...riskForm,
      impact: riskForm.impact as Risk['impact'],
      probability: riskForm.probability as Risk['probability'],
      inherentRisk: score,
      riskLevel: riskLevelFromScore(score),
      roamStatus: 'Owned',
    });
    setShowRiskForm(false);
    setRiskForm({ title: '', description: '', category: '', macroprocess: '', process: '', impact: 3, probability: 3, owner: '', isRedFlag: false });
    await reload();
  };

  const normalizeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    const title = linkForm.title.trim();
    const url = linkForm.url.trim();
    if (!title || !url) { setLinkError('Completa el título y el link.'); return; }
    setLinkError('');
    setLinkBusy(true);
    try {
      await createProductLink({
        productId: product.id,
        title,
        url: normalizeUrl(url),
        addedBy: user?.uid ?? '',
        addedByName: user?.name ?? 'Desconocido',
      });
      setLinkForm({ title: '', url: '' });
      setShowLinkForm(false);
      await reload();
    } finally {
      setLinkBusy(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    await deleteProductLink(linkId);
    await reload();
  };

  const handleSavePlanning = async () => {
    if (!product) return;
    setPlanningSaving(true);
    try {
      const cleaned: ProductPlanning = {};
      for (const f of PLANNING_FIELDS) {
        const v = planningForm[f.key];
        if (v) cleaned[f.key] = f.kind === 'url' ? normalizeUrl(v) : v;
      }
      await updateProduct(product.id, { planning: cleaned });
      setPlanningSaved(true);
      setTimeout(() => setPlanningSaved(false), 2000);
      await reload();
    } finally {
      setPlanningSaving(false);
    }
  };

  const handleAnalyzeCountryScope = async () => {
    if (!product) return;
    setCountryScopeLoading(true);
    try {
      const result = await analyzeCountryScope(product.name, product.description, product.businessCase, product.companies);
      await updateProduct(product.id, { countryScope: result });
      await reload();
    } finally {
      setCountryScopeLoading(false);
    }
  };

  const handleRoamUpdate = async (riskId: string, status: RoamState) => {
    await updateRisk(riskId, { roamStatus: status });
    await reload();
  };

  const handleAdvanceGate = async () => {
    if (!product) return;
    const nextGate = product.currentGate < 3 ? (product.currentGate + 1) as 1 | 2 | 3 : product.currentGate;
    const updates: Partial<Product> = { currentGate: nextGate };
    if (product.currentGate === 1) { updates.gate1Status = 'approved'; updates.gate2Status = 'in_progress'; updates.status = 'gate2'; }
    else if (product.currentGate === 2) { updates.gate2Status = 'approved'; updates.gate3Status = 'in_progress'; updates.status = 'gate3'; }
    else { updates.gate3Status = 'approved'; updates.status = 'approved'; }
    await updateProduct(product.id, updates);
    await reload();
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return <div className="p-6 text-gray-500">Producto no encontrado.</div>;

  const gateStatuses = [product.gate1Status, product.gate2Status, product.gate3Status];

  return (
    <>
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Link to="/products" className="hover:text-brand">Productos</Link>
            <span>/</span>
            <span>{product.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{product.name}</h1>
          <p className="text-sm text-gray-500">{product.ownerName} · {product.companies.join(', ')}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleAIAnalysis}
              disabled={aiLoading}
              className="bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {aiLoading ? <span className="animate-spin">⟳</span> : '✦'} Analizar con IA
            </button>
            <Link
              to={`/sessions/new?productId=${product.id}`}
              className="bg-brand text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-brand-dark"
            >
              + Convocar Comité
            </Link>
          </div>
        )}
      </div>

      {/* AI result */}
      {aiResult && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-5 py-4">
          <pre className="text-sm text-purple-800 whitespace-pre-wrap font-sans">{aiResult}</pre>
          <button onClick={() => setAiResult('')} className="text-xs text-purple-500 mt-2 hover:underline">Cerrar</button>
        </div>
      )}

      {/* Gate progress */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-0">
          {['Gate 1 · Levantamiento', 'Gate 2 · Planificación', 'Gate 3 · Ejecución y Cierre'].map((label, i) => (
            <div key={i} className="flex-1 flex items-center">
              <div className={`flex-1 ${i > 0 ? 'h-0.5 ' + (gateStatuses[i - 1] === 'approved' ? 'bg-green-400' : 'bg-gray-200') : ''}`} />
              <div className="flex flex-col items-center gap-1.5 px-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                  gateStatuses[i] === 'approved' ? 'bg-green-500 border-green-500 text-white' :
                  gateStatuses[i] === 'rejected' ? 'bg-red-500 border-red-500 text-white' :
                  gateStatuses[i] === 'blocked' ? 'bg-red-200 border-red-400 text-red-700' :
                  gateStatuses[i] === 'in_progress' ? 'bg-brand border-brand text-white' :
                  'bg-gray-100 border-gray-300 text-gray-400'
                }`}>
                  {gateStatuses[i] === 'approved' ? '✓' : i + 1}
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-700 whitespace-nowrap">{label}</p>
                  <GateStatusBadge status={gateStatuses[i]} />
                </div>
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 ${gateStatuses[i] === 'approved' ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        {canEdit && product.status !== 'approved' && product.status !== 'rejected' && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleAdvanceGate}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-green-700"
            >
              Aprobar Gate {product.currentGate} →
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 no-print overflow-x-auto">
        <div className="flex gap-0">
          {(['overview', 'risks', 'ownership', 'sessions', 'redflags', 'links', 'planning', 'report'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'overview' ? 'Descripción'
                : t === 'risks' ? `Riesgos (${risks.length})`
                : t === 'ownership' ? `Responsables Comité`
                : t === 'sessions' ? `Sesiones (${sessions.length})`
                : t === 'redflags' ? `Red Flags (${redFlags.filter(r => r.status === 'active').length})`
                : t === 'links' ? `Enlaces (${links.length})`
                : t === 'planning' ? 'Planificación'
                : 'Reporte'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Descripción</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{product.description}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Business Case</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{product.businessCase}</p>
          </div>
          {product.publicTarget && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Público Objetivo</h3>
              <p className="text-sm text-gray-700">{product.publicTarget}</p>
            </div>
          )}
          {/* Principles */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Principios Generales (Gate 1)</h3>
            <div className="space-y-2">
              {PRINCIPLES.map((p, i) => {
                const eval_ = product.principles?.[p];
                return (
                  <div key={i} className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50">
                    <span className="text-sm text-gray-700">{i + 1}. {p}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {canEdit && (
                        <>
                          <button onClick={async () => {
                            await updateProduct(product.id, { principles: { ...product.principles, [p]: { compliant: true, observations: eval_?.observations ?? '' } } });
                            await reload();
                          }} className={`text-xs px-2 py-0.5 rounded ${eval_?.compliant === true ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-green-100'}`}>Sí</button>
                          <button onClick={async () => {
                            await updateProduct(product.id, { principles: { ...product.principles, [p]: { compliant: false, observations: eval_?.observations ?? '' } } });
                            await reload();
                          }} className={`text-xs px-2 py-0.5 rounded ${eval_?.compliant === false ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-red-100'}`}>No</button>
                        </>
                      )}
                      {eval_?.compliant === undefined && <span className="text-xs text-gray-400">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cobertura por País (IA)</h3>
              <p className="text-xs text-gray-400 mt-0.5">Determina qué países aplican directa o indirectamente, para validar que el Oficial de Cumplimiento correspondiente quede en el alcance del comité.</p>
            </div>
            {canEdit && (
              <button onClick={handleAnalyzeCountryScope} disabled={countryScopeLoading} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50 shrink-0">
                {countryScopeLoading ? '⟳ Analizando...' : '✦ Analizar con IA'}
              </button>
            )}
          </div>

          {!product.countryScope ? (
            <p className="text-xs text-gray-400 italic">Aún no se ha ejecutado el análisis.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {product.countryScope.entries.map((e, i) => (
                  <span key={i} className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    e.scope === 'directo' ? 'bg-red-100 text-red-700' :
                    e.scope === 'indirecto' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`} title={e.reasoning}>
                    {e.country} · {e.scope === 'directo' ? 'Directo' : e.scope === 'indirecto' ? 'Indirecto' : 'Fuera de alcance'}
                  </span>
                ))}
              </div>
              <div className="space-y-1">
                {product.countryScope.entries.map((e, i) => (
                  <p key={i} className="text-xs text-gray-500"><span className="font-medium text-gray-700">{e.country}:</span> {e.reasoning}</p>
                ))}
              </div>
              {product.countryScope.warning && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  ⚠ {product.countryScope.warning}
                </div>
              )}
              <p className="text-xs text-gray-300">Último análisis: {new Date(product.countryScope.analyzedAt).toLocaleString('es-CL')}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'risks' && (
        <div className="space-y-4">
          {canEdit && (
            <div className="flex gap-2 justify-end">
              <button onClick={handleAIAnalysis} disabled={aiLoading} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
                {aiLoading ? '⟳ Analizando...' : '✦ Sugerir con IA'}
              </button>
              <button onClick={() => setShowRiskForm(!showRiskForm)} className="bg-brand text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-brand-dark">
                + Agregar Riesgo
              </button>
            </div>
          )}

          {showRiskForm && (
            <form onSubmit={handleAddRisk} className="bg-white rounded-xl border border-brand shadow-sm p-5 space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Nuevo Riesgo</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Título *</label>
                  <input required value={riskForm.title} onChange={e => setRiskForm(f => ({...f, title: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Descripción *</label>
                  <textarea required rows={2} value={riskForm.description} onChange={e => setRiskForm(f => ({...f, description: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Categoría</label>
                  <select value={riskForm.category} onChange={e => setRiskForm(f => ({...f, category: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">Seleccionar...</option>
                    {RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Owner</label>
                  <input value={riskForm.owner} onChange={e => setRiskForm(f => ({...f, owner: e.target.value}))} placeholder='Responsable' className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Impacto (1-5): {riskForm.impact}</label>
                  <input type="range" min={1} max={5} value={riskForm.impact} onChange={e => setRiskForm(f => ({...f, impact: Number(e.target.value)}))} className="w-full" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Probabilidad (1-5): {riskForm.probability}</label>
                  <input type="range" min={1} max={5} value={riskForm.probability} onChange={e => setRiskForm(f => ({...f, probability: Number(e.target.value)}))} className="w-full" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowRiskForm(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
                <button type="submit" className="bg-brand text-white px-4 py-1.5 rounded-lg text-sm">Guardar</button>
              </div>
            </form>
          )}

          {risks.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
              No hay riesgos identificados. Usa el análisis IA o agrega manualmente.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3">Riesgo</th>
                    <th className="text-left px-4 py-3">Categoría</th>
                    <th className="text-center px-4 py-3">I×P</th>
                    <th className="text-center px-4 py-3">Nivel</th>
                    <th className="text-center px-4 py-3">ROAM</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {risks.map(r => (
                    <tr key={r.id} onClick={() => setSelectedRisk(r)} className={`cursor-pointer hover:bg-blue-50 ${r.isRedFlag ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{r.title}</div>
                        <div className="text-xs text-gray-400 line-clamp-1">{r.description}</div>
                        {r.mitigationPlan && <div className="text-xs text-green-600 mt-0.5 line-clamp-1">✓ {r.mitigationPlan}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.category}</td>
                      <td className="px-4 py-3 text-center font-semibold">{r.inherentRisk}</td>
                      <td className="px-4 py-3 text-center"><RiskBadge level={r.riskLevel} /></td>
                      <td className="px-4 py-3 text-center">
                        {canEdit ? (
                          <select
                            value={r.roamStatus}
                            onChange={e => handleRoamUpdate(r.id, e.target.value as RoamState)}
                            className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand"
                          >
                            {(['Owned', 'Accepted', 'Mitigated', 'Resolved'] as RoamState[]).map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-600">{r.roamStatus}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSuggestMitigation(r)}
                              disabled={mitLoading === r.id}
                              className="text-xs text-purple-600 hover:underline disabled:opacity-50"
                              title="Sugerir mitigación con IA"
                            >
                              {mitLoading === r.id ? '⟳' : '✦'}
                            </button>
                            <button onClick={async () => { await deleteRisk(r.id); await reload(); }} className="text-xs text-red-400 hover:text-red-600 ml-1">✕</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'ownership' && (
        <RiskOwnershipTable
          risks={risks}
          onRefresh={reload}
          readOnly={!canEdit}
        />
      )}

      {tab === 'sessions' && (
        <div className="space-y-3">
          {canEdit && (
            <div className="flex justify-end">
              <Link to={`/sessions/new?productId=${product.id}`} className="bg-brand text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-brand-dark">
                + Convocar Sesión
              </Link>
            </div>
          )}
          {sessions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">No hay sesiones de comité registradas.</div>
          ) : (
            sessions.map(s => (
              <Link key={s.id} to={`/sessions/${s.id}`} className="block bg-white rounded-xl border border-gray-100 shadow-sm hover:border-brand p-4 transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm text-gray-800">Sesión {s.sessionId} · Gate {s.gate}</span>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(s.sessionDate).toLocaleDateString('es-CL')} · {s.presidentName}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${s.resolution === 'APROBADO' ? 'bg-green-100 text-green-700' : s.resolution === 'RECHAZADO' ? 'bg-red-100 text-red-700' : s.resolution === 'APROBADO_CON_CONDICIONANTES' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                    {s.resolution === 'APROBADO_CON_CONDICIONANTES' ? 'Con Condicionantes' : s.resolution}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'redflags' && (
        <div className="space-y-3">
          {redFlags.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">No hay Red Flags activas.</div>
          ) : (
            redFlags.map(rf => (
              <div key={rf.id} className={`bg-white rounded-xl border shadow-sm p-4 ${rf.status === 'active' ? 'border-red-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rf.status === 'active' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{rf.status === 'active' ? 'Activa' : 'Cerrada'}</span>
                      <span className="text-xs text-gray-400">{rf.area}</span>
                    </div>
                    <p className="text-sm text-gray-800 font-medium">{rf.description}</p>
                    <p className="text-xs text-gray-500">Acción correctiva: {rf.correctiveAction}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'links' && (
        <div className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <button onClick={() => setShowLinkForm(!showLinkForm)} className="bg-brand text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-brand-dark">
                + Agregar Enlace
              </button>
            </div>
          )}

          {showLinkForm && (
            <form onSubmit={handleAddLink} className="bg-white rounded-xl border border-brand shadow-sm p-5 space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Nuevo Enlace</h3>
              <p className="text-xs text-gray-400">Figma, Google Sheets/Excel, Drive, Notion o cualquier otro link relevante para este producto.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Título *</label>
                  <input required value={linkForm.title} onChange={e => setLinkForm(f => ({ ...f, title: e.target.value }))} placeholder="Ej: Diseño Figma - Onboarding" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Link *</label>
                  <input required value={linkForm.url} onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
              </div>
              {linkError && <p className="text-xs text-red-600">{linkError}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowLinkForm(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
                <button type="submit" disabled={linkBusy} className="bg-brand text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">{linkBusy ? '...' : 'Guardar'}</button>
              </div>
            </form>
          )}

          {links.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
              No hay enlaces cargados. Agrega Figma, Sheets, Drive u otros links relevantes.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {links.map(lk => {
                const meta = getLinkMeta(lk.url);
                return (
                  <div key={lk.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <a href={lk.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 min-w-0 group">
                      <span className="text-lg shrink-0">{meta.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 group-hover:text-brand truncate">{lk.title}</p>
                        <p className="text-xs text-gray-400 truncate">{meta.label} · agregado por {lk.addedByName}</p>
                      </div>
                    </a>
                    {canEdit && (
                      <button onClick={() => handleDeleteLink(lk.id)} className="text-xs text-gray-400 hover:text-red-600 shrink-0">✕</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'planning' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Fechas</h3>
            <div className="grid grid-cols-2 gap-4">
              {PLANNING_FIELDS.filter(f => f.kind === 'date').map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <input
                    type="date"
                    disabled={!canEdit}
                    value={planningForm[f.key] ?? ''}
                    onChange={e => setPlanningForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Enlaces de referencia</h3>
            <div className="space-y-3">
              {PLANNING_FIELDS.filter(f => f.kind === 'url').map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      disabled={!canEdit}
                      value={planningForm[f.key] ?? ''}
                      onChange={e => setPlanningForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50"
                    />
                    {planningForm[f.key] && (
                      <a href={normalizeUrl(planningForm[f.key]!)} target="_blank" rel="noopener noreferrer" title="Abrir enlace" className="text-brand text-sm shrink-0">↗</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <button
                onClick={handleSavePlanning}
                disabled={planningSaving}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${planningSaved ? 'bg-green-500 text-white' : 'bg-brand text-white hover:bg-brand-dark'} disabled:opacity-50`}
              >
                {planningSaving ? 'Guardando...' : planningSaved ? '✓ Guardado' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'report' && (
        <div className="space-y-4">
          <div className="no-print flex justify-end">
            <button onClick={() => window.print()} className="bg-brand text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-brand-dark">
              🖨 Imprimir / Descargar Reporte
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="print-only text-center pb-3 border-b mb-2">
              <h1 className="text-xl font-bold">Reporte de Avance — Comité de Producto G66</h1>
              <p className="text-sm">{product.name} · {new Date().toLocaleDateString('es-CL')}</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Producto</h3>
              <p className="text-sm text-gray-800 font-medium">{product.name}</p>
              <p className="text-xs text-gray-500">{product.ownerName} · {product.companies.join(', ')}</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Estado de Gates</h3>
              <p className="text-sm text-gray-700">{GATE_LABELS[product.currentGate]}</p>
              <div className="flex gap-4 text-xs text-gray-600 mt-1">
                <span>Gate 1: {STATUS_LABELS[product.gate1Status]}</span>
                <span>Gate 2: {STATUS_LABELS[product.gate2Status]}</span>
                <span>Gate 3: {STATUS_LABELS[product.gate3Status]}</span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Riesgos ({risks.length})</h3>
              <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                {(['muy_alto', 'alto', 'moderado', 'bajo', 'muy_bajo'] as const).map(lvl => {
                  const count = risks.filter(r => r.riskLevel === lvl).length;
                  return count > 0 ? <span key={lvl}>{RISK_LEVEL_LABELS[lvl]}: {count}</span> : null;
                })}
                {risks.length === 0 && <span className="text-gray-400">Sin riesgos identificados.</span>}
              </div>
              <p className="text-xs text-gray-500 mt-1">Red Flags activas: {redFlags.filter(r => r.status === 'active').length}</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Sesiones de Comité ({sessions.length})</h3>
              {sessions.length === 0 ? (
                <p className="text-xs text-gray-400">Sin sesiones registradas.</p>
              ) : (
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {sessions.map(s => (
                    <li key={s.id}>Gate {s.gate} · {new Date(s.sessionDate).toLocaleDateString('es-CL')} · {s.resolution}</li>
                  ))}
                </ul>
              )}
            </div>

            {product.planning && (product.planning.startDate || product.planning.eta) && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Planificación</h3>
                <div className="text-xs text-gray-600 space-y-0.5">
                  {product.planning.startDate && <p>Fecha de Inicio: {product.planning.startDate}</p>}
                  {product.planning.eta && <p>ETA: {product.planning.eta}</p>}
                </div>
              </div>
            )}

            {links.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Enlaces</h3>
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {links.map(lk => <li key={lk.id}>{lk.title}: {lk.url}</li>)}
                </ul>
              </div>
            )}

            {product.countryScope && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Cobertura por País</h3>
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {product.countryScope.entries.map((e, i) => (
                    <li key={i}>{e.country}: {e.scope === 'directo' ? 'Directo' : e.scope === 'indirecto' ? 'Indirecto' : 'Fuera de alcance'}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
      {selectedRisk && (
        <RiskDetailModal
          risk={selectedRisk}
          onClose={() => setSelectedRisk(null)}
          onSaved={async () => { await reload(); setSelectedRisk(prev => prev ? (risks.find(r => r.id === prev.id) ?? null) : null); }}
        />
      )}
    </>
  );
}
