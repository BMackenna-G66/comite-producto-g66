// Convierte el cruce de la IA en riesgos SARLAFT del producto, validando cada
// código contra la matriz vigente. Los controles existentes toman sus atributos
// del test de controles (no de la IA), para que el residual use la calificación
// real del control.

import { AISarlaftAnalysis, AISarlaftCause, AISarlaftControl } from '../services/geminiService';
import {
  MatrixRisk, SarlaftAnalysisSummary, SarlaftControlType, SarlaftCrossEntry, SarlaftMatrix, SarlaftNature,
  SarlaftProductCause, SarlaftProductControl, SarlaftProductRisk, SfcScore,
} from './types';
import { CONTROL_TYPES, NATURES } from './methodology';

type NewRisk = Omit<SarlaftProductRisk, 'id'>;

const clamp = (n: unknown, min: number, max: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
};
const sfc = (n: unknown) => clamp(n, 1, 3) as SfcScore;
const text = (s: unknown) => String(s ?? '').trim();

const emptyControlSfc = { alertamiento: '', analisis: '', reporte: '', tomaDecisiones: '' };
const emptyCauseSfc = { sujeto: '', accion: '', objeto: '', contexto: '' };

const controlFromMatrix = (matrix: SarlaftMatrix, code: string, ai?: AISarlaftControl): SarlaftProductControl | null => {
  const c = matrix.controls.find(x => x.code === code);
  if (!c) return null;
  return {
    code: c.code, name: c.name, description: c.description,
    tipo: c.tipo, naturaleza: c.naturaleza, periodicidad: c.periodicidad,
    responsabilidad: c.responsabilidad, formalidad: c.formalidad,
    status: 'existente',
    sfc: ai ? {
      alertamiento: text(ai.alertamiento), analisis: text(ai.analisis), reporte: text(ai.reporte), tomaDecisiones: text(ai.tomaDecisiones),
    } : emptyControlSfc,
    sfcScore: ai ? sfc(ai.sfcScore) : 2,
  };
};

const proposedControl = (ai: AISarlaftControl): SarlaftProductControl => ({
  code: '',
  name: text(ai.name) || 'Control propuesto',
  description: text(ai.description),
  tipo: (CONTROL_TYPES.includes(ai.tipo as SarlaftControlType) ? ai.tipo : 'ESPECÍFICO') as SarlaftControlType,
  naturaleza: (NATURES.includes(ai.naturaleza as SarlaftNature) ? ai.naturaleza : 'COMBINADO') as SarlaftNature,
  periodicidad: 'ADECUADO',
  responsabilidad: 'No Asignado',
  formalidad: 'No esta documentado',
  status: 'propuesto',
  sfc: { alertamiento: text(ai.alertamiento), analisis: text(ai.analisis), reporte: text(ai.reporte), tomaDecisiones: text(ai.tomaDecisiones) },
  sfcScore: sfc(ai.sfcScore),
});

const normalizeCause = (matrix: SarlaftMatrix, ai: AISarlaftCause): SarlaftProductCause => {
  const known = matrix.causes.find(c => c.code === text(ai.code));
  const causeScore = sfc(ai.sfcScore);
  const controls = (ai.controls ?? [])
    .map(c => (text(c.code) ? controlFromMatrix(matrix, text(c.code), c) : proposedControl(c)))
    .filter((c): c is SarlaftProductControl => c !== null)
    .map(c => ({ ...c, sfcScore: Math.min(c.sfcScore, causeScore) as SfcScore }));
  return {
    code: known?.code ?? '',
    text: known?.text ?? text(ai.text),
    factor: known?.factor ?? text(ai.factor),
    sfc: { sujeto: text(ai.sujeto), accion: text(ai.accion), objeto: text(ai.objeto), contexto: text(ai.contexto) },
    sfcScore: causeScore,
    sfcObservation: text(ai.sfcObservation),
    controls,
  };
};

// Riesgo del producto armado a partir de la matriz tal cual (sin IA): sus
// causas y controles vigentes, con calificación SFC neutra (2) por revisar.
export const productRiskFromMatrix = (
  matrix: SarlaftMatrix, risk: MatrixRisk, productId: string, byName: string, justification = '',
): NewRisk => {
  const now = new Date().toISOString();
  const causeCodes = [...new Set(risk.rows.map(r => r.causeCode).filter(Boolean))];
  const causes: SarlaftProductCause[] = causeCodes.map(cc => {
    const cause = matrix.causes.find(c => c.code === cc);
    return {
      code: cc, text: cause?.text ?? '', factor: cause?.factor ?? '',
      sfc: emptyCauseSfc, sfcScore: 2, sfcObservation: '',
      controls: risk.rows.filter(r => r.causeCode === cc && r.controlCode)
        .map(r => controlFromMatrix(matrix, r.controlCode))
        .filter((c): c is SarlaftProductControl => c !== null),
    };
  });
  return {
    productId, matrixRiskCode: risk.code, sourceCrime: risk.sourceCrime, description: risk.description,
    applicability: 'directo', justification, associatedRisks: risk.associatedRisks, riskFactors: risk.riskFactors,
    probability: clamp(risk.probability, 1, 5), impactLegal: clamp(risk.impactLegal, 1, 5),
    impactFinancial: clamp(risk.impactFinancial, 1, 5), impactContagion: clamp(risk.impactContagion, 1, 5),
    impactReputational: clamp(risk.impactReputational, 1, 5),
    sfcRiskScore: 2, causes, relatedOperationalRiskIds: [], origin: 'manual', updatedByName: byName,
    createdAt: now, updatedAt: now,
  };
};

export interface SarlaftAnalysisOutput {
  summary: SarlaftAnalysisSummary;
  risks: NewRisk[];
}

export const buildSarlaftAnalysis = (
  ai: AISarlaftAnalysis,
  matrix: SarlaftMatrix,
  productId: string,
  sourceDoc: string,
  operationalRiskIds: string[],
): SarlaftAnalysisOutput => {
  const now = new Date().toISOString();
  const matrixCodes = new Set(matrix.risks.map(r => r.code));
  const opIds = new Set(operationalRiskIds);

  // El cruce debe cubrir todos los riesgos de la matriz; lo que la IA omita
  // queda marcado explícitamente como no evaluado.
  const aiCross = new Map((ai.cross ?? []).filter(c => matrixCodes.has(text(c.matrixRiskCode))).map(c => [text(c.matrixRiskCode), c]));
  const cross: SarlaftCrossEntry[] = matrix.risks.map(r => {
    const c = aiCross.get(r.code);
    const applies = c && ['directo', 'indirecto', 'no_aplica'].includes(c.applies) ? c.applies as SarlaftCrossEntry['applies'] : 'no_aplica';
    return { matrixRiskCode: r.code, applies, justification: c ? text(c.justification) : 'La IA no evaluó este riesgo; requiere revisión manual.' };
  });

  const risks: NewRisk[] = [];
  const detailed = new Set<string>();
  for (const r of ai.risks ?? []) {
    const code = matrixCodes.has(text(r.matrixRiskCode)) ? text(r.matrixRiskCode) : '';
    if (code && detailed.has(code)) continue;
    const base = code ? matrix.risks.find(m => m.code === code)! : null;
    const crossEntry = code ? cross.find(c => c.matrixRiskCode === code) : null;
    // Un riesgo detallado manda sobre un "no aplica" del cruce.
    if (crossEntry && crossEntry.applies === 'no_aplica') {
      crossEntry.applies = r.applicability === 'indirecto' ? 'indirecto' : 'directo';
      crossEntry.justification = text(r.justification) || crossEntry.justification;
    }
    if (code) detailed.add(code);
    risks.push({
      productId,
      matrixRiskCode: code,
      sourceCrime: base?.sourceCrime ?? text(r.sourceCrime),
      description: base?.description ?? text(r.description),
      applicability: r.applicability === 'indirecto' ? 'indirecto' : 'directo',
      justification: text(r.justification),
      associatedRisks: base?.associatedRisks ?? '',
      riskFactors: base?.riskFactors ?? '',
      probability: clamp(r.probability, 1, 5),
      impactLegal: clamp(r.impactLegal, 1, 5),
      impactFinancial: clamp(r.impactFinancial, 1, 5),
      impactContagion: clamp(r.impactContagion, 1, 5),
      impactReputational: clamp(r.impactReputational, 1, 5),
      sfcRiskScore: sfc(r.sfcRiskScore),
      causes: (r.causes ?? []).map(c => normalizeCause(matrix, c)),
      relatedOperationalRiskIds: (r.relatedOperationalRiskIds ?? []).filter(id => opIds.has(id)),
      origin: 'ia',
      updatedByName: 'Análisis IA',
      createdAt: now,
      updatedAt: now,
    });
  }

  // Riesgos que el cruce marca como aplicables pero la IA no detalló: se
  // cargan desde la matriz para que no se pierdan.
  for (const c of cross) {
    if (c.applies === 'no_aplica' || detailed.has(c.matrixRiskCode)) continue;
    const m = matrix.risks.find(x => x.code === c.matrixRiskCode)!;
    risks.push({
      ...productRiskFromMatrix(matrix, m, productId, 'Análisis IA', c.justification),
      applicability: c.applies,
      origin: 'ia',
    });
  }

  return {
    summary: {
      analyzedAt: now,
      matrixVersion: matrix.version,
      sourceDoc,
      summary: text(ai.summary),
      productProfile: text(ai.productProfile),
      cross,
    },
    risks,
  };
};
