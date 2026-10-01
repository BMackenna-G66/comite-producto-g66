import { useRef, useState } from 'react';
import { Product, RequirementAnswer } from '../types';
import { REQUIREMENT_AREAS, ANSWER_OPTIONS, RequirementQuestion, areaQuestions, mergeAIAnswers } from '../requirementsCatalog';
import { answerRequirements } from '../services/geminiService';
import { updateRequirementAnswers } from '../services/firestore';
import { LoadedFile, loadScopeDocument, toScopeInput, ACCEPTED_SCOPE_EXTENSIONS, ScopeDocInput } from '../services/scopeDocument';
import { useAuth } from '../hooks/useAuth';

interface Props {
  product: Product;
  onProductChange: (update: (p: Product) => Product) => void;
}

const isAnswered = (a?: RequirementAnswer) => !!a?.answer.trim();

const OPTION_COLORS: Record<string, string> = {
  SI: 'bg-green-100 text-green-700',
  NO: 'bg-gray-100 text-gray-700',
  IN: 'bg-blue-100 text-blue-700',
  OUT: 'bg-blue-100 text-blue-700',
  'IN/OUT': 'bg-blue-100 text-blue-700',
};

export default function RequirementsTab({ product, onProductChange }: Props) {
  const { user } = useAuth();
  const answers = product.requirements ?? {};
  const [areaId, setAreaId] = useState(REQUIREMENT_AREAS[0].id);
  const area = REQUIREMENT_AREAS.find(a => a.id === areaId)!;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ answer: '', detail: '' });
  const [savingId, setSavingId] = useState<string | null>(null);

  const [showReanalysis, setShowReanalysis] = useState(false);
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const allQuestions = REQUIREMENT_AREAS.flatMap(areaQuestions);
  const totalAnswered = allQuestions.filter(q => isAnswered(answers[q.id])).length;

  const startEdit = (q: RequirementQuestion) => {
    const current = answers[q.id];
    setDraft({ answer: current?.answer ?? '', detail: current?.detail ?? '' });
    setEditingId(q.id);
  };

  const saveEdit = async (qid: string) => {
    const value: RequirementAnswer = {
      answer: draft.answer.trim(),
      detail: draft.detail.trim(),
      origin: 'manual',
      updatedAt: new Date().toISOString(),
      updatedByName: user?.name ?? 'Usuario',
    };
    setSavingId(qid);
    try {
      await updateRequirementAnswers(product.id, { [qid]: value });
      onProductChange(p => ({ ...p, requirements: { ...(p.requirements ?? {}), [qid]: value } }));
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  };

  const handleFile = async (f: File) => {
    setError('');
    setFileLoading(true);
    try {
      setFile(await loadScopeDocument(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el archivo');
    } finally {
      setFileLoading(false);
    }
  };

  const handleReanalyze = async () => {
    let input: ScopeDocInput;
    if (inputMode === 'file') {
      if (!file) { setError('Carga el documento de alcance.'); return; }
      input = toScopeInput(file);
    } else {
      if (!pastedText.trim()) { setError('Pega el texto del documento de alcance.'); return; }
      input = { kind: 'text', text: pastedText };
    }
    setError('');
    setSummary('');
    setAnalyzing(true);
    try {
      const aiAnswers = await answerRequirements(input, { name: product.name, description: product.description });
      if (aiAnswers.length === 0) throw new Error('La IA no devolvió respuestas. Intenta nuevamente.');
      const merged = mergeAIAnswers(aiAnswers, product.requirements);
      const extra = {
        requirementsAnalyzedAt: new Date().toISOString(),
        requirementsSourceDoc: inputMode === 'file' && file ? file.name : 'Texto pegado',
      };
      await updateRequirementAnswers(product.id, merged, extra);
      onProductChange(p => ({ ...p, ...extra, requirements: { ...(p.requirements ?? {}), ...merged } }));
      const kept = aiAnswers.length - Object.keys(merged).length;
      const answered = Object.values(merged).filter(isAnswered).length;
      setSummary(`✅ ${answered} preguntas respondidas por la IA${kept > 0 ? ` · ${kept} editadas a mano se conservaron` : ''}.`);
      setShowReanalysis(false);
      setFile(null);
      setPastedText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al analizar el documento');
    } finally {
      setAnalyzing(false);
    }
  };

  const neverAnalyzed = !product.requirementsAnalyzedAt;

  return (
    <div className="space-y-4">
      {/* Encabezado + reanálisis */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-800">Requerimientos del Comité</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Preguntas por área (AML, Fraude, Legal, PDP, SICB) que la IA responde a partir del documento de alcance. Cada responsable valida o corrige su respuesta.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {totalAnswered} de {allQuestions.length} respondidas
              {product.requirementsAnalyzedAt && (
                <> · Último análisis IA: {new Date(product.requirementsAnalyzedAt).toLocaleString('es-CL')}
                  {product.requirementsSourceDoc && <> ({product.requirementsSourceDoc})</>}</>
              )}
            </p>
          </div>
          <button
            onClick={() => { setShowReanalysis(s => !s); setError(''); }}
            className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 shrink-0"
          >
            {neverAnalyzed ? '✦ Analizar documento de alcance' : '🔄 Reanalizar'}
          </button>
        </div>

        {summary && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{summary}</p>}

        {showReanalysis && (
          <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              {(['file', 'text'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setInputMode(m)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border ${inputMode === m ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                  {m === 'file' ? '📄 Subir archivo' : '📝 Pegar texto'}
                </button>
              ))}
            </div>

            {inputMode === 'file' ? (
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                className="border-2 border-dashed border-purple-200 rounded-lg p-4 text-center cursor-pointer hover:bg-white"
              >
                <input
                  ref={fileRef} type="file" accept={ACCEPTED_SCOPE_EXTENSIONS} className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                />
                {fileLoading ? (
                  <p className="text-xs text-gray-500">Cargando archivo...</p>
                ) : file ? (
                  <p className="text-sm text-gray-700">📎 {file.name} <span className="text-xs text-gray-400">({file.sizeLabel})</span></p>
                ) : (
                  <p className="text-xs text-gray-500">Arrastra o haz click para cargar el documento de alcance (PDF, DOCX, TXT o MD)</p>
                )}
              </div>
            ) : (
              <textarea
                rows={5} value={pastedText} onChange={e => setPastedText(e.target.value)}
                placeholder="Pega aquí el contenido del documento de alcance..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              />
            )}

            <p className="text-xs text-gray-500">Las respuestas editadas a mano se conservan; la IA solo completa o actualiza las demás.</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowReanalysis(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancelar</button>
              <button
                onClick={handleReanalyze}
                disabled={analyzing || fileLoading}
                className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {analyzing ? 'Analizando con IA...' : 'Analizar y responder'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hojas del Excel */}
      <div className="flex gap-2 flex-wrap">
        {REQUIREMENT_AREAS.map(a => {
          const qs = areaQuestions(a);
          const done = qs.filter(q => isAnswered(answers[q.id])).length;
          return (
            <button
              key={a.id}
              onClick={() => { setAreaId(a.id); setEditingId(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${a.id === areaId ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {a.label} <span className="opacity-70">({done}/{qs.length})</span>
              {a.inConstruction && <span className="ml-1 opacity-70">· en construcción</span>}
            </button>
          );
        })}
      </div>

      {area.sections.map(section => (
        <div key={section.title} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700">{section.title}</h4>
            {section.note && <p className="text-xs text-gray-500 mt-0.5">{section.note}</p>}
          </div>
          <div className="divide-y divide-gray-50">
            {section.questions.map(q => {
              const a = answers[q.id];
              const editing = editingId === q.id;
              return (
                <div key={q.id} className="px-5 py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{q.question}</p>
                      {q.hint && <p className="text-xs text-gray-400">{q.hint}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] uppercase tracking-wide text-gray-400">{q.owner}</span>
                      {!editing && (
                        <button onClick={() => startEdit(q)} className="text-xs text-brand hover:underline">Editar</button>
                      )}
                    </div>
                  </div>

                  {editing ? (
                    <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                      {q.type === 'texto' ? (
                        <textarea
                          rows={3} value={draft.answer} onChange={e => setDraft(d => ({ ...d, answer: e.target.value }))}
                          placeholder="Respuesta"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                      ) : (
                        <select
                          value={draft.answer} onChange={e => setDraft(d => ({ ...d, answer: e.target.value }))}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                        >
                          <option value="">Sin respuesta</option>
                          {ANSWER_OPTIONS[q.type].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                      <textarea
                        rows={2} value={draft.detail} onChange={e => setDraft(d => ({ ...d, detail: e.target.value }))}
                        placeholder="Detalle / evidencia (país, sociedad, fuente...)"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 px-3 py-1">Cancelar</button>
                        <button
                          onClick={() => saveEdit(q.id)} disabled={savingId === q.id}
                          className="bg-brand text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-brand-dark disabled:opacity-50"
                        >
                          {savingId === q.id ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {isAnswered(a) ? (
                        q.type === 'texto' ? (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{a!.answer}</p>
                        ) : (
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${OPTION_COLORS[a!.answer] ?? 'bg-gray-100 text-gray-700'}`}>{a!.answer}</span>
                        )
                      ) : (
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Sin respuesta</span>
                      )}
                      {a?.detail && <p className="text-xs text-gray-500 whitespace-pre-wrap">{a.detail}</p>}
                      {a && (
                        <p className="text-[10px] text-gray-400">
                          {a.origin === 'ia' ? '✦ Respuesta IA' : `✎ Editado por ${a.updatedByName}`} · {new Date(a.updatedAt).toLocaleString('es-CL')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
