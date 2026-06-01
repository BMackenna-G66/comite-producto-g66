import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getProduct, getRisks, getCommitteeSessions, createCommitteeSession, updateCommitteeSession } from '../services/firestore';
import { generateCommitteeSummary } from '../services/geminiService';
import { Product, Risk, CommitteeSession, COMMITTEE_ROLES, PRINCIPLES, Attendee, ConflictDeclaration, PrincipleEvaluation, Vote, MemberOpinion, Commitment, RedFlag, CommitteeResolution } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

const defaultSession = (productId: string, productName: string, gate: 1|2|3, secretaryName: string, secretaryId: string): Omit<CommitteeSession, 'id'|'createdAt'|'updatedAt'> => ({
  productId,
  productName,
  gate,
  sessionId: `${String(Date.now()).slice(-3)}-${new Date().getFullYear()}`,
  sessionDate: new Date().toISOString().split('T')[0],
  secretaryId,
  secretaryName,
  presidentId: '',
  presidentName: '',
  attendees: COMMITTEE_ROLES.map(r => ({ userId: '', name: '', roleLabel: r.roleLabel, quality: 'Titular', present: false })),
  quorumAchieved: false,
  conflictDeclarations: COMMITTEE_ROLES.map(r => ({ userId: '', userName: r.roleLabel, hasConflict: false })),
  principlesEvaluation: PRINCIPLES.map(p => ({ principle: p, compliant: null, observations: '' })),
  redFlags: [],
  memberOpinions: COMMITTEE_ROLES.map(r => ({ userId: '', userName: r.roleLabel, roleLabel: r.roleLabel, opinion: '', timestamp: '' })),
  votes: [],
  votesFavor: 0,
  votesContra: 0,
  votesAbstencion: 0,
  usedTieBreaker: false,
  resolution: 'PENDIENTE',
  commitments: [],
  status: 'draft',
});

type Section = 'header' | 'quorum' | 'conflicts' | 'phase' | 'redflags' | 'opinions' | 'vote' | 'commitments';

export default function CommitteeSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const productIdParam = params.get('productId');
  
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [session, setSession] = useState<Omit<CommitteeSession, 'id'|'createdAt'|'updatedAt'> | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(id ?? null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<Section>('header');
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [newFlag, setNewFlag] = useState({ description: '', area: '', correctiveAction: '' });
  const [newCommitment, setNewCommitment] = useState({ task: '', responsible: '', dueDate: '' });

  const canEdit = true;

  useEffect(() => {
    const init = async () => {
      if (id) {
        // editing existing
        const sessions = await (productIdParam ? getCommitteeSessions(productIdParam) : (async () => [] as CommitteeSession[])());
        const all = await import('../services/firestore').then(m => m.getAllSessions());
        const existing = all.find(s => s.id === id);
        if (existing) {
          setSession(existing);
          setSessionId(id);
          const p = await getProduct(existing.productId);
          if (p) { setProduct(p); const r = await getRisks(p.id); setRisks(r); }
        }
      } else if (productIdParam) {
        const p = await getProduct(productIdParam);
        if (p) {
          setProduct(p);
          const r = await getRisks(p.id);
          setRisks(r);
          setSession(defaultSession(p.id, p.name, p.currentGate as 1|2|3, '', ''));
        }
      }
      setLoading(false);
    };
    init();
  }, [id, productIdParam]);

  const update = useCallback((patch: Partial<Omit<CommitteeSession, 'id'|'createdAt'|'updatedAt'>>) => {
    setSession(s => s ? { ...s, ...patch } : s);
  }, []);

  const save = async (close = false) => {
    if (!session) return;
    setSaving(true);
    try {
      const data = { ...session, status: close ? 'closed' as const : session.status };
      if (close) (data as CommitteeSession).closedAt = new Date().toISOString();
      if (sessionId) {
        await updateCommitteeSession(sessionId, data);
      } else {
        const newId = await createCommitteeSession(data);
        setSessionId(newId);
      }
      if (close) navigate(`/products/${session.productId}`);
    } finally {
      setSaving(false);
    }
  };

  const calcQuorum = (attendees: Attendee[]) => {
    const voters = COMMITTEE_ROLES.filter(r => r.canVote).length;
    const present = attendees.filter((a, i) => a.present && COMMITTEE_ROLES[i]?.canVote).length;
    return present > voters / 2;
  };

  const handleAttendeeChange = (idx: number, field: keyof Attendee, value: unknown) => {
    const attendees = [...(session?.attendees ?? [])];
    attendees[idx] = { ...attendees[idx], [field]: value };
    const quorumAchieved = calcQuorum(attendees);
    update({ attendees, quorumAchieved });
  };

  const handleVote = (type: 'favor'|'contra'|'abstencion', delta: number) => {
    if (!session) return;
    const key = type === 'favor' ? 'votesFavor' : type === 'contra' ? 'votesContra' : 'votesAbstencion';
    update({ [key]: Math.max(0, session[key] + delta) });
  };

  const computeResolution = (): CommitteeResolution => {
    if (!session) return 'PENDIENTE';
    if (session.votesFavor > session.votesContra) return 'APROBADO';
    if (session.votesContra > session.votesFavor) return 'RECHAZADO';
    return session.usedTieBreaker ? 'APROBADO' : 'PENDIENTE';
  };

  const addRedFlag = () => {
    if (!newFlag.description) return;
    const flag: RedFlag = { id: Date.now().toString(), productId: session?.productId ?? '', ...newFlag, status: 'active', createdAt: new Date().toISOString() };
    update({ redFlags: [...(session?.redFlags ?? []), flag] });
    setNewFlag({ description: '', area: '', correctiveAction: '' });
  };

  const addCommitment = () => {
    if (!newCommitment.task) return;
    const c: Commitment = { id: Date.now().toString(), ...newCommitment, status: 'pending', sessionId: sessionId ?? '', productId: session?.productId ?? '' };
    update({ commitments: [...(session?.commitments ?? []), c] });
    setNewCommitment({ task: '', responsible: '', dueDate: '' });
  };

  const handleGenerateSummary = async () => {
    if (!session || !product) return;
    setAiLoading(true);
    try {
      const s = await generateCommitteeSummary(product.name, session.gate, computeResolution(), risks, session.redFlags.filter(f => f.status === 'active').length);
      setAiSummary(s);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!session || !product) return <div className="p-6 text-gray-500">Sesión no encontrada.</div>;

  const SECTIONS: { key: Section; label: string }[] = [
    { key: 'header', label: '① Encabezado' },
    { key: 'quorum', label: '② Quórum' },
    { key: 'conflicts', label: '③ Conflictos' },
    { key: 'phase', label: '④ Fase' },
    { key: 'redflags', label: '⑤ Red Flags' },
    { key: 'opinions', label: '⑥ Opiniones' },
    { key: 'vote', label: '⑦ Votación' },
    { key: 'commitments', label: '⑧ Compromisos' },
  ];

  const resolution = computeResolution();

  return (
    <div className="p-6 max-w-4xl space-y-5">
      {/* Print header */}
      <div className="print-only text-center py-4 border-b">
        <h1 className="text-xl font-bold">Informe de Gobierno de Producto — Global 81 SpA</h1>
        <p className="text-sm">{session.productName} · Sesión {session.sessionId} · Gate {session.gate}</p>
      </div>

      {/* Nav header */}
      <div className="no-print flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Sesión de Comité</h1>
          <p className="text-sm text-gray-500">{product.name} · Gate {session.gate}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={handleGenerateSummary} disabled={aiLoading} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
            {aiLoading ? '⟳' : '✦'} Resumen IA
          </button>
          <button onClick={() => window.print()} className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-50">
            🖨 Imprimir Acta
          </button>
          {canEdit && (
            <>
              <button onClick={() => save(false)} disabled={saving} className="border border-brand text-brand px-3 py-2 rounded-lg text-xs font-medium hover:bg-brand hover:text-white disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => save(true)} disabled={saving} className="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                Cerrar Sesión
              </button>
            </>
          )}
        </div>
      </div>

      {aiSummary && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <p className="text-sm text-purple-800 font-medium mb-1">✦ Resumen generado por IA</p>
          <p className="text-sm text-purple-700">{aiSummary}</p>
          <button onClick={() => setAiSummary('')} className="text-xs text-purple-400 mt-2 hover:underline no-print">Cerrar</button>
        </div>
      )}

      {/* Section nav */}
      <div className="no-print flex gap-1 flex-wrap">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${section === s.key ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">

        {/* ① HEADER */}
        {section === 'header' && (
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">I. Encabezado de Sesión</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Producto</label>
                <input value={session.productName} readOnly className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ID de Sesión</label>
                <input value={session.sessionId} onChange={e => update({ sessionId: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fecha del Comité</label>
                <input type="date" value={session.sessionDate} onChange={e => update({ sessionDate: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Gate</label>
                <select value={session.gate} onChange={e => update({ gate: Number(e.target.value) as 1|2|3 })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                  <option value={1}>Gate 1 · Levantamiento</option>
                  <option value={2}>Gate 2 · Planificación</option>
                  <option value={3}>Gate 3 · Ejecución y Cierre</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Presidente del Comité</label>
                <input value={session.presidentName} onChange={e => update({ presidentName: e.target.value })} placeholder="Nombre del Presidente" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Secretario (Legal Lead)</label>
                <input value={session.secretaryName} onChange={e => update({ secretaryName: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
            </div>
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${session.status === 'closed' ? 'bg-green-50 text-green-700' : session.status === 'in_progress' ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-500'}`}>
              <span className="text-sm font-medium">Estado General: </span>
              <span className="text-sm">{session.status === 'closed' ? '✅ Cerrada' : session.status === 'in_progress' ? '🔄 En Progreso' : '📋 Borrador'}</span>
            </div>
          </div>
        )}

        {/* ② QUORUM */}
        {section === 'quorum' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">II. Control de Asistencia y Verificación de Quórum</h2>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${session.quorumAchieved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {session.quorumAchieved ? '✓ Quórum alcanzado' : '✗ Sin quórum'}
              </span>
            </div>
            <p className="text-xs text-gray-500">El Secretario computa para quórum pero no posee derecho a voto (Cap. II, Sec. B(1)).</p>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Cargo</th>
                    <th className="text-left px-4 py-2">Nombre</th>
                    <th className="text-center px-4 py-2">Calidad</th>
                    <th className="text-center px-4 py-2">Asistencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {session.attendees.map((a, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{a.roleLabel}</td>
                      <td className="px-4 py-2.5">
                        <input value={a.name} onChange={e => handleAttendeeChange(i, 'name', e.target.value)} placeholder="Nombre completo" className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-800" />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <select value={a.quality} onChange={e => handleAttendeeChange(i, 'quality', e.target.value)} className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none">
                          <option>Titular</option><option>Suplente</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="checkbox" checked={a.present} onChange={e => handleAttendeeChange(i, 'present', e.target.checked)} className="w-4 h-4 text-brand rounded border-gray-300 focus:ring-brand" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-600">
              Presentes: {session.attendees.filter(a => a.present).length} / {session.attendees.length} ·
              Votantes presentes: {session.attendees.filter((a, i) => a.present && COMMITTEE_ROLES[i]?.canVote).length} / {COMMITTEE_ROLES.filter(r => r.canVote).length} ·
              Quórum (50%+1): <span className={session.quorumAchieved ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{session.quorumAchieved ? 'SÍ' : 'NO'}</span>
            </div>
          </div>
        )}

        {/* ③ CONFLICTS */}
        {section === 'conflicts' && (
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">III. Declaración de Conflictos de Interés</h2>
            <p className="text-xs text-gray-500">Cap. II, Sec. B(5): los miembros deben declarar cualquier interés contrapuesto.</p>
            <div className="space-y-3">
              {session.conflictDeclarations.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-700">{c.userName}</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input type="radio" checked={!c.hasConflict} onChange={() => {
                        const declarations = [...session.conflictDeclarations];
                        declarations[i] = { ...declarations[i], hasConflict: false };
                        update({ conflictDeclarations: declarations });
                      }} className="text-brand" /> Sin conflicto
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-red-600 cursor-pointer">
                      <input type="radio" checked={c.hasConflict} onChange={() => {
                        const declarations = [...session.conflictDeclarations];
                        declarations[i] = { ...declarations[i], hasConflict: true };
                        update({ conflictDeclarations: declarations });
                      }} className="text-red-500" /> Conflicto / Abstención
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ④ PHASE */}
        {section === 'phase' && (
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">IV. Fase {session.gate}: {session.gate === 1 ? 'Levantamiento' : session.gate === 2 ? 'Planificación' : 'Ejecución y Cierre'}</h2>

            {session.gate === 1 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Evaluación de cumplimiento de Principios Generales (Cap. I, Sec. D)</p>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-left px-4 py-2">Principio</th>
                        <th className="text-center px-4 py-2 w-24">Cumple</th>
                        <th className="text-left px-4 py-2">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {session.principlesEvaluation.map((pe, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2.5 text-xs text-gray-700">{i + 1}. {pe.principle}</td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex justify-center gap-1">
                              <button onClick={() => {
                                const pe2 = [...session.principlesEvaluation];
                                pe2[i] = { ...pe2[i], compliant: true };
                                update({ principlesEvaluation: pe2 });
                              }} className={`text-xs px-2 py-0.5 rounded ${pe.compliant === true ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-green-100'}`}>Sí</button>
                              <button onClick={() => {
                                const pe2 = [...session.principlesEvaluation];
                                pe2[i] = { ...pe2[i], compliant: false };
                                update({ principlesEvaluation: pe2 });
                              }} className={`text-xs px-2 py-0.5 rounded ${pe.compliant === false ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-red-100'}`}>No</button>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <input value={pe.observations} onChange={e => {
                              const pe2 = [...session.principlesEvaluation];
                              pe2[i] = { ...pe2[i], observations: e.target.value };
                              update({ principlesEvaluation: pe2 });
                            }} placeholder="Observaciones..." className="w-full text-xs border-0 bg-transparent focus:outline-none" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {session.gate === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Estado de Mitigación por Áreas Críticas (SARLAFT/SARO, Legal, Fraude, Conducta)</p>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-left px-4 py-2">Riesgo</th>
                        <th className="text-center px-4 py-2">Nivel</th>
                        <th className="text-left px-4 py-2">Control / Mitigación</th>
                        <th className="text-center px-4 py-2">ROAM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {risks.length === 0 && (
                        <tr><td colSpan={4} className="px-4 py-4 text-center text-xs text-gray-400">No hay riesgos identificados para este producto.</td></tr>
                      )}
                      {risks.map(r => (
                        <tr key={r.id} className={r.isRedFlag ? 'bg-red-50' : ''}>
                          <td className="px-4 py-2.5">
                            <div className="text-xs font-medium text-gray-800">{r.title}</div>
                            <div className="text-xs text-gray-400">{r.category}</div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.riskLevel === 'muy_alto' ? 'bg-red-100 text-red-700' : r.riskLevel === 'alto' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.riskLevel.replace('_', ' ')}</span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-600">{r.mitigationPlan || r.control || '—'}</td>
                          <td className="px-4 py-2.5 text-center text-xs">{r.roamStatus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {session.gate === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Definiciones del Proyecto (Alcance final, specs técnicas)</label>
                  <textarea rows={3} value={product.technicalSpecs ?? ''} readOnly className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 resize-none" placeholder="Completar en la ficha del producto..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Plan de Seguimiento Post-Venta</label>
                  <textarea rows={3} value={product.postSaleMonitoring ?? ''} readOnly className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 resize-none" placeholder="Completar en la ficha del producto..." />
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                  <span className="font-semibold">Sign-Off Gate 3:</span> La aprobación final debe ser validada por el Gerente de Compliance. Sin Sign-Off, no hay lanzamiento.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ⑤ RED FLAGS */}
        {section === 'redflags' && (
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">V. Registro de Alertas (Red Flags)</h2>
            <p className="text-xs text-gray-500">Puntos de bloqueo técnico, legal, ético o de cumplimiento. Una Red Flag activa inhabilita la aprobación.</p>
            <div className="space-y-2">
              {session.redFlags.map((rf, i) => (
                <div key={i} className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start justify-between">
                  <div>
                    <span className="text-xs font-medium text-red-700">{rf.area}</span>
                    <p className="text-sm text-gray-800 mt-0.5">{rf.description}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Acción: {rf.correctiveAction}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${rf.status === 'active' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{rf.status === 'active' ? 'Activa' : 'Cerrada'}</span>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-dashed border-gray-200">
                <p className="text-xs font-medium text-gray-600">Agregar Red Flag</p>
                <input value={newFlag.area} onChange={e => setNewFlag(f => ({ ...f, area: e.target.value }))} placeholder="Área (Legal, Compliance, Fraude...)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <input value={newFlag.description} onChange={e => setNewFlag(f => ({ ...f, description: e.target.value }))} placeholder="Descripción del bloqueo" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <input value={newFlag.correctiveAction} onChange={e => setNewFlag(f => ({ ...f, correctiveAction: e.target.value }))} placeholder="Acción correctiva requerida" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <button onClick={addRedFlag} className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-red-700">Registrar Red Flag</button>
              </div>
            )}
          </div>
        )}

        {/* ⑥ OPINIONS */}
        {section === 'opinions' && (
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">VI. Opiniones Fundadas de los Miembros</h2>
            <p className="text-xs text-gray-500">Cap. II, Sec. C(j): cada integrante emite su declaración basada en su expertise técnico.</p>
            <div className="space-y-4">
              {session.memberOpinions.map((op, i) => (
                <div key={i} className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">{op.roleLabel}</label>
                  <textarea
                    rows={2}
                    value={op.opinion}
                    onChange={e => {
                      const opinions = [...session.memberOpinions];
                      opinions[i] = { ...opinions[i], opinion: e.target.value, timestamp: new Date().toISOString() };
                      update({ memberOpinions: opinions });
                    }}
                    placeholder="Opinión técnica fundada..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">Nota: La responsabilidad es solidaria. Los disconformes deben dejar constancia explícita para salvar responsabilidad personal (Cap. II, Sec. B.4).</p>
          </div>
        )}

        {/* ⑦ VOTE */}
        {section === 'vote' && (
          <div className="p-6 space-y-6">
            <h2 className="font-semibold text-gray-700">VII. Escrutinio y Votación</h2>
            <div className="grid grid-cols-3 gap-4">
              {(['favor', 'contra', 'abstencion'] as const).map(type => {
                const label = type === 'favor' ? 'A Favor' : type === 'contra' ? 'En Contra' : 'Abstención';
                const val = type === 'favor' ? session.votesFavor : type === 'contra' ? session.votesContra : session.votesAbstencion;
                const color = type === 'favor' ? 'border-green-300 bg-green-50' : type === 'contra' ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-gray-50';
                const numColor = type === 'favor' ? 'text-green-700' : type === 'contra' ? 'text-red-700' : 'text-gray-600';
                return (
                  <div key={type} className={`rounded-xl border-2 p-4 text-center ${color}`}>
                    <p className="text-xs text-gray-500 mb-2">{label}</p>
                    <p className={`text-4xl font-bold ${numColor}`}>{val}</p>
                    {canEdit && (
                      <div className="flex justify-center gap-2 mt-3">
                        <button onClick={() => handleVote(type, -1)} className="w-7 h-7 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-100">−</button>
                        <button onClick={() => handleVote(type, 1)} className="w-7 h-7 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-100">+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={session.usedTieBreaker} onChange={e => update({ usedTieBreaker: e.target.checked })} className="w-4 h-4 text-brand rounded" />
                Voto dirimente del Presidente (en caso de empate)
              </label>
            </div>
            <div className={`p-4 rounded-xl border-2 text-center ${resolution === 'APROBADO' ? 'border-green-400 bg-green-50' : resolution === 'RECHAZADO' ? 'border-red-400 bg-red-50' : resolution === 'APROBADO_CON_CONDICIONANTES' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300 bg-gray-50'}`}>
              <p className="text-xs text-gray-500 mb-1">Resolución Final</p>
              <p className={`text-2xl font-bold ${resolution === 'APROBADO' ? 'text-green-700' : resolution === 'RECHAZADO' ? 'text-red-700' : resolution === 'APROBADO_CON_CONDICIONANTES' ? 'text-yellow-700' : 'text-gray-500'}`}>
                {resolution === 'APROBADO_CON_CONDICIONANTES' ? 'APROBADO CON CONDICIONANTES' : resolution}
              </p>
            </div>
            {canEdit && (
              <div className="flex gap-3 justify-center">
                {(['APROBADO', 'RECHAZADO', 'APROBADO_CON_CONDICIONANTES'] as CommitteeResolution[]).map(r => (
                  <button key={r} onClick={() => update({ resolution: r })} className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${session.resolution === r ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:border-brand'}`}>
                    {r === 'APROBADO_CON_CONDICIONANTES' ? 'Con Condicionantes' : r}
                  </button>
                ))}
              </div>
            )}
            {(session.resolution === 'APROBADO_CON_CONDICIONANTES') && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Condicionantes</label>
                <textarea rows={3} value={session.condicionantes ?? ''} onChange={e => update({ condicionantes: e.target.value })} placeholder="Detalle las condicionantes para la aprobación..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
              </div>
            )}
          </div>
        )}

        {/* ⑧ COMMITMENTS */}
        {section === 'commitments' && (
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">VIII. Tabla de Compromisos y Acuerdos</h2>
            <p className="text-xs text-gray-500">El Secretario ejercerá el seguimiento estricto de los compromisos aquí listados.</p>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Actividad / Tarea</th>
                    <th className="text-left px-4 py-2">Responsable</th>
                    <th className="text-center px-4 py-2">Fecha</th>
                    <th className="text-center px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {session.commitments.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-4 text-center text-xs text-gray-400">Sin compromisos registrados.</td></tr>
                  )}
                  {session.commitments.map((c, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-xs text-gray-800">{c.task}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{c.responsible}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-500">{c.dueDate}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'completed' ? 'bg-green-100 text-green-700' : c.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                          {c.status === 'completed' ? 'Completado' : c.status === 'in_progress' ? 'En Progreso' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-dashed border-gray-200">
                <p className="text-xs font-medium text-gray-600">Agregar Compromiso</p>
                <input value={newCommitment.task} onChange={e => setNewCommitment(f => ({ ...f, task: e.target.value }))} placeholder="Descripción de la tarea" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <div className="grid grid-cols-2 gap-3">
                  <input value={newCommitment.responsible} onChange={e => setNewCommitment(f => ({ ...f, responsible: e.target.value }))} placeholder="Responsable" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                  <input type="date" value={newCommitment.dueDate} onChange={e => setNewCommitment(f => ({ ...f, dueDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <button onClick={addCommitment} className="bg-brand text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-brand-dark">Agregar Compromiso</button>
              </div>
            )}
            <div className="pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-400">
              <span>Firma Secretario: ___________________________</span>
              <span>Firma Presidente: ___________________________</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
