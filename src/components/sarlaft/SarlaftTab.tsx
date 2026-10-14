import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Product, Risk } from '../../types';
import { SarlaftMatrix, SarlaftProductRisk } from '../../sarlaft/types';
import {
  SEVERITY_COLORS, SFC_EXPECTED_COHERENCE, coherenceIndicator, valueProductRisk,
} from '../../sarlaft/methodology';
import { buildSarlaftAnalysis, productRiskFromMatrix } from '../../sarlaft/analysis';
import { persistSarlaftAnalysis } from '../../sarlaft/persist';
import { getSarlaftMatrix, getSarlaftRisks } from '../../services/firestore';
import { analyzeSarlaft } from '../../services/geminiService';
import { LoadedFile, loadScopeDocument, toScopeInput, ACCEPTED_SCOPE_EXTENSIONS, ScopeDocInput } from '../../services/scopeDocument';
import { useAuth } from '../../hooks/useAuth';
import SarlaftHeatMap from './SarlaftHeatMap';
import SarlaftRiskEditor, { SarlaftDraft } from './SarlaftRiskEditor';

interface Props {
  product: Product;
  operationalRisks: Risk[];
  onProductChange: (update: (p: Product) => Product) => void;
}

const APPLIES_STYLE = {
  directo: 'bg-red-100 text-red-700',
  indirecto: 'bg-amber-100 text-amber-700',
  no_aplica: 'bg-gray-100 text-gray-500',
};
const APPLIES_LABEL = { directo: 'Directo', indirecto: 'Indirecto', no_aplica: 'No aplica' };

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const shortCode = (r: SarlaftProductRisk, i: number) => (r.matrixRiskCode ? r.matrixRiskCode.replace('R-SARLAFT-', 'R') : `N${i + 1}`);

export default function SarlaftTab({ product, operationalRisks, onProductChange }: Props) {
  const { user } = useAuth();
  const [matrix, setMatrix] = useState<SarlaftMatrix | null>(null);
  const [risks, setRisks] = useState<SarlaftProductRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SarlaftDraft | null>(null);

  const [showAnalysis, setShowAnalysis] = useState(false);
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [addCode, setAddCode] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getSarlaftMatrix(), getSarlaftRisks(product.id)])
      .then(([m, r]) => { setMatrix(m); setRisks(r); })
      .finally(() => setLoading(false));
  }, [product.id]);

  const valued = useMemo(() => risks.map(r => ({ risk: r, v: valueProductRisk(r) })), [risks]);
  const coherence = coherenceIndicator(risks);
  const analysis = product.sarlaftAnalysis;
  const newCauses = risks.reduce((s, r) => s + r.causes.filter(c => !c.code).length, 0);
  const proposedControls = risks.reduce((s, r) => s + r.causes.reduce((t, c) => t + c.controls.filter(k => k.status === 'propuesto').length, 0), 0);

  const handleFile = async (f: File) => {
    setError('');
    setFileLoading(true);
    try { setFile(await loadScopeDocument(f)); } catch (e) { setError(e instanceof Error ? e.message : 'Error al cargar el archivo'); } finally { setFileLoading(false); }
  };

  const handleAnalyze = async () => {
    if (!matrix) return;
    let input: ScopeDocInput;
    if (inputMode === 'file') {
      if (!file) { setError('Carga el documento de alcance.'); return; }
      input = toScopeInput(file);
    } else {
      if (!pastedText.trim()) { setError('Pega el texto del documento de alcance.'); return; }
      input = { kind: 'text', text: pastedText };
    }
    setError('');
    setNotice('');
    setAnalyzing(true);
    try {
      const ai = await analyzeSarlaft(input, matrix, { name: product.name, description: product.description },
        operationalRisks.map(r => ({ id: r.id, title: r.title, category: r.category })), setProgress);
      const output = buildSarlaftAnalysis(ai, matrix, product.id, inputMode === 'file' && file ? file.name : 'Texto pegado', operationalRisks.map(r => r.id));
      const saved = await persistSarlaftAnalysis(product.id, output, risks);
      setRisks(saved);
      onProductChange(p => ({ ...p, sarlaftAnalysis: output.summary }));
      const applies = output.summary.cross.filter(c => c.applies !== 'no_aplica').length;
      const kept = risks.filter(r => r.origin === 'manual').length;
      setNotice(`✅ Cruce contra los ${matrix.risks.length} riesgos de la matriz: ${applies} aplican. ${saved.length} riesgos SARLAFT en el producto${kept ? ` (${kept} editados a mano se conservaron)` : ''}.`);
      setShowAnalysis(false);
      setFile(null);
      setPastedText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en el análisis SARLAFT');
    } finally {
      setAnalyzing(false);
      setProgress('');
    }
  };

  const startAdd = () => {
    if (!matrix) return;
    const now = new Date().toISOString();
    const base = matrix.risks.find(r => r.code === addCode);
    setEditing(base
      ? productRiskFromMatrix(matrix, base, product.id, user?.name ?? 'Usuario')
      : {
        productId: product.id, matrixRiskCode: '', sourceCrime: '', description: '', applicability: 'directo', justification: '',
        associatedRisks: '', riskFactors: '', probability: 3, impactLegal: 3, impactFinancial: 3, impactContagion: 3,
        impactReputational: 3, sfcRiskScore: 1, causes: [], relatedOperationalRiskIds: [], origin: 'manual',
        updatedByName: user?.name ?? 'Usuario', createdAt: now, updatedAt: now,
      });
    setAddCode('');
  };

  if (loading) return <div className="p-6 text-sm text-gray-400">Cargando SARLAFT...</div>;

  if (!matrix) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-sm text-gray-600">
        No hay una matriz SARLAFT vigente cargada. Impórtala desde <Link to="/sarlaft" className="text-brand hover:underline">Riesgos SARLAFT</Link> para poder cruzar este producto.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-800">Riesgos SARLAFT (LA/FT/FPADM)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Metodología SARLAFT, independiente de los riesgos operacionales: el producto se cruza contra todos los riesgos de la matriz vigente y cada causa y control se califica con la guía de la SFC.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Matriz vigente: {matrix.version}
              {analysis && <> · Último cruce: {new Date(analysis.analyzedAt).toLocaleString('es-CL')} ({analysis.sourceDoc}, matriz {analysis.matrixVersion})</>}
            </p>
          </div>
          <button onClick={() => { setShowAnalysis(s => !s); setError(''); }} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 shrink-0">
            {analysis ? '🔄 Reanalizar SARLAFT' : '✦ Analizar SARLAFT'}
          </button>
        </div>
        {notice && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{notice}</p>}

        {showAnalysis && (
          <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              {(['file', 'text'] as const).map(m => (
                <button key={m} onClick={() => setInputMode(m)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border ${inputMode === m ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {m === 'file' ? '📄 Subir archivo' : '📝 Pegar texto'}
                </button>
              ))}
            </div>
            {inputMode === 'file' ? (
              <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                className="border-2 border-dashed border-purple-200 rounded-lg p-4 text-center cursor-pointer hover:bg-white">
                <input ref={fileRef} type="file" accept={ACCEPTED_SCOPE_EXTENSIONS} className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                {fileLoading ? <p className="text-xs text-gray-500">Cargando archivo...</p>
                  : file ? <p className="text-sm text-gray-700">📎 {file.name} <span className="text-xs text-gray-400">({file.sizeLabel})</span></p>
                    : <p className="text-xs text-gray-500">Arrastra o haz click para cargar el documento de alcance (PDF, DOCX, TXT o MD)</p>}
              </div>
            ) : (
              <textarea rows={5} value={pastedText} onChange={e => setPastedText(e.target.value)} placeholder="Pega aquí el documento de alcance..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
            )}
            <p className="text-xs text-gray-500">Reemplaza los riesgos SARLAFT generados por IA; los editados a mano se conservan. Puede tardar hasta un par de minutos.</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAnalysis(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancelar</button>
              <button onClick={handleAnalyze} disabled={analyzing || fileLoading}
                className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
                {analyzing ? `${progress || 'Cruzando contra la matriz'}...` : 'Analizar y cruzar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          ['Riesgos SARLAFT', String(risks.length), ''],
          ['Inherente alto/extremo', String(valued.filter(x => ['ALTO', 'EXTREMO'].includes(x.v.inherentSeverity)).length), ''],
          ['Residual inaceptable', String(valued.filter(x => x.v.residualAcceptability === 'INACEPTABLE').length), valued.some(x => x.v.residualAcceptability === 'INACEPTABLE') ? 'text-red-600' : ''],
          ['Causas nuevas', String(newCauses), newCauses ? 'text-amber-600' : ''],
          ['Controles propuestos', String(proposedControls), proposedControls ? 'text-amber-600' : ''],
          ['Coherencia SFC', pct(coherence), coherence !== null && coherence < SFC_EXPECTED_COHERENCE ? 'text-red-600' : 'text-green-700'],
        ].map(([title, value, color]) => (
          <div key={title} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <p className={`text-xl font-bold ${color || 'text-gray-800'}`}>{value}</p>
            <p className="text-[11px] text-gray-500">{title}{title === 'Coherencia SFC' && ' de lo vigente (esperado ≥ 80%)'}</p>
          </div>
        ))}
      </div>

      {analysis && (analysis.summary || analysis.productProfile) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-2 text-sm text-gray-700">
          {analysis.productProfile && <p><span className="text-xs font-semibold text-gray-500 uppercase">Perfil del producto · </span>{analysis.productProfile}</p>}
          {analysis.summary && <p><span className="text-xs font-semibold text-gray-500 uppercase">Conclusión · </span>{analysis.summary}</p>}
        </div>
      )}

      {risks.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3">
          <SarlaftHeatMap title="Riesgo inherente" points={valued.map(({ risk, v }, i) => ({ label: shortCode(risk, i), title: risk.description, probability: risk.probability, impact: v.impact }))} />
          <SarlaftHeatMap title="Riesgo residual" points={valued.map(({ risk, v }, i) => ({ label: shortCode(risk, i), title: risk.description, probability: v.residualProbability, impact: v.residualImpact }))} />
        </div>
      )}

      {/* Riesgos del producto */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-sm font-semibold text-gray-700">Riesgos SARLAFT del producto</h4>
          <div className="flex items-center gap-2">
            <select value={addCode} onChange={e => setAddCode(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs">
              <option value="">Riesgo nuevo (fuera de la matriz)</option>
              {matrix.risks.map(r => <option key={r.code} value={r.code}>{r.code} · {r.sourceCrime}</option>)}
            </select>
            <button onClick={startAdd} className="bg-brand text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-brand-dark">+ Agregar</button>
          </div>
        </div>
        {risks.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">Aún no hay riesgos SARLAFT. Ejecuta el análisis o agrégalos desde la matriz.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Riesgo</th>
                  <th className="text-center px-2 py-2">Exposición</th>
                  <th className="text-center px-2 py-2">Inherente</th>
                  <th className="text-center px-2 py-2">Residual</th>
                  <th className="text-center px-2 py-2">Causas</th>
                  <th className="text-center px-2 py-2">Controles</th>
                  <th className="text-center px-2 py-2">Coherencia SFC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {valued.map(({ risk, v }) => {
                  const nc = risk.causes.filter(c => !c.code).length;
                  const controls = risk.causes.flatMap(c => c.controls);
                  const proposed = controls.filter(k => k.status === 'propuesto').length;
                  const coh = coherenceIndicator([risk]);
                  return (
                    <tr key={risk.id} onClick={() => setEditing(risk)} className="cursor-pointer hover:bg-purple-50/40">
                      <td className="px-4 py-2.5 max-w-md">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono bg-purple-100 text-purple-700 px-1.5 rounded">{risk.matrixRiskCode || 'NUEVO'}</span>
                          <span className="text-xs font-medium text-gray-700">{risk.sourceCrime}</span>
                          {risk.origin === 'manual' && <span className="text-[10px] text-gray-400">✎</span>}
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2">{risk.description}</p>
                      </td>
                      <td className="text-center px-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${APPLIES_STYLE[risk.applicability]}`}>{APPLIES_LABEL[risk.applicability]}</span></td>
                      <td className="text-center px-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${SEVERITY_COLORS[v.inherentSeverity]}`}>{v.inherentScore} · {v.inherentSeverity}</span></td>
                      <td className="text-center px-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${SEVERITY_COLORS[v.residualSeverity]}`}>{v.residualScore} · {v.residualSeverity}</span>
                        {v.residualAcceptability === 'INACEPTABLE' && <p className="text-[10px] text-red-600 mt-0.5">Inaceptable</p>}
                      </td>
                      <td className="text-center px-2 text-xs text-gray-600">{risk.causes.length}{nc > 0 && <span className="text-amber-600"> ({nc} nuevas)</span>}</td>
                      <td className="text-center px-2 text-xs text-gray-600">{controls.length}{proposed > 0 && <span className="text-amber-600"> ({proposed} prop.)</span>}</td>
                      <td className={`text-center px-2 text-xs font-medium ${coh !== null && coh < SFC_EXPECTED_COHERENCE ? 'text-red-600' : 'text-green-700'}`}>{pct(coh)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cruce contra la matriz vigente */}
      {analysis && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700">Cruce contra la matriz vigente ({analysis.cross.length} riesgos)</h4>
          </div>
          <div className="divide-y divide-gray-50">
            {analysis.cross.map(c => {
              const m = matrix.risks.find(r => r.code === c.matrixRiskCode);
              return (
                <div key={c.matrixRiskCode} className="px-5 py-2.5 flex items-start gap-3">
                  <span className="text-[11px] font-mono text-gray-500 w-24 shrink-0 pt-0.5">{c.matrixRiskCode}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${APPLIES_STYLE[c.applies]}`}>{APPLIES_LABEL[c.applies]}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700">{m?.sourceCrime ?? ''}</p>
                    <p className="text-xs text-gray-500">{c.justification}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <SarlaftRiskEditor
          risk={editing}
          operationalRisks={operationalRisks}
          onClose={() => setEditing(null)}
          onSaved={saved => {
            setRisks(prev => (prev.some(r => r.id === saved.id) ? prev.map(r => (r.id === saved.id ? saved : r)) : [...prev, saved]));
            setEditing(null);
          }}
          onDeleted={id => { setRisks(prev => prev.filter(r => r.id !== id)); setEditing(null); }}
        />
      )}
    </div>
  );
}
