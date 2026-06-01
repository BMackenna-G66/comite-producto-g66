import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeDocument, DocumentAnalysisResult } from '../services/geminiService';
import { createProduct, createRisk } from '../services/firestore';
import { RISK_LEVEL_LABELS, RiskLevel, riskLevelFromScore, COMPANIES } from '../types';

type Step = 'input' | 'analyzing' | 'result';

const RISK_COLORS: Record<RiskLevel, string> = {
  muy_alto: 'border-red-300 bg-red-50',
  alto: 'border-orange-300 bg-orange-50',
  moderado: 'border-yellow-300 bg-yellow-50',
  bajo: 'border-blue-200 bg-blue-50',
  muy_bajo: 'border-green-200 bg-green-50',
};
const RISK_TEXT: Record<RiskLevel, string> = {
  muy_alto: 'text-red-700',
  alto: 'text-orange-700',
  moderado: 'text-yellow-700',
  bajo: 'text-blue-700',
  muy_bajo: 'text-green-700',
};

export default function DocumentAnalysisPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('input');
  const [inputMode, setInputMode] = useState<'text' | 'file'>('text');
  const [documentText, setDocumentText] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);

  // Selection state for import
  const [selectedRisks, setSelectedRisks] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [createAsProduct, setCreateAsProduct] = useState(true);
  const [ownerName, setOwnerName] = useState('');

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'txt' || ext === 'md') {
      const text = await file.text();
      setDocumentText(text);
    } else if (ext === 'pdf') {
      // PDF: read as text via FileReader — browser can't parse PDF natively,
      // so we send the raw binary as base64 and let Gemini handle it
      const reader = new FileReader();
      reader.onload = () => {
        // Just use filename + placeholder — user will need txt/md for full parse
        setDocumentText(`[Archivo PDF cargado: ${file.name}]\n\nNota: para mejor análisis, pega el texto del documento directamente.`);
      };
      reader.readAsText(file);
    } else {
      const text = await file.text();
      setDocumentText(text);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleAnalyze = async () => {
    if (!documentText.trim()) {
      setError('Por favor ingresa o carga un documento para analizar.');
      return;
    }
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      setError('La API Key de Gemini no está configurada. Agrega VITE_GEMINI_API_KEY en los secrets del repositorio.');
      return;
    }
    setError('');
    setStep('analyzing');
    try {
      const res = await analyzeDocument(documentText);
      setResult(res);
      setSelectedRisks(new Set(res.risks.map((_, i) => i)));
      setStep('result');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al analizar con IA');
      setStep('input');
    }
  };

  const toggleRisk = (i: number) => {
    setSelectedRisks(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleImport = async () => {
    if (!result) return;
    setImporting(true);
    try {
      let productId: string | null = null;

      if (createAsProduct) {
        productId = await createProduct({
          name: result.productName,
          description: result.productDescription,
          businessCase: documentText.slice(0, 2000),
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
            result.gate1Principles.map(p => [
              p.principle,
              { compliant: p.compliant ?? false, observations: p.justification },
            ])
          ),
        });
      }

      if (productId) {
        const risksToImport = result.risks.filter((_, i) => selectedRisks.has(i));
        for (const r of risksToImport) {
          const impact = Math.min(5, Math.max(1, Math.round(r.impact))) as 1|2|3|4|5;
          const probability = Math.min(5, Math.max(1, Math.round(r.probability))) as 1|2|3|4|5;
          const score = impact * probability;
          await createRisk({
            productId,
            title: r.title,
            description: r.description,
            category: r.category,
            macroprocess: result.affectedProcesses[0] ?? '',
            process: '',
            impact,
            probability,
            inherentRisk: score,
            riskLevel: riskLevelFromScore(score),
            roamStatus: 'Owned',
            owner: ownerName || 'Análisis IA',
            mitigationPlan: r.suggestedControl,
            control: r.suggestedControl,
            isRedFlag: r.isRedFlag,
          });
        }
        setImported(true);
        setTimeout(() => navigate(`/products/${productId}`), 1500);
      }
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('input');
    setResult(null);
    setDocumentText('');
    setFileName('');
    setError('');
    setImported(false);
    setSelectedRisks(new Set());
  };

  const redFlagCount = result?.risks.filter(r => r.isRedFlag).length ?? 0;
  const highRiskCount = result?.risks.filter(r => r.riskLevel === 'muy_alto' || r.riskLevel === 'alto').length ?? 0;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Análisis de Documentos con IA</h1>
          <p className="text-gray-500 text-sm mt-1">
            Sube un Business Case, alcance o brief — Gemini extrae riesgos, productos afectados y evaluación de principios.
          </p>
        </div>
        {step === 'result' && (
          <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
            ← Nuevo análisis
          </button>
        )}
      </div>

      {/* STEP 1: INPUT */}
      {(step === 'input' || step === 'analyzing') && (
        <div className="space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            {(['text', 'file'] as const).map(m => (
              <button key={m} onClick={() => setInputMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${inputMode === m ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:border-brand'}`}>
                {m === 'text' ? '✏ Pegar texto' : '📎 Subir archivo'}
              </button>
            ))}
          </div>

          {inputMode === 'text' ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Documento / Business Case</span>
                <span className="text-xs text-gray-400">{documentText.length} caracteres</span>
              </div>
              <textarea
                value={documentText}
                onChange={e => setDocumentText(e.target.value)}
                rows={16}
                placeholder="Pega aquí el texto del Business Case, alcance del producto, brief ejecutivo, propuesta comercial o cualquier documento relevante...

Ejemplo:
- Descripción del producto o servicio
- Objetivo comercial y mercado objetivo
- Empresas del grupo involucradas
- Canales de distribución
- Requerimientos técnicos y regulatorios
- Estimación de clientes/volumen"
                className="w-full px-4 py-3 text-sm text-gray-700 focus:outline-none resize-none rounded-b-xl placeholder-gray-300"
              />
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className={`bg-white rounded-xl border-2 border-dashed shadow-sm p-12 text-center cursor-pointer transition-colors ${fileName ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-brand hover:bg-gray-50'}`}
            >
              <input ref={fileRef} type="file" accept=".txt,.md,.csv,.pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {fileName ? (
                <div className="space-y-2">
                  <div className="text-4xl">📄</div>
                  <p className="font-medium text-brand">{fileName}</p>
                  <p className="text-xs text-gray-400">{documentText.length} caracteres cargados</p>
                  <button onClick={e => { e.stopPropagation(); setFileName(''); setDocumentText(''); }}
                    className="text-xs text-red-500 hover:underline">Quitar archivo</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-4xl">☁</div>
                  <p className="text-gray-600 font-medium">Arrastra un archivo o haz clic</p>
                  <p className="text-xs text-gray-400">Soporta .txt, .md, .csv, .pdf</p>
                </div>
              )}
            </div>
          )}

          {/* API Key warning */}
          {!import.meta.env.VITE_GEMINI_API_KEY && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">⚠ Gemini API Key no configurada</p>
              <p>Para usar el análisis IA, agrega <code>VITE_GEMINI_API_KEY</code> en <strong>Settings → Secrets → Actions</strong> del repositorio y haz un nuevo deploy.</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={step === 'analyzing' || !documentText.trim()}
            className="w-full bg-purple-600 text-white py-3 rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {step === 'analyzing' ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analizando con Gemini...
              </>
            ) : (
              <>✦ Analizar con Gemini</>
            )}
          </button>
        </div>
      )}

      {/* STEP 2: RESULT */}
      {step === 'result' && result && (
        <div className="space-y-5">

          {/* Executive summary card */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs text-purple-200 uppercase tracking-wider font-medium">Producto Identificado</p>
                <h2 className="text-xl font-bold">{result.productName}</h2>
                <p className="text-purple-100 text-sm leading-relaxed mt-2">{result.executiveSummary}</p>
              </div>
              <div className="shrink-0 grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/20 rounded-lg px-3 py-2">
                  <div className="text-2xl font-bold">{result.risks.length}</div>
                  <div className="text-xs text-purple-200">Riesgos</div>
                </div>
                <div className={`rounded-lg px-3 py-2 ${redFlagCount > 0 ? 'bg-red-500/40' : 'bg-white/20'}`}>
                  <div className="text-2xl font-bold">{redFlagCount}</div>
                  <div className="text-xs text-purple-200">Red Flags</div>
                </div>
                <div className={`rounded-lg px-3 py-2 ${highRiskCount > 0 ? 'bg-orange-400/40' : 'bg-white/20'}`}>
                  <div className="text-2xl font-bold">{highRiskCount}</div>
                  <div className="text-xs text-purple-200">Alto/Muy Alto</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Left: metadata */}
            <div className="space-y-4">

              {/* Description */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Descripción</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{result.productDescription}</p>
              </div>

              {/* Affected companies */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Empresas Afectadas</h3>
                <div className="flex flex-wrap gap-1.5">
                  {result.affectedCompanies.length ? result.affectedCompanies.map(c => (
                    <span key={c} className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-medium">{c}</span>
                  )) : <span className="text-xs text-gray-400">No identificadas</span>}
                </div>
              </div>

              {/* Affected processes */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Procesos Afectados</h3>
                <ul className="space-y-1">
                  {result.affectedProcesses.map((p, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-gray-300 mt-0.5">▸</span>{p}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendations */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recomendaciones Previas</h3>
                <ul className="space-y-2">
                  {result.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-purple-400 font-bold mt-0.5">{i + 1}.</span>{r}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Gate 1 Principles */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Principios Gate 1</h3>
                <div className="space-y-2">
                  {result.gate1Principles.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                      <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs mt-0.5 ${p.compliant === true ? 'bg-green-100 text-green-600' : p.compliant === false ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                        {p.compliant === true ? '✓' : p.compliant === false ? '✗' : '?'}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-gray-700">{p.principle}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.justification}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: risks */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">
                  Riesgos Identificados
                  <span className="ml-2 text-xs font-normal text-gray-400">({selectedRisks.size} de {result.risks.length} seleccionados para importar)</span>
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedRisks(new Set(result.risks.map((_, i) => i)))} className="text-xs text-brand hover:underline">Todos</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setSelectedRisks(new Set())} className="text-xs text-gray-400 hover:underline">Ninguno</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setSelectedRisks(new Set(result.risks.map((r, i) => r.isRedFlag || r.riskLevel === 'muy_alto' || r.riskLevel === 'alto' ? i : -1).filter(i => i >= 0)))}
                    className="text-xs text-orange-500 hover:underline">Solo altos</button>
                </div>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {result.risks.map((risk, i) => (
                  <div
                    key={i}
                    onClick={() => toggleRisk(i)}
                    className={`border rounded-xl p-4 cursor-pointer transition-all ${selectedRisks.has(i) ? RISK_COLORS[risk.riskLevel as RiskLevel] + ' ring-1 ring-inset ring-current/20' : 'bg-white border-gray-200 opacity-60'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-colors ${selectedRisks.has(i) ? 'bg-brand border-brand' : 'border-gray-300 bg-white'}`}>
                        {selectedRisks.has(i) && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_COLORS[risk.riskLevel as RiskLevel]} ${RISK_TEXT[risk.riskLevel as RiskLevel]}`}>
                              {RISK_LEVEL_LABELS[risk.riskLevel as RiskLevel]}
                            </span>
                            {risk.isRedFlag && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">🚩 Red Flag</span>
                            )}
                            <span className="text-xs text-gray-400">{risk.category}</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-gray-500 shrink-0">
                            {risk.impact}×{risk.probability}={risk.impact * risk.probability}
                          </span>
                        </div>
                        <p className="font-medium text-gray-800 text-sm mt-1">{risk.title}</p>
                        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{risk.description}</p>
                        {risk.suggestedControl && (
                          <div className="mt-2 bg-white/60 rounded-lg px-3 py-1.5">
                            <p className="text-xs text-gray-500"><span className="font-medium">Control sugerido:</span> {risk.suggestedControl}</p>
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
            <h3 className="font-semibold text-gray-700">Importar al Sistema</h3>

            <div className="flex items-start gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={createAsProduct} onChange={e => setCreateAsProduct(e.target.checked)}
                  className="w-4 h-4 text-brand rounded border-gray-300 focus:ring-brand" />
                <span className="text-sm text-gray-700">Crear producto <strong>{result.productName}</strong> con los riesgos seleccionados</span>
              </label>
            </div>

            {createAsProduct && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 shrink-0">Owner / Responsable:</label>
                <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
                  placeholder="Nombre del responsable del producto"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand max-w-xs" />
              </div>
            )}

            {imported ? (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                <span>✅</span> Producto y {selectedRisks.size} riesgos importados correctamente. Redirigiendo...
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleImport}
                  disabled={importing || !createAsProduct || selectedRisks.size === 0}
                  className="bg-brand text-white px-5 py-2.5 rounded-xl font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {importing ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importando...</>
                  ) : (
                    <>⬇ Importar {selectedRisks.size} riesgo{selectedRisks.size !== 1 ? 's' : ''}</>
                  )}
                </button>
                <button onClick={reset} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                  Descartar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
