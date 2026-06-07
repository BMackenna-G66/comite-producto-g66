import { useState, useRef, useEffect } from 'react';
import { getProducts, getAllRisks, getCorporateRisks, getKRIs, getRiskEvents, getControlTests, getRegulatoryUpdates, getAllSessions, getCommitments } from '../services/firestore';
import { GoogleGenAI } from '@google/genai';
import { CORPORATE_RISK_CATEGORY_LABELS, getKRIStatus } from '../types';

interface Message { role: 'user' | 'assistant'; content: string; timestamp: string; }

const SUGGESTED_QUESTIONS = [
  '¿Cuáles son mis riesgos corporativos críticos?',
  '¿Qué KRIs están fuera de tolerancia?',
  '¿Qué controles fallaron en los últimos tests?',
  '¿Cuántas alertas regulatorias están pendientes de acción?',
  '¿Qué productos tienen gates bloqueados?',
  '¿Qué compromisos están pendientes de cerrar?',
  '¿Cuál es mi exposición total a riesgo de fraude?',
  '¿Qué áreas presentan mayor concentración de riesgos?',
];

export default function AICopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const buildContext = async (): Promise<string> => {
    setContextLoading(true);
    const [products, risks, corpRisks, kris, events, controls, regulatory, sessions, allCommitments] = await Promise.all([
      getProducts(), getAllRisks(), getCorporateRisks(), getKRIs(),
      getRiskEvents(), getControlTests(), getRegulatoryUpdates(), getAllSessions(),
      Promise.all((await getProducts()).map(p => getCommitments(p.id))).then(all => all.flat()).catch(() => []),
    ]);

    const highRisks = risks.filter(r => r.riskLevel === 'muy_alto' || r.riskLevel === 'alto');
    const blockedGates = products.filter(p => [p.gate1Status, p.gate2Status, p.gate3Status].includes('blocked'));
    const kriticalKRIs = kris.filter(k => getKRIStatus(k) === 'red');
    const warningKRIs = kris.filter(k => getKRIStatus(k) === 'yellow');
    const openEvents = events.filter(e => e.status !== 'Closed');
    const failedControls = controls.filter(c => c.result === 'Ineffective' || c.result === 'PartiallyEffective');
    const criticalReg = regulatory.filter(r => r.status !== 'Completed' && (r.impactLevel === 'Critical' || r.impactLevel === 'High'));
    const pendingCommitments = allCommitments.filter((c: {status: string}) => c.status === 'pending');
    const totalLoss = events.reduce((s, e) => s + (e.lossAmount || 0), 0);

    setContextLoading(false);
    return `CONTEXTO PLATAFORMA GRC — Global81 SpA / G66 Group (${new Date().toLocaleDateString('es-CL')})

RESUMEN EJECUTIVO:
- Productos en pipeline: ${products.filter(p => !['approved','rejected'].includes(p.status)).length} activos / ${products.length} total
- Gates bloqueados: ${blockedGates.length} productos (${blockedGates.map(p => p.name).join(', ') || 'ninguno'})
- Riesgos de productos altos/muy altos: ${highRisks.length} de ${risks.length}
- Riesgos corporativos: ${corpRisks.length} (${corpRisks.filter(r => r.status === 'Open').length} abiertos)
- KRIs en rojo: ${kriticalKRIs.length} | En amarillo: ${warningKRIs.length} | Total: ${kris.length}
- Eventos de riesgo abiertos: ${openEvents.length} de ${events.length}
- Pérdida acumulada registrada: $${totalLoss.toLocaleString()} USD
- Controles fallidos/parciales: ${failedControls.length} de ${controls.length}
- Alertas regulatorias críticas/altas pendientes: ${criticalReg.length}
- Compromisos pendientes: ${pendingCommitments.length}
- Sesiones del comité: ${sessions.length} (${sessions.filter(s => s.resolution === 'APROBADO').length} aprobadas)

RIESGOS CORPORATIVOS ABIERTOS:
${corpRisks.filter(r => r.status !== 'Closed').slice(0, 10).map(r => `- [${CORPORATE_RISK_CATEGORY_LABELS[r.category as keyof typeof CORPORATE_RISK_CATEGORY_LABELS]}] ${r.title} | Score: ${r.inherentRisk} | Residual: ${r.residualRisk} | Owner: ${r.owner}`).join('\n') || 'Ninguno'}

KRIs FUERA DE TOLERANCIA:
${[...kriticalKRIs, ...warningKRIs].map(k => `- [${getKRIStatus(k).toUpperCase()}] ${k.name}: ${k.currentValue}${k.unit} (warning: ${k.warningThreshold}, crítico: ${k.criticalThreshold})`).join('\n') || 'Todos dentro de tolerancia'}

PRODUCTOS CON GATES BLOQUEADOS:
${blockedGates.map(p => `- ${p.name} (Gate ${p.currentGate})`).join('\n') || 'Ninguno'}

RIESGOS DE PRODUCTOS (Top 5 por score):
${highRisks.slice(0, 5).map(r => `- ${r.title} [${r.category}] Score: ${r.inherentRisk} | ROAM: ${r.roamStatus}`).join('\n') || 'Ninguno'}

EVENTOS ABIERTOS:
${openEvents.slice(0, 5).map(e => `- [${e.impactLevel}] ${e.title} | $${e.lossAmount} USD | Estado: ${e.status}`).join('\n') || 'Ninguno'}

CONTROLES FALLIDOS / PARCIALES:
${failedControls.slice(0, 5).map(c => `- ${c.controlName} | ${c.result} | Score: ${c.effectivenessScore}% | ${c.findings || 'Sin hallazgos'}`).join('\n') || 'Ninguno'}

ALERTAS REGULATORIAS PENDIENTES (Críticas/Altas):
${criticalReg.slice(0, 5).map(r => `- [${r.regulator}/${r.country}] ${r.title} | ${r.impactLevel} | Vigente: ${r.effectiveDate || 'TBD'}`).join('\n') || 'Ninguno'}

COMPROMISOS PENDIENTES:
${pendingCommitments.slice(0, 5).map((c: {task: string; responsible: string; dueDate: string}) => `- ${c.task} | Responsable: ${c.responsible} | Vence: ${c.dueDate}`).join('\n') || 'Ninguno'}`;
  };

  const handleSend = async (question?: string) => {
    const q = question ?? input.trim();
    if (!q) return;
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      setMessages(m => [...m, { role: 'user', content: q, timestamp: new Date().toISOString() }, { role: 'assistant', content: '⚠ Gemini API Key no configurada. Agrega VITE_GEMINI_API_KEY en los secrets del repositorio.', timestamp: new Date().toISOString() }]);
      setInput(''); return;
    }

    setInput('');
    setMessages(m => [...m, { role: 'user', content: q, timestamp: new Date().toISOString() }]);
    setLoading(true);

    try {
      const context = await buildContext();
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const history = messages.slice(-6).map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`).join('\n');

      const prompt = `Eres el AI Risk Copilot de Global81 SpA / G66 Group. Eres un experto en GRC (Governance, Risk & Compliance) y ERM (Enterprise Risk Management) especializado en fintechs reguladas en Latinoamérica.

Tu función es apoyar decisiones ejecutivas basándote en los datos reales de la plataforma. Responde de forma concisa, directa y accionable. Si hay alertas urgentes, destrácalas primero. Usa bullets y emojis para hacer la respuesta más legible.

DATOS ACTUALES DE LA PLATAFORMA:
${context}

${history ? `HISTORIAL RECIENTE:\n${history}\n` : ''}

PREGUNTA DEL USUARIO: ${q}

Responde en español, de forma ejecutiva y accionable. Si la pregunta requiere acciones inmediatas, indícalas claramente con 🔴. Si todo está bien en ese aspecto, usa ✅.`;

      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      setMessages(m => [...m, { role: 'assistant', content: response.text ?? 'Sin respuesta', timestamp: new Date().toISOString() }]);
    } catch (e: unknown) {
      setMessages(m => [...m, { role: 'assistant', content: `❌ Error: ${e instanceof Error ? e.message : 'Error desconocido'}`, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl flex flex-col h-[calc(100vh-2rem)] space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">✦ AI Risk Copilot</h1>
        <p className="text-gray-500 text-sm mt-1">Consulta en lenguaje natural sobre riesgos, KRIs, controles, alertas y exposición corporativa</p>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto text-3xl">✦</div>
              <h2 className="font-semibold text-gray-700">AI Risk Copilot</h2>
              <p className="text-gray-400 text-sm max-w-sm">Haz una pregunta sobre el estado de riesgos, KRIs, controles o cumplimiento regulatorio de G66.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => handleSend(q)}
                  className="text-left text-xs bg-gray-50 hover:bg-purple-50 hover:text-purple-700 border border-gray-200 hover:border-purple-300 rounded-xl px-3 py-2.5 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === 'user' ? 'bg-brand text-white rounded-br-sm' : 'bg-gray-50 text-gray-800 rounded-bl-sm border border-gray-100'}`}>
              <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{m.content}</pre>
              <p className={`text-xs mt-1.5 ${m.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                {new Date(m.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {(loading || contextLoading) && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-gray-400">{contextLoading ? 'Cargando datos...' : 'Analizando...'}</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Pregunta sobre riesgos, KRIs, controles, regulación..."
          disabled={loading}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
        />
        <button onClick={() => handleSend()} disabled={loading || !input.trim()}
          className="bg-purple-600 text-white px-5 py-3 rounded-xl font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors">
          {loading ? <span className="animate-spin">⟳</span> : '↑'}
        </button>
      </div>
      <p className="text-xs text-gray-400 text-center">El Copilot lee datos en tiempo real de la plataforma para fundamentar sus respuestas.</p>
    </div>
  );
}
