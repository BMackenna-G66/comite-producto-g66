import { GoogleGenAI, Type, Part } from '@google/genai';
import { Risk, RiskLevel, AIRiskAnalysis, CountryScopeResult } from '../types';
import { REQUIREMENT_AREAS, ALL_REQUIREMENT_QUESTIONS, ANSWER_OPTIONS, RequirementQuestion } from '../requirementsCatalog';
import { ScopeDocInput } from './scopeDocument';
import { SarlaftMatrix } from '../sarlaft/types';

export type { AIRiskAnalysis };

const getAI = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) throw new Error('VITE_GEMINI_API_KEY no configurada. Agrégala en los secrets del repositorio.');
  return new GoogleGenAI({ apiKey: key });
};

// ─── Document analysis result ─────────────────────────────────────────────────
export interface DocumentAnalysisResult {
  productName: string;
  productDescription: string;
  affectedCompanies: string[];
  affectedProcesses: string[];
  risks: {
    title: string;
    description: string;
    category: string;
    riskLevel: RiskLevel;
    impact: number;
    probability: number;
    suggestedControl: string;
    isRedFlag: boolean;
  }[];
  executiveSummary: string;
  recommendations: string[];
  gate1Principles: {
    principle: string;
    compliant: boolean | null;
    justification: string;
  }[];
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    productName: { type: Type.STRING },
    productDescription: { type: Type.STRING },
    affectedCompanies: { type: Type.ARRAY, items: { type: Type.STRING } },
    affectedProcesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    risks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          riskLevel: { type: Type.STRING, description: 'muy_alto | alto | moderado | bajo | muy_bajo' },
          impact: { type: Type.NUMBER, description: 'Entero 1-5' },
          probability: { type: Type.NUMBER, description: 'Entero 1-5' },
          suggestedControl: { type: Type.STRING },
          isRedFlag: { type: Type.BOOLEAN },
        },
        required: ['title', 'description', 'category', 'riskLevel', 'impact', 'probability', 'suggestedControl', 'isRedFlag'],
      },
    },
    executiveSummary: { type: Type.STRING },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
    gate1Principles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          principle: { type: Type.STRING },
          compliant: { type: Type.BOOLEAN },
          justification: { type: Type.STRING },
        },
        required: ['principle', 'compliant', 'justification'],
      },
    },
  },
  required: ['productName', 'productDescription', 'affectedCompanies', 'affectedProcesses', 'risks', 'executiveSummary', 'recommendations', 'gate1Principles'],
};

const SYSTEM_PROMPT = `Eres el Director de Riesgos (CRO) de Global66, una fintech de remesas internacional regulada por CMF (Chile), SFC (Colombia) y BCRA (Argentina), operando a través de Global81 SpA, GlobalCard S.A., Sedpe y Arpagos.

Analiza el documento proporcionado para el Comité de Producto de Global81 SpA. Extrae toda la información relevante sobre riesgos, productos afectados y cumplimiento de principios. Sé exhaustivo y riguroso. Usa español en todas las respuestas. Identifica entre 5 y 15 riesgos.`;

// Analyze a plain-text document
export const analyzeDocument = async (text: string): Promise<DocumentAnalysisResult> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `${SYSTEM_PROMPT}\n\nDocumento a analizar:\n\n${text}`,
    config: { responseMimeType: 'application/json', responseSchema },
  });
  return JSON.parse(response.text ?? '{}') as DocumentAnalysisResult;
};

// Analyze a PDF sent as base64 inline data (Gemini natively supports PDF)
export const analyzeDocumentPDF = async (base64Data: string): Promise<DocumentAnalysisResult> => {
  const ai = getAI();
  const parts: Part[] = [
    { text: SYSTEM_PROMPT },
    { inlineData: { mimeType: 'application/pdf', data: base64Data } },
    { text: 'Analiza el PDF adjunto y extrae toda la información relevante para el Comité de Producto.' },
  ];
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { role: 'user', parts },
    config: { responseMimeType: 'application/json', responseSchema },
  });
  return JSON.parse(response.text ?? '{}') as DocumentAnalysisResult;
};

// ─── Existing helpers ─────────────────────────────────────────────────────────
export const analyzeProductRisks = async (
  productName: string, description: string, businessCase: string, existingRisks: Risk[]
): Promise<AIRiskAnalysis> => {
  const ai = getAI();
  const existingList = existingRisks.map(r => `- ${r.title} (${r.category})`).join('\n');
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Eres el CRO de Global66. Analiza: **${productName}** — ${description}. Business case: ${businessCase}. Riesgos existentes:\n${existingList || 'Ninguno'}. Identifica hasta 8 riesgos nuevos. Usa español.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          risks: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, description: { type: Type.STRING }, category: { type: Type.STRING }, riskLevel: { type: Type.STRING }, suggestedControl: { type: Type.STRING }, isNew: { type: Type.BOOLEAN } }, required: ['title','description','category','riskLevel','suggestedControl','isNew'] } },
          summary: { type: Type.STRING },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['risks', 'summary', 'recommendations'],
      },
    },
  });
  return JSON.parse(response.text ?? '{}') as AIRiskAnalysis;
};

// Determina a qué países aplica un producto (directa o indirectamente), para
// validar que el Oficial de Cumplimiento (OC) de cada país relevante quede
// dentro del alcance del comité.
export const analyzeCountryScope = async (
  productName: string, description: string, businessCase: string, companies: string[]
): Promise<CountryScopeResult> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Eres el Director de Riesgos (CRO) de Global66, fintech de remesas regulada por CMF (Chile), SFC (Colombia) y BCRA (Argentina), operando a través de Global81 SpA (Chile), GlobalCard S.A., Sedpe (Colombia) y Arpagos (Argentina).

Analiza el siguiente producto y determina a qué países aplica, ya sea de forma directa (el producto opera, se comercializa o tiene clientes en ese país) o indirecta (hay flujo de datos, procesamiento, infraestructura compartida, o impacto regulatorio cruzado, aunque el producto no se lance ahí formalmente).

Producto: **${productName}**
Descripción: ${description}
Business case: ${businessCase}
Empresas del grupo involucradas: ${companies.join(', ') || 'No especificadas'}

Para cada país relevante (evalúa al menos Chile, Colombia y Argentina, y agrega otros si el producto los menciona), indica el nivel de alcance ('directo', 'indirecto', o 'fuera_de_alcance' si claramente no aplica) y una justificación breve.

Genera además una advertencia (campo "warning") en español, de máximo 3 frases, que le recuerde al comité qué Oficial de Cumplimiento (OC) por país debería estar incluido en la sesión según los países en alcance directo o indirecto. Si no hay ninguna advertencia relevante, deja el campo como string vacío.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          entries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                country: { type: Type.STRING },
                scope: { type: Type.STRING, description: "'directo' | 'indirecto' | 'fuera_de_alcance'" },
                reasoning: { type: Type.STRING },
              },
              required: ['country', 'scope', 'reasoning'],
            },
          },
          warning: { type: Type.STRING },
        },
        required: ['entries', 'warning'],
      },
    },
  });
  const parsed = JSON.parse(response.text ?? '{}');
  return { ...parsed, analyzedAt: new Date().toISOString() } as CountryScopeResult;
};

// ─── Requerimientos del comité (catálogo del Excel) ──────────────────────────
export interface AIRequirementAnswer {
  id: string;
  answer: string;
  detail: string;
}

const describeType = (q: RequirementQuestion) =>
  q.type === 'texto' ? 'texto libre' : `una de: ${ANSWER_OPTIONS[q.type].join(' | ')}`;

// Responde cada pregunta del catálogo a partir del documento de alcance. Solo
// devuelve ids conocidos y normaliza las opciones; una pregunta que el
// documento no permite responder vuelve con answer vacío y el motivo en detail.
export const answerRequirements = async (
  doc: ScopeDocInput, productContext?: { name: string; description: string },
): Promise<AIRequirementAnswer[]> => {
  const ai = getAI();
  const catalog = REQUIREMENT_AREAS.map(area =>
    `## ${area.label}\n` + area.sections.map(s =>
      `### ${s.title}${s.note ? ` (${s.note})` : ''}\n` + s.questions.map(q =>
        `- id: ${q.id} | pregunta: ${q.question} | respuesta: ${describeType(q)}${q.hint ? ` | contexto: ${q.hint}` : ''}`,
      ).join('\n'),
    ).join('\n'),
  ).join('\n\n');

  const instructions = `Eres analista del Comité de Producto de Global66 (fintech de remesas que opera con Global81 SpA en Chile, GlobalCard S.A. y Sedpe en Colombia, y Arpagos en Argentina).
${productContext ? `\nProducto: ${productContext.name} — ${productContext.description}\n` : ''}
Responde TODAS las preguntas del siguiente cuestionario usando únicamente lo que dice el documento de alcance adjunto. Reglas:
- Devuelve una entrada por cada id del cuestionario, con el id exacto.
- "answer": para preguntas de opciones, exactamente una de las opciones indicadas; para texto libre, una respuesta concreta y breve.
- "detail": la evidencia del documento que sustenta la respuesta (o el país, sociedad o detalle que pide la pregunta), en 1 a 3 frases.
- Si el documento no permite responder, deja "answer" como string vacío y explica en "detail" qué información falta. No inventes.
- Usa español.

Cuestionario:
${catalog}`;

  const contents = doc.kind === 'pdf'
    ? { role: 'user', parts: [{ text: instructions }, { inlineData: { mimeType: 'application/pdf', data: doc.base64 } }] as Part[] }
    : `${instructions}\n\nDocumento de alcance:\n\n${doc.text}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                answer: { type: Type.STRING },
                detail: { type: Type.STRING },
              },
              required: ['id', 'answer', 'detail'],
            },
          },
        },
        required: ['answers'],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? '{}') as { answers?: AIRequirementAnswer[] };
  const byId = new Map(ALL_REQUIREMENT_QUESTIONS.map(q => [q.id, q]));
  return (parsed.answers ?? []).flatMap(a => {
    const q = byId.get(a.id);
    if (!q) return [];
    let answer = (a.answer ?? '').trim();
    if (q.type !== 'texto') {
      const normalized = answer.toUpperCase().replace('SÍ', 'SI').replace(/\s+/g, '');
      answer = ANSWER_OPTIONS[q.type].find(o => o.replace(/\s+/g, '') === normalized) ?? '';
    }
    return [{ id: q.id, answer, detail: (a.detail ?? '').trim() }];
  });
};

// ─── SARLAFT: cruce del producto contra la matriz vigente y la guía SFC ─────
export interface AISarlaftControl {
  code: string; name: string; description: string; tipo: string; naturaleza: string;
  alertamiento: string; analisis: string; reporte: string; tomaDecisiones: string; sfcScore: number;
}
export interface AISarlaftCause {
  code: string; text: string; factor: string;
  sujeto: string; accion: string; objeto: string; contexto: string;
  sfcScore: number; sfcObservation: string; controls: AISarlaftControl[];
}
export interface AISarlaftRisk {
  matrixRiskCode: string; sourceCrime: string; description: string;
  applicability: string; justification: string;
  probability: number; impactLegal: number; impactFinancial: number; impactContagion: number; impactReputational: number;
  sfcRiskScore: number; relatedOperationalRiskIds: string[]; causes: AISarlaftCause[];
}
export interface AISarlaftAnalysis {
  productProfile: string;
  summary: string;
  cross: { matrixRiskCode: string; applies: string; justification: string }[];
  risks: AISarlaftRisk[];
}

const SARLAFT_METHODOLOGY = `METODOLOGÍA SFC (Guía de evaluación de identificación de riesgos LA/FT/FPADM, dic-2025):
- RIESGO: debe expresar que la entidad sea utilizada para el LA/FT/FPADM, idealmente precisando el delito subyacente (narcotráfico, contrabando, corrupción, etc.). Calificación 1-3 (1 Débil, 2 Necesita mejorar, 3 Adecuado).
- CAUSA: escenario conductual que debe contener explícitamente: SUJETO (quién usa la entidad: cliente, PEP, empleado, proveedor…), ACCIÓN (verbo: transferir, recibir, depositar…), OBJETO DETERMINADO (activo o recurso concreto: transferencias internacionales, remesas, activos virtuales, efectivo…; "recursos", "transacciones" u "operaciones" son objetos indeterminados y restan puntaje) y CONTEXTO (presunto delito asociado, tipología o señal de alerta, y canal/producto usado). No debe redactarse en función del control. Calificación 1-3 según cuántos elementos están explícitos y bien determinados.
- CONTROL: debe tener relación directa con la causa y contener 4 componentes: ALERTAMIENTO (hechos, patrones o umbrales que activan el control, con el detalle de la causa), ANÁLISIS (examen de la alerta para determinar si es inusual o sospechosa), REPORTE (interno o externo a la UIAF) y TOMA DE DECISIONES (medidas que reducen probabilidad o impacto). Controles de riesgo operativo no cuentan como controles LA/FT. Categorías: TRANSVERSAL (todas las causas, ej. listas vinculantes), MULTIPLE (grupo de causas), ESPECÍFICO (una causa). Calificación 1-3; el control nunca puede calificar por encima de su causa.`;

const SARLAFT_VALUATION = `VALORACIÓN INHERENTE (escala 1-5):
- Probabilidad: 1 la actividad ocurre máx. 1 vez al año; 2 semestral; 3 trimestral; 4 mensual; 5 diaria.
- Impacto legal/contractual (pesa 60%): 1 recomendación del ente de control; 2 glosa de vigilancia; 3 glosa jurídica; 4 multas o sanciones; 5 intervención/cierre.
- Impacto financiero/operativo (20%): 1 < COP 82 M; 2 hasta 164 M; 3 hasta 246 M; 4 hasta 328 M; 5 > 328 M.
- Impacto de contagio (15%): 1 usuario o proveedor involucrado; 2 cliente; 3 funcionario; 4 directivo; 5 accionista principal.
- Impacto reputacional (15%): 1 interno; 2 entidad; 3 sectorial; 4 nacional; 5 internacional.`;

// El cruce se hace en dos etapas porque pedir el detalle de todos los riesgos en
// una sola respuesta supera el límite de salida del modelo (JSON truncado):
// 1) una llamada corta evalúa todos los riesgos de la matriz y detecta riesgos
//    nuevos; 2) una llamada por cada riesgo que aplica detalla causas y
//    controles, en paralelo y aislando fallas (un riesgo que falla se carga
//    después desde la matriz).
const SARLAFT_CONCURRENCY = 4;

const sarlaftContents = (doc: ScopeDocInput, instructions: string) =>
  doc.kind === 'pdf'
    ? { role: 'user', parts: [{ text: instructions }, { inlineData: { mimeType: 'application/pdf', data: doc.base64 } }] as Part[] }
    : `${instructions}\n\nDOCUMENTO DE ALCANCE:\n\n${doc.text}`;

const matrixRiskText = (matrix: SarlaftMatrix, r: SarlaftMatrix['risks'][number], withCauses: boolean) => {
  const head = `${r.code} — Delito fuente: ${r.sourceCrime}. ${r.description} (Factores: ${r.riskFactors} · Productos: ${r.products})`;
  if (!withCauses) return `- ${head}`;
  const causeCodes = [...new Set(r.rows.map(x => x.causeCode).filter(Boolean))];
  const causes = causeCodes.map(cc => {
    const cause = matrix.causes.find(c => c.code === cc);
    const ctrls = r.rows.filter(x => x.causeCode === cc && x.controlCode).map(x => x.controlCode);
    return `  - ${cc} [${cause?.factor ?? ''}]: ${cause?.text ?? '(sin detalle)'}\n    Controles vigentes: ${ctrls.join(', ') || 'ninguno'}`;
  });
  return `${head}\nValoración vigente: P${r.probability} L${r.impactLegal} F${r.impactFinancial} C${r.impactContagion} R${r.impactReputational}\nCausas vigentes:\n${causes.join('\n')}`;
};

const analyzeSarlaftCross = async (doc: ScopeDocInput, matrix: SarlaftMatrix, product: { name: string; description: string }) => {
  const instructions = `Eres especialista SARLAFT del Oficial de Cumplimiento de Global66 en Colombia (Global Colombia 81 S.A., vigilada por la SFC). Analiza el documento de alcance del producto "${product.name}" (${product.description}).

1. Perfil del producto en factores de riesgo LA/FT: clientes/contrapartes, productos, canales y jurisdicciones (máx. 80 palabras).
2. Cruce contra TODOS los ${matrix.risks.length} riesgos de la matriz vigente (${matrix.version}): para cada uno, "directo", "indirecto" o "no_aplica", con justificación de máx. 35 palabras basada en el documento.
3. Riesgos LA/FT/FPADM que el producto introduce y que la matriz no contempla (puede ser ninguno): delito fuente, descripción como "ser utilizada para..." y justificación.
4. Conclusión de máx. 80 palabras.

RIESGOS DE LA MATRIZ VIGENTE:
${matrix.risks.map(r => matrixRiskText(matrix, r, false)).join('\n')}

Usa solo información del documento; no inventes hechos. Códigos exactos. Español.`;
  const str = { type: Type.STRING };
  const response = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: sarlaftContents(doc, instructions),
    config: {
      temperature: 0.2,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 1024 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          productProfile: str,
          summary: str,
          cross: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { matrixRiskCode: str, applies: { type: Type.STRING, enum: ['directo', 'indirecto', 'no_aplica'] }, justification: str },
              required: ['matrixRiskCode', 'applies', 'justification'],
            },
          },
          newRisks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { sourceCrime: str, description: str, justification: str },
              required: ['sourceCrime', 'description', 'justification'],
            },
          },
        },
        required: ['productProfile', 'summary', 'cross', 'newRisks'],
      },
    },
  });
  return JSON.parse(response.text ?? '{}') as {
    productProfile: string; summary: string;
    cross: AISarlaftAnalysis['cross'];
    newRisks: { sourceCrime: string; description: string; justification: string }[];
  };
};

const analyzeSarlaftRiskDetail = async (
  doc: ScopeDocInput,
  matrix: SarlaftMatrix,
  product: { name: string; description: string },
  operationalRisks: { id: string; title: string; category: string }[],
  target: { matrixRiskCode: string; sourceCrime: string; description: string; justification: string },
): Promise<AISarlaftRisk> => {
  const base = matrix.risks.find(r => r.code === target.matrixRiskCode);
  const targetText = base
    ? `RIESGO A DETALLAR (de la matriz vigente):\n${matrixRiskText(matrix, base, true)}`
    : `RIESGO A DETALLAR (nuevo, no está en la matriz): Delito fuente: ${target.sourceCrime}. ${target.description}`;
  const instructions = `Eres especialista SARLAFT del Oficial de Cumplimiento de Global66 en Colombia (vigilada por la SFC). Producto: "${product.name}" (${product.description}). Este riesgo aplica al producto porque: ${target.justification}

${targetText}

TAREA:
- Valoración inherente del riesgo para ESTE producto (parte de la vigente si existe y ajústala si el producto cambia la exposición).
- Causas de la matriz que aplican al producto (código exacto) y CAUSAS NUEVAS que el producto introduce y la matriz no cubre (code vacío, máx. 3, redactadas con sujeto + acción + objeto determinado + contexto).
- Para cada causa: controles vigentes que la cubren (código exacto del catálogo) y, si no hay control suficiente, un CONTROL PROPUESTO (code vacío) redactado con sus 4 componentes.
- Califica de 1 a 3 el riesgo, cada causa y cada control según la metodología SFC. El control no puede superar a su causa.
- Relaciona el riesgo con los riesgos operacionales del producto que traten el mismo fenómeno (por id).

BREVEDAD (obligatorio): para causas y controles EXISTENTES deja text, name y description vacíos (se toman de la matriz). Sujeto, acción, objeto, contexto y los 4 componentes: frases de máx. 15 palabras tomadas del texto evaluado; vacío si el elemento no está explícito. sfcObservation: máx. 25 palabras.

${SARLAFT_METHODOLOGY}

${SARLAFT_VALUATION}

CATÁLOGO DE CONTROLES VIGENTES:
${matrix.controls.map(c => `- ${c.code} ${c.name} (${c.tipo}, ${c.naturaleza}): ${c.description.slice(0, 220)}`).join('\n')}

RIESGOS OPERACIONALES DEL PRODUCTO:
${operationalRisks.map(r => `- id ${r.id}: ${r.title} (${r.category})`).join('\n') || '(ninguno)'}

Usa solo información del documento y de la matriz; no inventes hechos. Español.`;
  const str = { type: Type.STRING };
  const int = { type: Type.INTEGER };
  const control = {
    type: Type.OBJECT,
    properties: {
      code: str, name: str, description: str,
      tipo: { type: Type.STRING, enum: ['ESPECÍFICO', 'MULTIPLE', 'TRANSVERSAL'] },
      naturaleza: { type: Type.STRING, enum: ['AUTOMATICO', 'COMBINADO', 'MANUAL'] },
      alertamiento: str, analisis: str, reporte: str, tomaDecisiones: str, sfcScore: int,
    },
    required: ['code', 'name', 'description', 'tipo', 'naturaleza', 'alertamiento', 'analisis', 'reporte', 'tomaDecisiones', 'sfcScore'],
  };
  const cause = {
    type: Type.OBJECT,
    properties: {
      code: str, text: str, factor: str, sujeto: str, accion: str, objeto: str, contexto: str,
      sfcScore: int, sfcObservation: str, controls: { type: Type.ARRAY, items: control },
    },
    required: ['code', 'text', 'factor', 'sujeto', 'accion', 'objeto', 'contexto', 'sfcScore', 'sfcObservation', 'controls'],
  };
  const response = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: sarlaftContents(doc, instructions),
    config: {
      temperature: 0.2,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 1024 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          applicability: { type: Type.STRING, enum: ['directo', 'indirecto'] },
          probability: int, impactLegal: int, impactFinancial: int, impactContagion: int, impactReputational: int,
          sfcRiskScore: int,
          relatedOperationalRiskIds: { type: Type.ARRAY, items: str },
          causes: { type: Type.ARRAY, items: cause },
        },
        required: ['applicability', 'probability', 'impactLegal', 'impactFinancial', 'impactContagion', 'impactReputational',
          'sfcRiskScore', 'relatedOperationalRiskIds', 'causes'],
      },
    },
  });
  const detail = JSON.parse(response.text ?? '{}') as Omit<AISarlaftRisk, 'matrixRiskCode' | 'sourceCrime' | 'description' | 'justification'>;
  return { ...detail, matrixRiskCode: target.matrixRiskCode, sourceCrime: target.sourceCrime, description: target.description, justification: target.justification };
};

export const analyzeSarlaft = async (
  doc: ScopeDocInput,
  matrix: SarlaftMatrix,
  product: { name: string; description: string },
  operationalRisks: { id: string; title: string; category: string }[],
  onProgress?: (message: string) => void,
): Promise<AISarlaftAnalysis> => {
  onProgress?.(`Cruzando contra los ${matrix.risks.length} riesgos de la matriz`);
  const cross = await analyzeSarlaftCross(doc, matrix, product);
  const codes = new Set(matrix.risks.map(r => r.code));
  const targets = [
    ...(cross.cross ?? [])
      .filter(c => c.applies !== 'no_aplica' && codes.has(c.matrixRiskCode))
      .map(c => {
        const m = matrix.risks.find(r => r.code === c.matrixRiskCode)!;
        return { matrixRiskCode: m.code, sourceCrime: m.sourceCrime, description: m.description, justification: c.justification };
      }),
    ...(cross.newRisks ?? []).map(n => ({ matrixRiskCode: '', sourceCrime: n.sourceCrime, description: n.description, justification: n.justification })),
  ];

  const risks: AISarlaftRisk[] = [];
  let done = 0;
  for (let i = 0; i < targets.length; i += SARLAFT_CONCURRENCY) {
    const batch = targets.slice(i, i + SARLAFT_CONCURRENCY);
    onProgress?.(`Detallando causas y controles (${done} de ${targets.length} riesgos)`);
    const results = await Promise.allSettled(batch.map(t => analyzeSarlaftRiskDetail(doc, matrix, product, operationalRisks, t)));
    for (const r of results) if (r.status === 'fulfilled') risks.push(r.value);
    done += batch.length;
  }
  return { productProfile: cross.productProfile, summary: cross.summary, cross: cross.cross ?? [], risks };
};

export const suggestMitigations = async (title: string, description: string, category: string): Promise<string> => {
  const ai = getAI();
  const r = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Para una fintech de remesas (Global81), sugiere plan de mitigación en español para: "${title}" (${category}): ${description}. Máx. 150 palabras.`,
  });
  return r.text ?? '';
};

export const generateCommitteeSummary = async (
  productName: string, gate: number, resolution: string, risks: Risk[], redFlagsCount: number
): Promise<string> => {
  const ai = getAI();
  const highRisks = risks.filter(r => r.riskLevel === 'muy_alto' || r.riskLevel === 'alto').length;
  const r = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Resumen ejecutivo formal en español (máx. 120 palabras) para acta del Comité de Producto Global81: Producto: ${productName} | Gate: ${gate} | Resolución: ${resolution} | Riesgos: ${risks.length} (${highRisks} alto/muy alto) | Red Flags: ${redFlagsCount}`,
  });
  return r.text ?? '';
};

const _: RiskLevel = 'alto'; void _;
