import { GoogleGenAI, Type } from '@google/genai';
import { Risk, RiskLevel, AIRiskAnalysis } from '../types';

export type { AIRiskAnalysis };

const getAI = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) throw new Error('VITE_GEMINI_API_KEY no configurada');
  return new GoogleGenAI({ apiKey: key });
};

const riskItemSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    category: { type: Type.STRING },
    riskLevel: { type: Type.STRING, description: 'muy_alto | alto | moderado | bajo | muy_bajo' },
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

  const prompt = `Eres el Director de Riesgos (CRO) de Global66, una fintech de remesas internacional que opera en Chile, Colombia y Argentina bajo reguladores CMF, SFC y BCRA.

Analiza el siguiente producto/iniciativa para el Comité de Producto de Global81 SpA:

**Producto:** ${productName}
**Descripción:** ${description}
**Business Case:** ${businessCase}

Riesgos ya identificados:
${existingList || 'Ninguno aún'}

Identifica hasta 8 riesgos relevantes considerando: operacional, AML/SARLAFT/SARO, fraude, legal/normativo, conducta, ciberseguridad, reputacional, contable.
Marca isNew=false si el riesgo ya está en la lista de existentes.
Usa español en todas las respuestas.`;

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

export const suggestMitigations = async (
  riskTitle: string,
  riskDescription: string,
  category: string
): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Para una fintech de remesas (Global66/Global81), sugiere un plan de mitigación conciso y accionable en español para:
Título: "${riskTitle}"
Descripción: "${riskDescription}"
Categoría: ${category}

Incluye: controles preventivos, detectivos, y periodicidad recomendada. Máximo 150 palabras.`,
  });
  return response.text ?? '';
};

export const generateCommitteeSummary = async (
  productName: string,
  gate: number,
  resolution: string,
  risks: Risk[],
  redFlagsCount: number
): Promise<string> => {
  const ai = getAI();
  const highRisks = risks.filter(r => r.riskLevel === 'muy_alto' || r.riskLevel === 'alto').length;
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Genera un resumen ejecutivo en español (máximo 120 palabras) para el acta del Comité de Producto de Global81 SpA:
Producto: ${productName}
Gate evaluado: ${gate}
Resolución: ${resolution}
Riesgos identificados: ${risks.length} (${highRisks} de alto/muy alto impacto)
Red Flags activas: ${redFlagsCount}

El resumen debe ser formal, directo y adecuado para un acta de gobierno corporativo.`,
  });
  return response.text ?? '';
};

export const checkPrincipleCompliance = async (
  productDescription: string,
  principle: string
): Promise<{ compliant: boolean; justification: string }> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Para el siguiente producto/servicio de una fintech de remesas, evalúa si cumple el principio indicado.
Producto: "${productDescription}"
Principio: "${principle}"
Responde con JSON: {"compliant": boolean, "justification": "string (máximo 60 palabras en español)"}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          compliant: { type: Type.BOOLEAN },
          justification: { type: Type.STRING },
        },
        required: ['compliant', 'justification'],
      },
    },
  });
  return JSON.parse(response.text ?? '{}') as { compliant: boolean; justification: string };
};

// suppress unused lint — RiskLevel is used in function signatures via AIRiskAnalysis
const _: RiskLevel = 'alto';
void _;
