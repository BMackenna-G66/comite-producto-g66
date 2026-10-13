// Tipos de la metodología SARLAFT (riesgo LA/FT/FPADM). Viven aparte de los
// riesgos operacionales (colección `risks`), que siguen su propia metodología.

export type SarlaftControlType = 'ESPECÍFICO' | 'MULTIPLE' | 'TRANSVERSAL';
export type SarlaftNature = 'AUTOMATICO' | 'COMBINADO' | 'MANUAL';
export type SarlaftPeriodicity = 'ADECUADO' | 'NO ADECUADO';
export type SarlaftResponsibility = 'Asignado' | 'No Asignado';
export type SarlaftFormality =
  | 'No esta documentado'
  | 'Documentado'
  | 'Documentado y Aprobado'
  | 'Documentado, aprobado y divulgado';
export type SarlaftSeverity = 'BAJO' | 'MODERADO' | 'ALTO' | 'EXTREMO';
export type SarlaftAcceptability = 'ACEPTABLE' | 'INACEPTABLE';
export type SarlaftControlRating = 'DEBIL' | 'BUENO' | 'EXCELENTE';
// Calificación de la guía SFC: 1 Débil, 2 Necesita mejorar, 3 Adecuado.
export type SfcScore = 1 | 2 | 3;

export interface SarlaftControlAttributes {
  tipo: SarlaftControlType;
  naturaleza: SarlaftNature;
  periodicidad: SarlaftPeriodicity;
  responsabilidad: SarlaftResponsibility;
  formalidad: SarlaftFormality;
}

// ─── Matriz vigente (importada del Excel; NO va en el código: es confidencial) ─

export interface MatrixControl extends SarlaftControlAttributes {
  code: string;
  name: string;
  description: string;
  evidence: string;
  document: string;
}

export interface MatrixCause {
  code: string;
  text: string;
  tipo: string;
  factor: string;
  alertSignals: string;
}

export interface MatrixRisk {
  code: string;
  sourceCrime: string;
  description: string;
  associatedRisks: string;
  riskFactors: string;
  products: string;
  probability: number;
  impactLegal: number;
  impactFinancial: number;
  impactContagion: number;
  impactReputational: number;
  // Cada fila de la matriz es un par causa → control del riesgo.
  rows: { causeCode: string; controlCode: string }[];
  // Valores que calculó el propio Excel, para contrastar con el motor.
  excelInherentScore: number | null;
  excelResidualScore: number | null;
}

export interface SarlaftMatrix {
  version: string;
  sourceFile: string;
  importedAt: string;
  importedByName: string;
  risks: MatrixRisk[];
  causes: MatrixCause[];
  controls: MatrixControl[];
}

// ─── Riesgos SARLAFT de un producto (colección `sarlaftRisks`) ──────────────

export interface SfcCauseElements {
  sujeto: string;
  accion: string;
  objeto: string;
  contexto: string;
}

export interface SfcControlComponents {
  alertamiento: string;
  analisis: string;
  reporte: string;
  tomaDecisiones: string;
}

export interface SarlaftProductControl extends SarlaftControlAttributes {
  code: string; // '' = control propuesto, no existe en la matriz
  name: string;
  description: string;
  // Solo los controles existentes reducen el riesgo residual; un control
  // propuesto aún no opera.
  status: 'existente' | 'propuesto';
  sfc: SfcControlComponents;
  sfcScore: SfcScore;
}

export interface SarlaftProductCause {
  code: string; // '' = causa nueva que el producto introduce
  text: string;
  factor: string;
  sfc: SfcCauseElements;
  sfcScore: SfcScore;
  sfcObservation: string;
  controls: SarlaftProductControl[];
}

export interface SarlaftProductRisk {
  id: string;
  productId: string;
  matrixRiskCode: string; // '' = riesgo nuevo, no está en la matriz vigente
  sourceCrime: string;
  description: string;
  applicability: 'directo' | 'indirecto';
  justification: string;
  associatedRisks: string;
  riskFactors: string;
  probability: number;
  impactLegal: number;
  impactFinancial: number;
  impactContagion: number;
  impactReputational: number;
  sfcRiskScore: SfcScore;
  causes: SarlaftProductCause[];
  relatedOperationalRiskIds: string[];
  origin: 'ia' | 'manual';
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

// Resultado del cruce de un producto contra los riesgos de la matriz vigente.
export interface SarlaftCrossEntry {
  matrixRiskCode: string;
  applies: 'directo' | 'indirecto' | 'no_aplica';
  justification: string;
}

export interface SarlaftAnalysisSummary {
  analyzedAt: string;
  matrixVersion: string;
  sourceDoc: string;
  summary: string;
  productProfile: string;
  cross: SarlaftCrossEntry[];
}
