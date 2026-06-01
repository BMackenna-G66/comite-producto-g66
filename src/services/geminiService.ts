import { GoogleGenAI, Type } from '@google/genai';
import { Risk, RiskLevel, AIRiskAnalysis } from '../types';

export type { AIRiskAnalysis };

const getAI = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) throw new Error('VITE_GEMINI_API_KEY no configurada. Agrégala en los secrets del repositorio.');
  return new GoogleGenAI({ apiKey: key });
};

// ─── Analyze a free-form document (business case / scope / brief) ────────────
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
    impact: 1 | 2 | 3 | 4 | 5;
    probability: 1 | 2 | 3 | 4 | 5;
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

export const analyzeDocument = async (documentText: string): Promise<DocumentAnalysisResult> => {
  const ai = getAI();

  const prompt = `Eres el Director de Riesgos (CRO) de Global66, una fintech de remesas internacional regulada por CMF (Chile), SFC (Colombia) y BCRA (Argentina), que opera a través de Global81 SpA, GlobalCard S.A., Sedpe y Arpagos.

Analiza el siguiente documento (puede ser un Business Case, alcance de producto, brief, iniciativa estratégica u otro):

---
${documentText}
---

Extrae y estructura toda la información relevante para el Comité de Producto de Global81 SpA. Sé exhaustivo y riguroso. Usa español en todas las respuestas.`;

  const riskSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      category: { type: Type.STRING, description: 'Ej: Riesgo Operacional, AML/Compliance, Fraude, Legal/Normativo, Conducta, Ciberseguridad, Reputacional, Contable, Continuidad del Negocio' },
      riskLevel: { type: Type.STRING, description: 'muy_alto | alto | moderado | bajo | muy_bajo' },
      impact: { type: Type.NUMBER, description: 'Entero del 1 al 5' },
      probability: { type: Type.NUMBER, description: 'Entero del 1 al 5' },
      suggestedControl: { type: Type.STRING },
      isRedFlag: { type: Type.BOOLEAN, description: 'true si el riesgo es un bloqueante crítico para la aprobación del producto' },
    },
    required: ['title', 'description', 'category', 'riskLevel', 'impact', 'probability', 'suggestedControl', 'isRedFlag'],
  };

  const principleSchema = {
    type: Type.OBJECT,
    properties: {
      principle: { type: Type.STRING },
      compliant: { type: Type.BOOLEAN },
      justification: { type: Type.STRING },
    },
    required: ['principle', 'compliant', 'justification'],
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          productName: { type: Type.STRING, description: 'Nombre del producto o iniciativa identificada en el documento' },
          productDescription: { type: Type.STRING, description: 'Descripción técnica y funcional del producto extraída del documento' },
          affectedCompanies: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Empresas del grupo G66 afectadas: Global81 SpA, GlobalCard S.A., Sedpe, Arpagos' },
          affectedProcesses: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Macroprocesos afectados según la taxonomía de G66: Administración Financiera, Cumplimiento Normativo, Continuidad TI, Servicio al Cliente, etc.' },
          risks: { type: Type.ARRAY, items: riskSchema, description: 'Lista exhaustiva de riesgos identificados (mínimo 5, máximo 15)' },
          executiveSummary: { type: Type.STRING, description: 'Resumen ejecutivo de 3-4 oraciones para presentar al Comité' },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Recomendaciones clave antes de aprobar el gate 1' },
          gate1Principles: {
            type: Type.ARRAY,
            items: principleSchema,
            description: 'Evaluación de los 10 principios generales del Comité de Producto',
          },
        },
        required: ['productName', 'productDescription', 'affectedCompanies', 'affectedProcesses', 'risks', 'executiveSummary', 'recommendations', 'gate1Principles'],
      },
    },
  });

  return JSON.parse(response.text ?? '{}') as DocumentAnalysisResult;
};

// ─── Existing helpers ─────────────────────────────────────────────────────────
const riskItemSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    category: { type: Type.STRING },
    riskLevel: { type: Type.STRING },
    suggestedControl: { type: Type.STRING },
    isNew: { type: Type.BOOLEAN },
  },
  required: ['title', 'description', 'category', 'riskLevel', 'suggestedControl', 'isNew'],
};

export const analyzeProductRisks = async (
  productName: string,
  description: string,
  businessCase: string,
  existingRisks: Risk[]
): Promise<AIRiskAnalysis> => {
  const ai = getAI();
  const existingList = existingRisks.map(r => `- ${r.title} (${r.category})`).join('\n');
  const prompt = `Eres el CRO de Global66. Analiza el siguiente producto para el Comité de Producto de Global81 SpA:

**Producto:** ${productName}
**Descripción:** ${description}
**Business Case:** ${businessCase}

Riesgos ya identificados:
${existingList || 'Ninguno aún'}

Identifica hasta 8 riesgos relevantes. Marca isNew=false si ya existe. Usa español.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          risks: { type: Type.ARRAY, items: riskItemSchema },
          summary: { type: Type.STRING },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['risks', 'summary', 'recommendations'],
      },
    },
  });
  return JSON.parse(response.text ?? '{}') as AIRiskAnalysis;
};

export const suggestMitigations = async (riskTitle: string, riskDescription: string, category: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Para una fintech de remesas (Global66/Global81), sugiere un plan de mitigación conciso en español para:
Título: "${riskTitle}" | Descripción: "${riskDescription}" | Categoría: ${category}
Incluye controles preventivos, detectivos y periodicidad. Máximo 150 palabras.`,
  });
  return response.text ?? '';
};

export const generateCommitteeSummary = async (
  productName: string, gate: number, resolution: string, risks: Risk[], redFlagsCount: number
): Promise<string> => {
  const ai = getAI();
  const highRisks = risks.filter(r => r.riskLevel === 'muy_alto' || r.riskLevel === 'alto').length;
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Genera un resumen ejecutivo formal en español (máx. 120 palabras) para el acta del Comité de Producto de Global81 SpA:
Producto: ${productName} | Gate: ${gate} | Resolución: ${resolution} | Riesgos: ${risks.length} (${highRisks} alto/muy alto) | Red Flags: ${redFlagsCount}`,
  });
  return response.text ?? '';
};

// suppress unused
const _: RiskLevel = 'alto'; void _;
