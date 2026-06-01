import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeDocument, analyzeDocumentPDF, DocumentAnalysisResult } from '../services/geminiService';
import { createProduct, createRisk } from '../services/firestore';
import { RISK_LEVEL_LABELS, RiskLevel, riskLevelFromScore } from '../types';

type Step = 'input' | 'analyzing' | 'result';
type FileMode = 'text' | 'file';

interface LoadedFile {
  name: string;
  type: 'pdf' | 'docx' | 'text';
  // For PDF: base64 string. For others: extracted text.
  content: string;
  isPdf: boolean;
  sizeLabel: string;
}

const RISK_COLORS: Record<RiskLevel, string> = {
  muy_alto: 'border-red-300 bg-red-50',
  alto: 'border-orange-300 bg-orange-50',
  moderado: 'border-yellow-300 bg-yellow-50',
  bajo: 'border-blue-200 bg-blue-50',
  muy_bajo: 'border-green-200 bg-green-50',
};
const RISK_TEXT: Record<RiskLevel, string> = {
  muy_alto: 'text-red-700', alto: 'text-orange-700', moderado: 'text-yellow-700',
  bajo: 'text-blue-700', muy_bajo: 'text-green-700',
};

const sizeLabel = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:application/pdf;base64," prefix
      res(result.split(',')[1]);
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

const extractDocxText = async (file: File): Promise<string> => {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

export default function DocumentAnalysisPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('input');
  const [mode, setMode] = useState<FileMode>('file');
  const [pastedText, setPastedText] = useState('');
  const [loadedFile, setLoadedFile] = useState<LoadedFile | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);

  const [selectedRisks, setSelectedRisks] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [ownerName, setOwnerName] = useState('');

  // ─── File loading ──────────────────────────────────────────────────────────
  const processFile = async (file: File) => {
    setFileLoading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const size = sizeLabel(file.size);

      if (ext === 'pdf') {
        if (file.size > 20 * 1024 * 1024) throw new Error('El PDF supera el límite de 20 MB.');
        const b64 = await fileToBase64(file);
        setLoadedFile({ name: file.name, type: 'pdf', content: b64, isPdf: true, sizeLabel: size });
      } else if (ext === 'docx') {
        const text = await extractDocxText(file);
        if (!text.trim()) throw new Error('No se pudo extraer texto del archivo .docx');
        setLoadedFile({ name: file.name, type: 'docx', content: text, isPdf: false, sizeLabel: size });
      } else if (['txt', 'md', 'csv'].includes(ext)) {
        const text = await file.text();
        setLoadedFile({ name: file.name, type: 'text', content: text, isPdf: false, sizeLabel: size });
      } else {
        throw new Error(`Formato no soportado: .${ext}. Usa PDF, DOCX, TXT o MD.`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar archivo');
    } finally {
      setFileLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  // ─── Analysis ──────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    setError('');
    const hasInput = mode === 'file' ? !!loadedFile : pastedText.trim().length > 0;
    if (!hasInput) { setError('Carga un documento o pega texto para analizar.'); return; }
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      setError('Falta VITE_GEMINI_API_KEY. Agrégala en Settings → Secrets → Actions del repositorio.'); return;
    }

    setStep('analyzing');
    try {
      let res: DocumentAnalysisResult;
      if (mode === 'file' && loadedFile?.isPdf) {
        res = await analyzeDocumentPDF(loadedFile.content);
      } else {
        const text = mode === 'file' ? loadedFile!.content : pastedText;
        res = await analyzeDocument(text);
      }
      setResult(res);
      setSelectedRisks(new Set(res.risks.map((_, i) => i)));
      setStep('result');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al analizar');
      setStep('input');
    }
  };

  const handleImport = async () => {
    if (!result) return;
    setImporting(true);
    try {
      const productId = await createProduct({
        name: result.productName,
        description: result.productDescription,
        businessCase: mode === 'text' ? pastedText.slice(0, 2000) : `Extraído de: ${loadedFile?.name}`,
        owner: crypto.randomUUID(),
        ownerName: ownerName || 'Análisis IA',
        companies: result.affectedCompanies,
        status: 'gate1',
        currentGate: 1,
        gate1Status: 'in_progress',
        gate2Status: 'pending',
        gate3Status: 'pending',
        publicTarget: '',
        principles: Object.fromEntries(
          result.gate1Principles.map(p => [p.principle, { compliant: p.compliant ?? false, observations: p.justification }])
        ),
      });
      for (const r of result.risks.filter((_, i) => selectedRisks.has(i))) {
        const impact = Math.min(5, Math.max(1, Math.round(r.impact))) as 1|2|3|4|5;
        const probability = Math.min(5, Math.max(1, Math.round(r.probability))) as 1|2|3|4|5;
        await createRisk({
          productId, title: r.title, description: r.description, category: r.category,
          macroprocess: result.affectedProcesses[0] ?? '', process: '',
          impact, probability, inherentRisk: impact * probability,
          riskLevel: riskLevelFromScore(impact * probability),
          roamStatus: 'Owned', owner: ownerName || 'Análisis IA',
          mitigationPlan: r.suggestedControl, control: r.suggestedControl, isRedFlag: r.isRedFlag,
        });
      }
      setImported(true);
      setTimeout(() => navigate(`/products/${productId}`), 1400);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('input'); setResult(null); setLoadedFile(null);
    setPastedText(''); setError(''); setImported(false); setSelectedRisks(new Set());
  };

  const redFlagCount  = result?.risks.filter(r => r.isRedFlag).length ?? 0;
  const highRiskCount = result?.risks.filter(r => r.riskLevel === 'muy_alto' || r.riskLevel === 'alto').length ?? 0;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Análisis de Documentos ✦ IA</h1>
          <p className="text-gray-500 text-sm mt-1">
            Sube un PDF, DOCX o pega texto — Gemini extrae riesgos, procesos afectados y evaluación Gate 1.
          </p>
        </div>
        {step === 'result' && (
          <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
            ← Nuevo análisis
          </button>
        )}
      </div>

      {/* ── INPUT STEP ─────────────────────────────────────────────────────── */}
      {(step === 'input' || step === 'analyzing') && (
        <div className="space-y-4">

          {/* Mode tabs */}
          <div className="flex gap-2">
            {(['file', 'text'] as FileMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${mode === m ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:border-brand'}`}>
                {m === 'file' ? '📎 Subir archivo' : '✏ Pegar texto'}
              </button>
            ))}
          </div>

          {/* File drop zone */}
          {mode === 'file' && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => !loadedFile && fileRef.current?.click()}
              className={`bg-white rounded-xl border-2 border-dashed shadow-sm transition-colors
                ${loadedFile ? 'border-brand cursor-default' : 'border-gray-200 hover:border-brand hover:bg-gray-50 cursor-pointer'}
                ${fileLoading ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} />

              {fileLoading ? (
                <div className="p-12 text-center space-y-3">
                  <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-gray-500">Extrayendo texto del documento...</p>
                </div>
              ) : loadedFile ? (
                <div className="p-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-sm
                      ${loadedFile.type === 'pdf' ? 'bg-red-100' : loadedFile.type === 'docx' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      {loadedFile.type === 'pdf' ? '📕' : loadedFile.type === 'docx' ? '📘' : '📄'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{loadedFile.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full uppercase ${loadedFile.type === 'pdf' ? 'bg-red-100 text-red-700' : loadedFile.type === 'docx' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {loadedFile.type}
                        </span>
                        <span className="text-xs text-gray-400">{loadedFile.sizeLabel}</span>
                        {!loadedFile.isPdf && <span className="text-xs text-gray-400">{loadedFile.content.length.toLocaleString()} caracteres</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setLoadedFile(null); }}
                    className="text-gray-400 hover:text-red-500 transition-colors text-xl p-2">✕</button>
                </div>
              ) : (
                <div className="p-14 text-center space-y-3">
                  <div className="flex justify-center gap-3 text-4xl">📕 📘 📄</div>
                  <p className="text-gray-600 font-medium">Arrastra aquí o haz clic para seleccionar</p>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {['PDF', 'DOCX', 'TXT', 'MD'].map(f => (
                      <span key={f} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">.{f.toLowerCase()}</span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">PDF hasta 20 MB · DOCX, TXT, MD sin límite práctico</p>
                </div>
              )}
            </div>
          )}

          {/* Text paste area */}
          {mode === 'text' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Pegar texto del documento</span>
                <span className="text-xs text-gray-400">{pastedText.length.toLocaleString()} caracteres</span>
              </div>
              <textarea value={pastedText} onChange={e => setPastedText(e.target.value)} rows={16}
                placeholder="Pega aquí el contenido del Business Case, alcance del producto, brief ejecutivo, propuesta comercial, correo con especificaciones, o cualquier documento relevante para el Comité de Producto..."
                className="w-full px-4 py-3 text-sm text-gray-700 focus:outline-none resize-none rounded-b-xl placeholder-gray-300" />
            </div>
          )}

          {/* Gemini API key warning */}
          {!import.meta.env.VITE_GEMINI_API_KEY && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 space-y-2">
              <p className="text-sm font-semibold text-amber-800">⚠ Gemini API Key no configurada</p>
              <p className="text-xs text-amber-700">
                Para usar el análisis IA, agrega <code className="bg-amber-100 px-1 rounded">VITE_GEMINI_API_KEY</code> en
                <strong> Settings → Secrets and variables → Actions</strong> del repositorio y haz un nuevo push a <code>main</code>.
              </p>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                className="text-xs text-amber-700 underline hover:text-amber-900">
                Obtener API Key en Google AI Studio →
              </a>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button onClick={handleAnalyze}
            disabled={step === 'analyzing' || fileLoading || (mode === 'file' ? !loadedFile : !pastedText.trim())}
            className="w-full bg-purple-600 text-white py-3.5 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 text-sm">
            {step === 'analyzing' ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analizando con Gemini — puede tardar 10-30 segundos...
              </>
            ) : (
              <>✦ Analizar con Gemini</>
            )}
          </button>
        </div>
      )}

      {/* ── RESULT STEP ───────────────────────────────────────────────────── */}
      {step === 'result' && result && (
        <div className="space-y-5">

          {/* Summary hero */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 flex-1 min-w-0">
                <p className="text-xs text-purple-200 uppercase tracking-wider font-medium">Producto Identificado</p>
                <h2 className="text-xl font-bold leading-tight">{result.productName}</h2>
                <p className="text-purple-100 text-sm leading-relaxed mt-2">{result.executiveSummary}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center shrink-0">
                <div className="bg-white/20 rounded-xl px-4 py-3">
                  <div className="text-3xl font-bold">{result.risks.length}</div>
                  <div className="text-xs text-purple-200 mt-0.5">Riesgos</div>
                </div>
                <div className={`rounded-xl px-4 py-3 ${redFlagCount > 0 ? 'bg-red-500/50' : 'bg-white/20'}`}>
                  <div className="text-3xl font-bold">{redFlagCount}</div>
                  <div className="text-xs text-purple-200 mt-0.5">Red Flags</div>
                </div>
                <div className={`rounded-xl px-4 py-3 ${highRiskCount > 0 ? 'bg-orange-400/40' : 'bg-white/20'}`}>
                  <div className="text-3xl font-bold">{highRiskCount}</div>
                  <div className="text-xs text-purple-200 mt-0.5">Alto/Muy Alto</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Metadata column */}
            <div className="space-y-4">
              <InfoCard title="Descripción">
                <p className="text-sm text-gray-700 leading-relaxed">{result.productDescription}</p>
              </InfoCard>

              <InfoCard title="Empresas Afectadas">
                <div className="flex flex-wrap gap-1.5">
                  {result.affectedCompanies.length
                    ? result.affectedCompanies.map(c => <span key={c} className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-medium">{c}</span>)
                    : <span className="text-xs text-gray-400">No identificadas</span>}
                </div>
              </InfoCard>

              <InfoCard title="Procesos Afectados">
                <ul className="space-y-1">
                  {result.affectedProcesses.map((p, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-gray-300 shrink-0">▸</span>{p}</li>
                  ))}
                </ul>
              </InfoCard>

              <InfoCard title="Recomendaciones previas al Gate 1">
                <ul className="space-y-2">
                  {result.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-purple-400 font-bold shrink-0">{i + 1}.</span>{r}
                    </li>
                  ))}
                </ul>
              </InfoCard>

              <InfoCard title="Principios Gate 1">
                <div className="space-y-2">
                  {result.gate1Principles.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                      <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs mt-0.5 font-bold ${p.compliant ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                        {p.compliant ? '✓' : '✗'}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-gray-700 leading-tight">{p.principle}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.justification}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </InfoCard>
            </div>

            {/* Risks column */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-semibold text-gray-700 text-sm">
                  Riesgos identificados
                  <span className="ml-2 text-xs font-normal text-gray-400">({selectedRisks.size}/{result.risks.length} para importar)</span>
                </h3>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => setSelectedRisks(new Set(result.risks.map((_, i) => i)))} className="text-brand hover:underline">Todos</button>
                  <button onClick={() => setSelectedRisks(new Set())} className="text-gray-400 hover:underline">Ninguno</button>
                  <button onClick={() => setSelectedRisks(new Set(
                    result.risks.map((r, i) => (r.isRedFlag || r.riskLevel === 'muy_alto' || r.riskLevel === 'alto') ? i : -1).filter(i => i >= 0)
                  ))} className="text-orange-500 hover:underline">Solo altos/red flags</button>
                </div>
              </div>

              <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                {result.risks.map((risk, i) => (
                  <div key={i} onClick={() => {
                    setSelectedRisks(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
                  }} className={`border rounded-xl p-4 cursor-pointer transition-all select-none
                    ${selectedRisks.has(i) ? RISK_COLORS[risk.riskLevel as RiskLevel] + ' shadow-sm' : 'bg-white border-gray-100 opacity-50 hover:opacity-75'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-colors ${selectedRisks.has(i) ? 'bg-brand border-brand' : 'border-gray-300 bg-white'}`}>
                        {selectedRisks.has(i) && <span className="text-white text-xs font-bold leading-none">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${RISK_COLORS[risk.riskLevel as RiskLevel]} ${RISK_TEXT[risk.riskLevel as RiskLevel]}`}>
                              {RISK_LEVEL_LABELS[risk.riskLevel as RiskLevel]}
                            </span>
                            {risk.isRedFlag && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">🚩 Red Flag</span>}
                            <span className="text-xs text-gray-400">{risk.category}</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-gray-400 shrink-0 bg-white/60 px-1.5 py-0.5 rounded">
                            {risk.impact}×{risk.probability}={risk.impact * risk.probability}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-800 text-sm mt-1.5 leading-tight">{risk.title}</p>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{risk.description}</p>
                        {risk.suggestedControl && (
                          <div className="mt-2 bg-white/70 rounded-lg px-3 py-1.5 border border-white/50">
                            <p className="text-xs text-gray-500 leading-relaxed">
                              <span className="font-medium text-gray-600">Control: </span>{risk.suggestedControl}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Import panel */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-700">Crear producto e importar riesgos</h3>
              <p className="text-xs text-gray-400 mt-0.5">Se creará el producto <strong>{result.productName}</strong> en Gate 1 con los {selectedRisks.size} riesgos seleccionados y los principios evaluados.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 shrink-0">Owner / Responsable:</label>
              <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
                placeholder="Nombre del responsable del producto"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand max-w-xs" />
            </div>

            {imported ? (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                ✅ Producto creado con {selectedRisks.size} riesgos importados. Redirigiendo a la ficha...
              </div>
            ) : (
              <div className="flex gap-3 flex-wrap">
                <button onClick={handleImport} disabled={importing || selectedRisks.size === 0}
                  className="bg-brand text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors flex items-center gap-2">
                  {importing ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Importando...</>
                  ) : (
                    <>⬇ Importar {selectedRisks.size} riesgo{selectedRisks.size !== 1 ? 's' : ''}</>
                  )}
                </button>
                <button onClick={reset} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                  Descartar y volver
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}
