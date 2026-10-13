import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllSarlaftRisks, getProducts, getSarlaftMatrix, saveSarlaftMatrix } from '../services/firestore';
import { MatrixImportResult, parseSarlaftMatrix } from '../sarlaft/matrixImport';
import { MatrixRisk, SarlaftMatrix, SarlaftProductRisk } from '../sarlaft/types';
import {
  SEVERITY_COLORS, SFC_EXPECTED_COHERENCE, coherenceIndicator, controlQuality, controlRating, valueProductRisk, valueRisk,
} from '../sarlaft/methodology';
import { Product } from '../types';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import SarlaftHeatMap from '../components/sarlaft/SarlaftHeatMap';

const valueMatrixRisk = (m: Pick<SarlaftMatrix, 'controls'>, r: MatrixRisk) => {
  const byCode = new Map(m.controls.map(c => [c.code, c]));
  return valueRisk(
    r.probability,
    { legal: r.impactLegal, financial: r.impactFinancial, contagion: r.impactContagion, reputational: r.impactReputational },
    r.rows.map(x => byCode.get(x.controlCode)).filter((c): c is NonNullable<typeof c> => !!c),
  );
};

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

function MatrixRiskTable({ matrix }: { matrix: Pick<SarlaftMatrix, 'risks' | 'controls'> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2">Riesgo</th>
            <th className="text-left px-2 py-2">Factores / productos</th>
            <th className="text-center px-2 py-2">P × I</th>
            <th className="text-center px-2 py-2">Inherente</th>
            <th className="text-center px-2 py-2">Residual</th>
            <th className="text-center px-2 py-2">Causas / controles</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {matrix.risks.map(r => {
            const v = valueMatrixRisk(matrix, r);
            const differs = r.excelResidualScore !== null && r.excelResidualScore !== v.residualScore;
            return (
              <tr key={r.code}>
                <td className="px-4 py-2 max-w-md">
                  <p className="text-xs"><span className="font-mono text-purple-700">{r.code}</span> · <span className="font-medium text-gray-700">{r.sourceCrime}</span></p>
                  <p className="text-xs text-gray-500 line-clamp-2">{r.description}</p>
                </td>
                <td className="px-2 py-2 text-[11px] text-gray-500 max-w-xs">{r.riskFactors}<br /><span className="text-gray-400">{r.products}</span></td>
                <td className="text-center px-2 text-xs">{r.probability} × {v.impact}</td>
                <td className="text-center px-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${SEVERITY_COLORS[v.inherentSeverity]}`}>{v.inherentScore} · {v.inherentSeverity}</span></td>
                <td className="text-center px-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${SEVERITY_COLORS[v.residualSeverity]}`}>{v.residualScore} · {v.residualSeverity}</span>
                  {differs && <p className="text-[10px] text-amber-600 mt-0.5" title="El residual del Excel no coincide con la fórmula de la metodología; revisar las fórmulas de la matriz en ese riesgo.">⚠ Excel: {r.excelResidualScore}</p>}
                </td>
                <td className="text-center px-2 text-xs text-gray-600">
                  {new Set(r.rows.map(x => x.causeCode).filter(Boolean)).size} / {new Set(r.rows.map(x => x.controlCode).filter(Boolean)).size}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SarlaftPage() {
  const { user } = useAuth();
  const canImport = user?.role === 'admin' || user?.role === 'member';
  const [tab, setTab] = useState<'matrix' | 'products'>('matrix');
  const [matrix, setMatrix] = useState<SarlaftMatrix | null>(null);
  const [risks, setRisks] = useState<SarlaftProductRisk[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<MatrixImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getSarlaftMatrix(), getAllSarlaftRisks(), getProducts()])
      .then(([m, r, p]) => { setMatrix(m); setRisks(r); setProducts(p); })
      .finally(() => setLoading(false));
  }, []);

  const handleFile = async (f: File) => {
    setImportError('');
    setPreview(null);
    try {
      const result = parseSarlaftMatrix(await f.arrayBuffer(), f.name);
      if (result.matrix.risks.length === 0) throw new Error(result.warnings.join(' ') || 'El archivo no contiene una matriz SARLAFT reconocible.');
      setPreview(result);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'No se pudo leer el archivo');
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    if (matrix && !confirm(`Reemplazar la matriz vigente (${matrix.version}) por ${preview.matrix.version}?`)) return;
    setSaving(true);
    try {
      const m: SarlaftMatrix = { ...preview.matrix, importedAt: new Date().toISOString(), importedByName: user?.name ?? 'Usuario' };
      await saveSarlaftMatrix(m);
      setMatrix(m);
      setPreview(null);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'No se pudo guardar la matriz');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const byProduct = products
    .map(p => ({ product: p, risks: risks.filter(r => r.productId === p.id) }))
    .filter(x => x.risks.length > 0);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Riesgos SARLAFT</h1>
        <p className="text-gray-500 text-sm mt-1">
          Riesgo LA/FT/FPADM con la metodología de la matriz SARLAFT vigente y la guía de evaluación de la SFC. Es independiente de la matriz de riesgos operacionales.
        </p>
      </div>

      <div className="flex gap-2">
        {([['matrix', 'Matriz vigente'], ['products', `Por producto (${risks.length})`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${tab === k ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
        ))}
      </div>

      {tab === 'matrix' && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-800">Matriz vigente</h3>
                {matrix ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {matrix.version} · {matrix.risks.length} riesgos, {matrix.causes.length} causas, {matrix.controls.length} controles ·
                    importada por {matrix.importedByName} el {new Date(matrix.importedAt).toLocaleString('es-CL')} ({matrix.sourceFile})
                  </p>
                ) : <p className="text-xs text-amber-700 mt-0.5">No hay matriz cargada. Importa el Excel de la matriz SARLAFT (GCCO-MAT-014).</p>}
                <p className="text-[11px] text-gray-400 mt-1">La matriz es confidencial: se guarda en la base de datos protegida por login, no en el código de la aplicación.</p>
              </div>
              {canImport && (
                <>
                  <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                  <button onClick={() => fileRef.current?.click()} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 shrink-0">
                    📥 {matrix ? 'Actualizar matriz' : 'Importar matriz'}
                  </button>
                </>
              )}
            </div>
            {importError && <p className="text-xs text-red-600">{importError}</p>}

            {preview && (
              <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-3">
                <p className="text-sm text-gray-700">
                  Vista previa: <strong>{preview.matrix.version}</strong> — {preview.matrix.risks.length} riesgos, {preview.matrix.causes.length} causas, {preview.matrix.controls.length} controles.
                </p>
                {preview.warnings.map(w => <p key={w} className="text-xs text-amber-700">⚠ {w}</p>)}
                {(() => {
                  const diffs = preview.matrix.risks.filter(r => r.excelResidualScore !== null && r.excelResidualScore !== valueMatrixRisk(preview.matrix, r).residualScore);
                  return diffs.length > 0 && (
                    <p className="text-xs text-amber-700">
                      ⚠ En {diffs.map(d => d.code).join(', ')} el residual del Excel no coincide con la fórmula de la metodología (posible error de fórmula en la matriz). La herramienta usa el cálculo de la metodología.
                    </p>
                  );
                })()}
                <div className="bg-white rounded-lg border border-gray-100"><MatrixRiskTable matrix={preview.matrix} /></div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setPreview(null)} className="text-xs text-gray-500 px-3 py-1.5">Cancelar</button>
                  <button onClick={confirmImport} disabled={saving} className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Guardar como matriz vigente'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {matrix && (
            <>
              <div className="grid md:grid-cols-2 gap-3">
                <SarlaftHeatMap title="Perfil de la entidad — inherente"
                  points={matrix.risks.map(r => { const v = valueMatrixRisk(matrix, r); return { label: r.code.replace('R-SARLAFT-', 'R'), title: r.description, probability: r.probability, impact: v.impact }; })} />
                <SarlaftHeatMap title="Perfil de la entidad — residual"
                  points={matrix.risks.map(r => { const v = valueMatrixRisk(matrix, r); return { label: r.code.replace('R-SARLAFT-', 'R'), title: r.description, probability: v.residualProbability, impact: v.residualImpact }; })} />
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100"><h4 className="text-sm font-semibold text-gray-700">Riesgos de la matriz</h4></div>
                <MatrixRiskTable matrix={matrix} />
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => setShowCatalog(s => !s)} className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Controles y causas de la matriz <span className="text-gray-400">{showCatalog ? '▾' : '▸'}</span>
                </button>
                {showCatalog && (
                  <div className="border-t border-gray-100 space-y-4 p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-[11px] text-gray-500 uppercase"><tr>
                          <th className="text-left py-1">Control</th><th>Tipo</th><th>Naturaleza</th><th>Periodicidad</th><th>Responsabilidad</th><th>Formalidad</th><th>Calidad</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {matrix.controls.map(c => {
                            const q = controlQuality(c);
                            return (
                              <tr key={c.code}>
                                <td className="py-1.5 pr-2"><span className="font-mono text-purple-700">{c.code}</span> {c.name}</td>
                                <td className="text-center">{c.tipo}</td><td className="text-center">{c.naturaleza}</td><td className="text-center">{c.periodicidad}</td>
                                <td className="text-center">{c.responsabilidad}</td><td className="text-center">{c.formalidad}</td>
                                <td className={`text-center font-medium ${controlRating(q) === 'DEBIL' ? 'text-red-600' : controlRating(q) === 'BUENO' ? 'text-yellow-700' : 'text-green-700'}`}>{q} · {controlRating(q)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="space-y-2">
                      {matrix.causes.map(c => (
                        <p key={c.code} className="text-xs text-gray-600"><span className="font-mono text-gray-700">{c.code}</span> <span className="text-gray-400">[{c.factor} · {c.tipo}]</span> {c.text}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'products' && (
        byProduct.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">
            Ningún producto tiene riesgos SARLAFT todavía. Se generan con "Analizar SARLAFT" en la pestaña SARLAFT de cada producto.
          </div>
        ) : (
          <div className="space-y-3">
            {byProduct.map(({ product, risks: pr }) => {
              const coh = coherenceIndicator(pr);
              const valued = pr.map(r => ({ r, v: valueProductRisk(r) }));
              return (
                <div key={product.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                    <Link to={`/products/${product.id}`} className="text-sm font-semibold text-gray-800 hover:text-brand">{product.name}</Link>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{pr.length} riesgos</span>
                      <span className="text-red-600">{valued.filter(x => x.v.residualAcceptability === 'INACEPTABLE').length} residual inaceptable</span>
                      <span className={coh !== null && coh < SFC_EXPECTED_COHERENCE ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>Coherencia SFC {pct(coh)}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {valued.map(({ r, v }) => (
                      <div key={r.id} className="px-5 py-2 flex items-center gap-3 text-xs">
                        <span className="font-mono text-purple-700 w-24 shrink-0">{r.matrixRiskCode || 'NUEVO'}</span>
                        <span className="flex-1 min-w-0 truncate text-gray-700">{r.sourceCrime} — <span className="text-gray-500">{r.description}</span></span>
                        <span className={`px-2 py-0.5 rounded-full shrink-0 ${SEVERITY_COLORS[v.inherentSeverity]}`}>Inh. {v.inherentScore}</span>
                        <span className={`px-2 py-0.5 rounded-full shrink-0 ${SEVERITY_COLORS[v.residualSeverity]}`}>Res. {v.residualScore}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
