import { GoogleGenAI, Type, Part } from '@google/genai';
import { Risk, RiskLevel, AIRiskAnalysis } from '../types';

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
    model: 'gemini-2.5-flash-preview-05-20',
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
    model: 'gemini-2.5-flash-preview-05-20',
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
    model: 'gemini-2.5-flash-preview-05-20',
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

export const suggestMitigations = async (title: string, description: string, category: string): Promise<string> => {
  const ai = getAI();
  const r = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-05-20',
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
    model: 'gemini-2.5-flash-preview-05-20',
    contents: `Resumen ejecutivo formal en español (máx. 120 palabras) para acta del Comité de Producto Global81: Producto: ${productName} | Gate: ${gate} | Resolución: ${resolution} | Riesgos: ${risks.length} (${highRisks} alto/muy alto) | Red Flags: ${redFlagsCount}`,
  });
  return r.text ?? '';
};

const _: RiskLevel = 'alto'; void _;
