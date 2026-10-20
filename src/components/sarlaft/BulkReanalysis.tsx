import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../../types';
import { SarlaftMatrix, SarlaftProductRisk } from '../../sarlaft/types';
import { buildSarlaftAnalysis } from '../../sarlaft/analysis';
import { persistSarlaftAnalysis } from '../../sarlaft/persist';
import { fillMissingAIAnswers } from '../../requirementsCatalog';
import { getProduct, getRisks, getSarlaftRisks, updateRequirementAnswers } from '../../services/firestore';
import { analyzeSarlaft, answerRequirements } from '../../services/geminiService';
import { ACCEPTED_SCOPE_EXTENSIONS, loadScopeDocument, toScopeInput } from '../../services/scopeDocument';

// Reanálisis masivo de productos existentes con sus documentos de alcance.
// Garantías: nunca crea productos (solo actualiza los que ya existen) y nunca
// borra nada: en Requerimientos solo completa preguntas sin respuesta, y el
// cruce SARLAFT se omite en productos que ya tienen riesgos SARLAFT.

type RowStatus = 'pendiente' | 'en_curso' | 'listo' | 'omitido' | 'error';

interface Row {
  key: string;
  file: File;
  productId: string;
  matchReason: string;
  doRequirements: boolean;
  doSarlaft: boolean;
  status: RowStatus;
  message: string;
}

interface Props {
  products: Product[];
  sarlaftRisks: SarlaftProductRisk[];
  matrix: SarlaftMatrix | null;
  onDone: () => void;
}

const STOP = new Set(['de', 'la', 'el', 'en', 'para', 'y', 'con', 'por', 'los', 'las', 'del', 'a', 'al', 'e']);
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\.(pdf|docx|txt|md|csv)$/, '')
    .replace(/\(\d+\)/g, ' ')
    .replace(/^\s*(documento de alcance|business case|da|bc)\s*[-_:]\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const tokens = (s: string) => new Set(norm(s).split(' ').filter(t => t.length > 1 && !STOP.has(t)));

// 1) Archivo registrado como origen del producto; 2) similitud de nombre.
const matchProduct = (file: File, products: Product[]): { productId: string; reason: string } => {
  const exact = products.find(p =>
    p.businessCase?.includes(`Extraído de: ${file.name}`) ||
    p.requirementsSourceDoc === file.name ||
    p.sarlaftAnalysis?.sourceDoc === file.name);
  if (exact) return { productId: exact.id, reason: 'Documento registrado como origen del producto' };
  const ft = tokens(file.name);
  let best: { p: Product; score: number } | null = null;
  for (const p of products) {
    const pt = tokens(p.name);
    if (!pt.size || !ft.size) continue;
    const common = [...ft].filter(t => pt.has(t)).length;
    const score = common / Math.min(ft.size, pt.size);
    if (!best || score > best.score) best = { p, score };
  }
  return best && best.score >= 0.6
    ? { productId: best.p.id, reason: `Nombre similar (${Math.round(best.score * 100)}%)` }
    : { productId: '', reason: 'Sin coincidencia: elige el producto' };
};

const STATUS_STYLE: Record<RowStatus, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  en_curso: 'bg-blue-100 text-blue-700',
  listo: 'bg-green-100 text-green-700',
  omitido: 'bg-gray-100 text-gray-500',
  error: 'bg-red-100 text-red-700',
};

export default function BulkReanalysis({ products, sarlaftRisks, matrix, onDone }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasSarlaft = (productId: string) =>
    sarlaftRisks.some(r => r.productId === productId) || !!products.find(p => p.id === productId)?.sarlaftAnalysis;

  // Evita cerrar la pestaña con el proceso a medias.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const addFiles = (files: FileList) => {
    setRows(prev => {
      const next = [...prev];
      for (const file of Array.from(files)) {
        if (next.some(r => r.file.name === file.name)) continue;
        const { productId, reason } = matchProduct(file, products);
        // Un producto se procesa una sola vez: si ya está asignado a otro
        // archivo, este queda sin asignar.
        const taken = productId && next.some(r => r.productId === productId);
        next.push({
          key: `${file.name}-${file.size}`, file,
          productId: taken ? '' : productId,
          matchReason: taken ? 'Ese producto ya tiene otro documento asignado' : reason,
          doRequirements: true,
          doSarlaft: !!matrix,
          status: 'pendiente', message: '',
        });
      }
      return next;
    });
  };

  const update = (key: string, patch: Partial<Row>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const assigned = rows.filter(r => r.productId);
  const duplicated = new Set(assigned.map(r => r.productId).filter((id, i, arr) => arr.indexOf(id) !== i));
  const runnable = assigned.filter(r => r.status === 'pendiente' && (r.doRequirements || (r.doSarlaft && !hasSarlaft(r.productId))));

  const run = async () => {
    setRunning(true);
    for (const row of runnable) {
      update(row.key, { status: 'en_curso', message: 'Leyendo documento' });
      const notes: string[] = [];
      try {
        // Se relee el producto para trabajar sobre su estado actual.
        const product = await getProduct(row.productId);
        if (!product) throw new Error('El producto ya no existe');
        const input = toScopeInput(await loadScopeDocument(row.file));
        const ctx = { name: product.name, description: product.description };

        if (row.doRequirements) {
          update(row.key, { message: 'Respondiendo requerimientos' });
          const ai = await answerRequirements(input, ctx);
          const filled = fillMissingAIAnswers(ai, product.requirements);
          const answered = Object.values(filled).filter(a => a.answer.trim()).length;
          if (Object.keys(filled).length > 0) {
            await updateRequirementAnswers(row.productId, filled,
              product.requirementsAnalyzedAt ? {} : { requirementsAnalyzedAt: new Date().toISOString(), requirementsSourceDoc: row.file.name });
          }
          notes.push(`Requerimientos: ${answered} respuestas nuevas (las existentes se conservaron)`);
        }

        if (row.doSarlaft && matrix) {
          // Chequeo fresco justo antes de escribir: si ya hay riesgos SARLAFT
          // (de otro análisis o de otro usuario), no se toca nada.
          const existing = await getSarlaftRisks(row.productId);
          if (existing.length > 0 || product.sarlaftAnalysis) {
            notes.push('SARLAFT: omitido, el producto ya tiene riesgos SARLAFT');
          } else {
            const operational = await getRisks(row.productId);
            const opRisks = operational.map(r => ({ id: r.id, title: r.title, category: r.category }));
            const ai = await analyzeSarlaft(input, matrix, ctx, opRisks, msg => update(row.key, { message: `SARLAFT: ${msg}` }));
            const output = buildSarlaftAnalysis(ai, matrix, row.productId, row.file.name, opRisks.map(r => r.id));
            const saved = await persistSarlaftAnalysis(row.productId, output, []);
            notes.push(`SARLAFT: ${output.summary.cross.filter(c => c.applies !== 'no_aplica').length} de ${output.summary.cross.length} riesgos aplican, ${saved.length} cargados`);
          }
        }
        update(row.key, { status: 'listo', message: notes.join(' · ') });
      } catch (e) {
        notes.push(e instanceof Error ? e.message : 'Error desconocido');
        update(row.key, { status: 'error', message: notes.join(' · ') });
      }
    }
    setRunning(false);
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-2">
        <h3 className="font-semibold text-gray-800">Reanálisis masivo de productos existentes</h3>
        <p className="text-xs text-gray-500">
          Carga los documentos de alcance; cada uno se asocia a su producto y se ejecutan el cuestionario de Requerimientos y el cruce SARLAFT.
        </p>
        <ul className="text-xs text-gray-500 list-disc pl-5 space-y-0.5">
          <li>No crea productos: solo actualiza los que ya existen.</li>
          <li>No borra nada: en Requerimientos solo completa preguntas sin respuesta; las existentes (IA o editadas a mano) se conservan.</li>
          <li>El cruce SARLAFT se omite en productos que ya tienen riesgos SARLAFT.</li>
          <li>Los riesgos operacionales, comentarios, enlaces y sesiones no se modifican.</li>
          <li>Toma entre 2 y 3 minutos por producto; mantén la pestaña abierta.</li>
        </ul>
        {!matrix && <p className="text-xs text-amber-700">No hay matriz SARLAFT vigente: solo se ejecutarán los Requerimientos.</p>}
        <div className="pt-1">
          <input ref={fileRef} type="file" multiple accept={ACCEPTED_SCOPE_EXTENSIONS} className="hidden"
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={running}
            className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
            📄 Agregar documentos de alcance
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Documento</th>
                  <th className="text-left px-2 py-2">Producto</th>
                  <th className="text-center px-2 py-2">Requerimientos</th>
                  <th className="text-center px-2 py-2">SARLAFT</th>
                  <th className="text-left px-2 py-2">Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => {
                  const sarlaftLocked = !matrix || (!!r.productId && hasSarlaft(r.productId));
                  return (
                    <tr key={r.key} className="align-top">
                      <td className="px-4 py-2 text-xs text-gray-700 max-w-xs break-words">{r.file.name}</td>
                      <td className="px-2 py-2 min-w-[260px]">
                        <select value={r.productId} disabled={running || r.status !== 'pendiente'}
                          onChange={e => update(r.key, { productId: e.target.value, matchReason: e.target.value ? 'Asignado a mano' : 'Sin asignar' })}
                          className={`w-full border rounded-lg px-2 py-1 text-xs ${duplicated.has(r.productId) ? 'border-red-400' : 'border-gray-200'}`}>
                          <option value="">— No procesar —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <p className={`text-[10px] mt-0.5 ${duplicated.has(r.productId) ? 'text-red-600' : 'text-gray-400'}`}>
                          {duplicated.has(r.productId) ? 'Este producto está asignado a más de un documento' : r.matchReason}
                        </p>
                      </td>
                      <td className="text-center px-2 py-2">
                        <input type="checkbox" checked={r.doRequirements} disabled={running || r.status !== 'pendiente'}
                          onChange={e => update(r.key, { doRequirements: e.target.checked })} />
                      </td>
                      <td className="text-center px-2 py-2">
                        <input type="checkbox" checked={r.doSarlaft && !sarlaftLocked} disabled={running || r.status !== 'pendiente' || sarlaftLocked}
                          onChange={e => update(r.key, { doSarlaft: e.target.checked })} />
                        {r.productId && hasSarlaft(r.productId) && <p className="text-[10px] text-gray-400">Ya tiene: se omite</p>}
                      </td>
                      <td className="px-2 py-2 text-xs max-w-sm">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${STATUS_STYLE[r.status]}`}>{r.status.replace('_', ' ')}</span>
                        {r.message && <p className="text-[11px] text-gray-500 mt-0.5">{r.message}</p>}
                        {r.status === 'listo' && r.productId && <Link to={`/products/${r.productId}`} className="text-[11px] text-brand hover:underline">Ver producto →</Link>}
                      </td>
                      <td className="px-2 py-2">
                        {!running && r.status === 'pendiente' && (
                          <button onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {runnable.length} producto(s) por procesar · {rows.filter(r => !r.productId).length} documento(s) sin asignar
            </p>
            <button onClick={run} disabled={running || runnable.length === 0 || duplicated.size > 0}
              className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
              {running ? 'Procesando...' : `Reanalizar ${runnable.length} producto(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
