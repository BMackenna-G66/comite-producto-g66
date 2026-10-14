// Motor de cálculo SARLAFT. Replica las fórmulas de la matriz GCCO-MAT-014
// (hojas Mapa_de_riesgos, Test_de_controles, listas_de_valoración y
// Criterios_de_valoración) y la calificación de coherencia de la "Guía para la
// evaluación de identificación de riesgos de LA/FT/FPADM" de la SFC (dic-2025).
// Solo contiene la metodología; el contenido de la matriz (riesgos, causas y
// controles de la entidad) es confidencial y se importa a Firestore.

import {
  SarlaftAcceptability, SarlaftControlAttributes, SarlaftControlRating, SarlaftControlType,
  SarlaftFormality, SarlaftNature, SarlaftPeriodicity, SarlaftProductRisk, SarlaftResponsibility,
  SarlaftSeverity, SfcScore,
} from './types';

// ROUND de Excel (mitad hacia arriba) sin el error de coma flotante de JS
// (p. ej. 3.5 representado como 3.4999999999999996).
export const excelRound = (x: number) => Math.round(Number(x.toPrecision(12)));

// ─── Valoración inherente ───────────────────────────────────────────────────

export const IMPACT_WEIGHTS = { legal: 0.6, financial: 0.2, contagion: 0.15, reputational: 0.15 };

export const PROBABILITY_CRITERIA: { level: number; label: string; criterion: string }[] = [
  { level: 1, label: 'Muy baja', criterion: 'La actividad que conlleva el riesgo se ejecuta como máximo 1 vez al año' },
  { level: 2, label: 'Baja', criterion: 'La actividad se ejecuta como máximo 1 vez o más en el semestre' },
  { level: 3, label: 'Moderada', criterion: 'La actividad se ejecuta como máximo 1 vez o más en el trimestre' },
  { level: 4, label: 'Alta', criterion: 'La actividad se ejecuta 1 o más veces en el mes' },
  { level: 5, label: 'Muy alta', criterion: 'La actividad se ejecuta diariamente' },
];

export const IMPACT_CRITERIA: {
  level: number; label: string; legal: string; financial: string; contagion: string; reputational: string;
}[] = [
  { level: 1, label: 'Inferior', legal: 'Recomendación del ente de control / tercero', financial: 'Afectación menor a COP 82.125.000', contagion: 'Usuario o proveedor involucrado en LA/FT', reputational: 'Afectación interna' },
  { level: 2, label: 'Menor', legal: 'Glosa de órganos de vigilancia / tercero', financial: 'Entre COP 82.125.001 y 164.250.000', contagion: 'Cliente involucrado en LA/FT', reputational: 'Afectación a la entidad' },
  { level: 3, label: 'Importante', legal: 'Glosa para efectos jurídicos', financial: 'Entre COP 164.250.001 y 246.375.000', contagion: 'Funcionario involucrado en LA/FT', reputational: 'Afectación a nivel sectorial' },
  { level: 4, label: 'Mayor', legal: 'Multas o sanciones de órganos de vigilancia / tercero', financial: 'Entre COP 246.375.001 y 328.500.000', contagion: 'Directivo (presidente, VP, junta, gestor de riesgos) involucrado en LA/FT', reputational: 'Afectación a nivel nacional' },
  { level: 5, label: 'Superior', legal: 'Intervención / cierre de la empresa, producto o servicio', financial: 'Mayor a COP 328.500.001', contagion: 'Accionistas principales (>10 %) involucrados en LA/FT', reputational: 'Afectación a nivel internacional' },
];

export const totalImpact = (legal: number, financial: number, contagion: number, reputational: number) =>
  excelRound(
    legal * IMPACT_WEIGHTS.legal + financial * IMPACT_WEIGHTS.financial +
    contagion * IMPACT_WEIGHTS.contagion + reputational * IMPACT_WEIGHTS.reputational,
  );

export const severityOf = (score: number): SarlaftSeverity =>
  score <= 3 ? 'BAJO' : score <= 9 ? 'MODERADO' : score <= 16 ? 'ALTO' : 'EXTREMO';

export const acceptabilityOf = (score: number): SarlaftAcceptability => (score <= 9 ? 'ACEPTABLE' : 'INACEPTABLE');

export const SEVERITY_COLORS: Record<SarlaftSeverity, string> = {
  BAJO: 'bg-green-100 text-green-800',
  MODERADO: 'bg-yellow-100 text-yellow-800',
  ALTO: 'bg-orange-100 text-orange-800',
  EXTREMO: 'bg-red-100 text-red-800',
};

// ─── Calidad del control (Test_de_controles) ───────────────────────────────

export const CONTROL_TYPES: SarlaftControlType[] = ['ESPECÍFICO', 'MULTIPLE', 'TRANSVERSAL'];
export const NATURES: SarlaftNature[] = ['AUTOMATICO', 'COMBINADO', 'MANUAL'];
export const PERIODICITIES: SarlaftPeriodicity[] = ['ADECUADO', 'NO ADECUADO'];
export const RESPONSIBILITIES: SarlaftResponsibility[] = ['Asignado', 'No Asignado'];
export const FORMALITIES: SarlaftFormality[] = [
  'No esta documentado', 'Documentado', 'Documentado y Aprobado', 'Documentado, aprobado y divulgado',
];

// Puntos ya ponderados: tipo (40), naturaleza (20), periodicidad (10),
// responsabilidad (20), formalidad (10). Máximo 100.
const POINTS = {
  tipo: { 'ESPECÍFICO': 40, MULTIPLE: 20, TRANSVERSAL: 8 } as Record<SarlaftControlType, number>,
  naturaleza: { AUTOMATICO: 20, COMBINADO: 10, MANUAL: 4 } as Record<SarlaftNature, number>,
  periodicidad: { ADECUADO: 10, 'NO ADECUADO': 1 } as Record<SarlaftPeriodicity, number>,
  responsabilidad: { Asignado: 20, 'No Asignado': 0 } as Record<SarlaftResponsibility, number>,
  formalidad: {
    'No esta documentado': 0, Documentado: 2, 'Documentado y Aprobado': 6, 'Documentado, aprobado y divulgado': 10,
  } as Record<SarlaftFormality, number>,
};

export const controlQuality = (c: SarlaftControlAttributes) =>
  (POINTS.tipo[c.tipo] ?? 0) + (POINTS.naturaleza[c.naturaleza] ?? 0) + (POINTS.periodicidad[c.periodicidad] ?? 0) +
  (POINTS.responsabilidad[c.responsabilidad] ?? 0) + (POINTS.formalidad[c.formalidad] ?? 0);

export const controlRating = (quality: number): SarlaftControlRating =>
  quality <= 60 ? 'DEBIL' : quality <= 90 ? 'BUENO' : 'EXCELENTE';

// Factores de reducción de probabilidad e impacto por tipo + naturaleza +
// calificación (listas_de_valoración). Un control transversal no reduce
// probabilidad y no puede ser EXCELENTE (su máximo es 68 puntos).
const REDUCTION: Record<string, [number, number]> = {
  'ESPECÍFICO-AUT-EXC': [0.7, 0.6], 'ESPECÍFICO-COM-EXC': [0.5, 0.5], 'ESPECÍFICO-MAN-EXC': [0.4, 0.4],
  'ESPECÍFICO-AUT-BUE': [0.6, 0.5], 'ESPECÍFICO-COM-BUE': [0.5, 0.4], 'ESPECÍFICO-MAN-BUE': [0.4, 0.3],
  'ESPECÍFICO-AUT-DEB': [0.5, 0.3], 'ESPECÍFICO-COM-DEB': [0.4, 0.2], 'ESPECÍFICO-MAN-DEB': [0.3, 0.1],
  'MULTIPLE-AUT-EXC': [0.5, 0.7], 'MULTIPLE-COM-EXC': [0.4, 0.6], 'MULTIPLE-MAN-EXC': [0.3, 0.5],
  'MULTIPLE-AUT-BUE': [0.4, 0.6], 'MULTIPLE-COM-BUE': [0.3, 0.5], 'MULTIPLE-MAN-BUE': [0.2, 0.4],
  'MULTIPLE-AUT-DEB': [0.3, 0.5], 'MULTIPLE-COM-DEB': [0.1, 0.4], 'MULTIPLE-MAN-DEB': [0, 0.3],
  'TRANSVERSAL-AUT-BUE': [0, 0.7], 'TRANSVERSAL-COM-BUE': [0, 0.5], 'TRANSVERSAL-MAN-BUE': [0, 0.3],
  'TRANSVERSAL-AUT-DEB': [0, 0.6], 'TRANSVERSAL-COM-DEB': [0, 0.4], 'TRANSVERSAL-MAN-DEB': [0, 0.2],
};

export const reductionFactors = (c: SarlaftControlAttributes): { probability: number; impact: number } => {
  const key = `${c.tipo}-${c.naturaleza.slice(0, 3)}-${controlRating(controlQuality(c)).slice(0, 3)}`;
  const [probability, impact] = REDUCTION[key] ?? [0, 0];
  return { probability, impact };
};

// ─── Valoración de un riesgo (inherente y residual) ────────────────────────

export interface SarlaftValuation {
  impact: number;
  inherentScore: number;
  inherentSeverity: SarlaftSeverity;
  inherentAcceptability: SarlaftAcceptability;
  residualProbability: number;
  residualImpact: number;
  residualScore: number;
  residualSeverity: SarlaftSeverity;
  residualAcceptability: SarlaftAcceptability;
  activeControlRows: number;
}

// Residual = (P − promedio de P·reducciónP) × (I − promedio de I·reducciónI),
// promediando sobre cada par causa → control, como en la matriz. Si no hay
// controles que operen, el residual es igual al inherente.
export const valueRisk = (
  probability: number,
  impacts: { legal: number; financial: number; contagion: number; reputational: number },
  controls: SarlaftControlAttributes[],
): SarlaftValuation => {
  const impact = totalImpact(impacts.legal, impacts.financial, impacts.contagion, impacts.reputational);
  const inherentScore = probability * impact;
  let residualProbability = probability;
  let residualImpact = impact;
  if (controls.length > 0) {
    const factors = controls.map(reductionFactors);
    const avgP = factors.reduce((s, f) => s + probability * f.probability, 0) / factors.length;
    const avgI = factors.reduce((s, f) => s + impact * f.impact, 0) / factors.length;
    residualProbability = probability - avgP;
    residualImpact = impact - avgI;
  }
  const residualScore = excelRound(residualProbability * residualImpact);
  return {
    impact,
    inherentScore,
    inherentSeverity: severityOf(inherentScore),
    inherentAcceptability: acceptabilityOf(inherentScore),
    residualProbability,
    residualImpact,
    residualScore,
    residualSeverity: severityOf(residualScore),
    residualAcceptability: acceptabilityOf(residualScore),
    activeControlRows: controls.length,
  };
};

export const valueProductRisk = (r: SarlaftProductRisk) =>
  valueRisk(
    r.probability,
    { legal: r.impactLegal, financial: r.impactFinancial, contagion: r.impactContagion, reputational: r.impactReputational },
    r.causes.flatMap(c => c.controls.filter(ctl => ctl.status === 'existente')),
  );

// ─── Coherencia según la guía SFC ──────────────────────────────────────────

export const SFC_SCORE_LABELS: Record<SfcScore, string> = { 1: 'Débil', 2: 'Necesita mejorar', 3: 'Adecuado' };
export const SFC_EXPECTED_COHERENCE = 0.8;
export const SFC_MIN_COHERENCE = 1 / 3;

// Cada registro riesgo → causa → control suma de 3 a 9. El control no puede
// calificar por encima de su causa. La SFC evalúa la matriz tal como está, así
// que solo cuentan las causas de la matriz y sus controles existentes: lo que
// la IA propone (y califica ella misma) inflaría el indicador. Una causa sin
// control existente cuenta como un registro con control débil (1).
export const coherenceRecords = (risks: SarlaftProductRisk[]) =>
  risks.flatMap(r =>
    r.causes.filter(c => c.code).flatMap(c => {
      const existing = c.controls.filter(ctl => ctl.status === 'existente');
      const controlScores = existing.length > 0 ? existing.map(ctl => ctl.sfcScore) : [1];
      return controlScores.map(cs => r.sfcRiskScore + c.sfcScore + Math.min(cs, c.sfcScore));
    }),
  );

export const coherenceIndicator = (risks: SarlaftProductRisk[]): number | null => {
  const records = coherenceRecords(risks);
  if (records.length === 0) return null;
  return records.reduce((s, x) => s + x, 0) / (9 * records.length);
};
