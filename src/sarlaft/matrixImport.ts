// Importa la matriz SARLAFT vigente (Excel GCCO-MAT-014) en el navegador.
// Las columnas se ubican por el texto de su encabezado, no por letra, para
// tolerar filas o columnas agregadas en versiones futuras de la matriz.

import * as XLSX from 'xlsx';
import {
  MatrixCause, MatrixControl, MatrixRisk, SarlaftControlType, SarlaftFormality, SarlaftMatrix, SarlaftNature,
  SarlaftPeriodicity, SarlaftResponsibility,
} from './types';
import { FORMALITIES } from './methodology';

type Grid = string[][];

const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = (s: unknown) => {
  const n = Number(String(s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const gridOf = (wb: XLSX.WorkBook, sheetName: string): Grid =>
  XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });

const findSheet = (wb: XLSX.WorkBook, test: (n: string) => boolean) => wb.SheetNames.find(n => test(norm(n)));

const findHeaderRow = (grid: Grid, test: (cell: string) => boolean) =>
  grid.findIndex(row => row.some(c => test(norm(c))));

const colIndex = (row: string[], test: (cell: string) => boolean) => row.findIndex(c => test(norm(c)));

const toControlType = (s: string): SarlaftControlType => {
  const n = norm(s);
  return n.startsWith('TRANS') ? 'TRANSVERSAL' : n.startsWith('MULT') ? 'MULTIPLE' : 'ESPECÍFICO';
};
const toNature = (s: string): SarlaftNature => {
  const n = norm(s);
  return n.startsWith('AUT') ? 'AUTOMATICO' : n.startsWith('MAN') ? 'MANUAL' : 'COMBINADO';
};
const toPeriodicity = (s: string): SarlaftPeriodicity => (norm(s).startsWith('NO') ? 'NO ADECUADO' : 'ADECUADO');
const toResponsibility = (s: string): SarlaftResponsibility => (norm(s).startsWith('NO') ? 'No Asignado' : 'Asignado');
const toFormality = (s: string): SarlaftFormality => {
  const n = norm(s);
  return FORMALITIES.find(f => norm(f) === n)
    ?? (n.includes('DIVULG') ? 'Documentado, aprobado y divulgado'
      : n.includes('APROB') ? 'Documentado y Aprobado'
        : n.startsWith('NO') ? 'No esta documentado' : 'Documentado');
};

const parseControls = (wb: XLSX.WorkBook, warnings: string[]): MatrixControl[] => {
  const sheet = findSheet(wb, n => n.includes('TEST') && n.includes('CONTROL'));
  if (!sheet) { warnings.push('No se encontró la hoja de test de controles.'); return []; }
  const g = gridOf(wb, sheet);
  const h = findHeaderRow(g, c => c.startsWith('CODIGO DEL CONTROL'));
  if (h < 0) { warnings.push(`La hoja "${sheet}" no tiene el encabezado "CÓDIGO DEL CONTROL".`); return []; }
  const head = g[h];
  const ci = {
    code: colIndex(head, c => c.startsWith('CODIGO DEL CONTROL')),
    name: colIndex(head, c => c === 'CONTROL'),
    desc: colIndex(head, c => c.startsWith('DESCRIPCION')),
    tipo: colIndex(head, c => c.startsWith('TIPO')),
    formalidad: colIndex(head, c => c.startsWith('FORMALIDAD')),
    naturaleza: colIndex(head, c => c.startsWith('NATURALEZA')),
    periodicidad: colIndex(head, c => c.startsWith('PERIODICIDAD')),
    responsabilidad: colIndex(head, c => c.startsWith('RESPONSABILIDAD')),
    evidence: colIndex(head, c => c.startsWith('EVIDENCIA')),
    document: colIndex(head, c => c.startsWith('DOCUMENTO')),
  };
  const at = (row: string[], i: number) => (i >= 0 ? clean(row[i]) : '');
  return g.slice(h + 1)
    .filter(row => /^CO\//i.test(at(row, ci.code)))
    .map(row => ({
      code: at(row, ci.code),
      name: at(row, ci.name),
      description: at(row, ci.desc),
      tipo: toControlType(at(row, ci.tipo)),
      formalidad: toFormality(at(row, ci.formalidad)),
      naturaleza: toNature(at(row, ci.naturaleza)),
      periodicidad: toPeriodicity(at(row, ci.periodicidad)),
      responsabilidad: toResponsibility(at(row, ci.responsabilidad)),
      evidence: at(row, ci.evidence),
      document: at(row, ci.document),
    }));
};

const parseCauses = (wb: XLSX.WorkBook, warnings: string[]): MatrixCause[] => {
  const sheet = findSheet(wb, n => n === 'CAUSAS');
  if (!sheet) { warnings.push('No se encontró la hoja "Causas".'); return []; }
  const g = gridOf(wb, sheet);
  const h = findHeaderRow(g, c => c === 'CODIGO');
  if (h < 0) { warnings.push('La hoja "Causas" no tiene el encabezado "CODIGO".'); return []; }
  const head = g[h];
  const ci = {
    code: colIndex(head, c => c === 'CODIGO'),
    text: colIndex(head, c => c === 'CAUSAS'),
    tipo: colIndex(head, c => c === 'TIPO'),
    factor: colIndex(head, c => c === 'FACTOR'),
    signals: colIndex(head, c => c.startsWith('SENALES')),
  };
  return g.slice(h + 1)
    .filter(row => /^C-\d+/i.test(clean(row[ci.code])))
    .map(row => ({
      code: clean(row[ci.code]),
      text: clean(row[ci.text]),
      tipo: clean(row[ci.tipo]),
      factor: clean(row[ci.factor]),
      alertSignals: ci.signals >= 0 ? String(row[ci.signals] ?? '').trim() : '',
    }));
};

const parseRiskMap = (wb: XLSX.WorkBook, warnings: string[]): MatrixRisk[] => {
  // Mapa consolidado: la primera hoja "Mapa_de_riesgos..." (no el mapa térmico).
  const sheet = findSheet(wb, n => n.startsWith('MAPA_DE_RIESGOS') || n.startsWith('MAPA DE RIESGOS'));
  if (!sheet) { warnings.push('No se encontró la hoja del mapa de riesgos consolidado.'); return []; }
  const g = gridOf(wb, sheet);
  const h = findHeaderRow(g, c => c === 'CODIGO RIESGO');
  if (h < 0) { warnings.push(`La hoja "${sheet}" no tiene el encabezado "CÓDIGO RIESGO".`); return []; }
  const head = g[h];
  const ci = {
    crime: colIndex(head, c => c === 'DELITO FUENTE'),
    code: colIndex(head, c => c === 'CODIGO RIESGO'),
    desc: colIndex(head, c => c === 'DESCRIPCION DEL RIESGO'),
    associated: colIndex(head, c => c === 'RIESGOS ASOCIADOS'),
    factor: colIndex(head, c => c === 'FACTOR DE RIESGO'),
    products: colIndex(head, c => c === 'PRODUCTOS'),
    causeCode: colIndex(head, c => c === 'CODIGO CAUSA'),
    probability: colIndex(head, c => c.startsWith('VALORACION RIESGO INHERENTE')),
    controlCode: colIndex(head, c => c === 'CODIGO CONTROL'),
    residual: colIndex(head, c => c.startsWith('VALOR RIESGO RESIDUAL') || c.startsWith('VALORACION RIESGO RESIDUAL')),
  };
  // Las subcolumnas de impacto L, F, C, R están 2 filas bajo el encabezado.
  const subRow = g.slice(h + 1, h + 4).findIndex(row => row.some(c => norm(c) === 'L') && row.some(c => norm(c) === 'R'));
  if (subRow < 0) { warnings.push('No se encontraron las columnas de impacto L/F/C/R.'); return []; }
  const sub = g[h + 1 + subRow];
  const ii = { L: colIndex(sub, c => c === 'L'), F: colIndex(sub, c => c === 'F'), C: colIndex(sub, c => c === 'C'), R: colIndex(sub, c => c === 'R') };
  const scoreRow = g.slice(h + 1, h + 4).find(row => row.some(c => norm(c) === 'SCORE')) ?? [];
  const scoreCols = scoreRow.map((c, i) => (norm(c) === 'SCORE' ? i : -1)).filter(i => i >= 0);
  const inherentScoreCol = scoreCols[0] ?? -1;
  const residualScoreCol = scoreCols.find(i => i > ci.residual) ?? -1;

  const risks: MatrixRisk[] = [];
  let current: MatrixRisk | null = null;
  let lastCause = '';
  for (const row of g.slice(h + 2 + subRow)) {
    const code = clean(row[ci.code]);
    if (/^R-/i.test(code)) {
      current = {
        code,
        sourceCrime: clean(row[ci.crime]),
        description: clean(row[ci.desc]),
        associatedRisks: clean(row[ci.associated]),
        riskFactors: clean(row[ci.factor]),
        products: clean(row[ci.products]),
        probability: num(row[ci.probability]),
        impactLegal: num(row[ii.L]),
        impactFinancial: num(row[ii.F]),
        impactContagion: num(row[ii.C]),
        impactReputational: num(row[ii.R]),
        rows: [],
        excelInherentScore: inherentScoreCol >= 0 ? num(row[inherentScoreCol]) || null : null,
        excelResidualScore: residualScoreCol >= 0 ? num(row[residualScoreCol]) || null : null,
      };
      risks.push(current);
      lastCause = '';
    }
    if (!current) continue;
    const ownCause = /^C-\d+/i.test(clean(row[ci.causeCode])) ? clean(row[ci.causeCode]) : '';
    const controlCode = /^CO\//i.test(clean(row[ci.controlCode])) ? clean(row[ci.controlCode]) : '';
    // Las filas sin causa ni control propios (relleno, fórmulas sobrantes al
    // final de la hoja) no son pares causa → control.
    if (!ownCause && !controlCode) continue;
    // Una causa con varios controles viene combinada en varias filas.
    const causeCode = ownCause || lastCause;
    lastCause = causeCode;
    current.rows.push({ causeCode, controlCode });
  }
  return risks;
};

const versionFrom = (fileName: string, wb: XLSX.WorkBook) => {
  const fileVersion = fileName.match(/V\s?\d+(\s?Rev\s?\d+)?/i)?.[0] ?? '';
  const guide = findSheet(wb, n => n.startsWith('GUIA'));
  let lastEntry = '';
  if (guide) {
    const g = gridOf(wb, guide);
    const h = findHeaderRow(g, c => c === 'CONTROL DE VERSIONES');
    if (h >= 0) {
      const entries = g.slice(h + 1).map(r => clean(r[0])).filter(v => /^\d{4}/.test(v));
      lastEntry = entries[entries.length - 1] ?? '';
    }
  }
  return [fileVersion, lastEntry && `act. ${lastEntry}`].filter(Boolean).join(' · ') || fileName;
};

export interface MatrixImportResult {
  matrix: Omit<SarlaftMatrix, 'importedAt' | 'importedByName'>;
  warnings: string[];
}

export const parseSarlaftMatrix = (data: ArrayBuffer, fileName: string): MatrixImportResult => {
  const wb = XLSX.read(data, { type: 'array' });
  const warnings: string[] = [];
  const controls = parseControls(wb, warnings);
  const causes = parseCauses(wb, warnings);
  const risks = parseRiskMap(wb, warnings);

  const controlCodes = new Set(controls.map(c => c.code));
  const causeCodes = new Set(causes.map(c => c.code));
  const missingControls = new Set(risks.flatMap(r => r.rows.map(x => x.controlCode)).filter(c => c && !controlCodes.has(c)));
  const missingCauses = new Set(risks.flatMap(r => r.rows.map(x => x.causeCode)).filter(c => c && !causeCodes.has(c)));
  if (missingControls.size) warnings.push(`Controles usados en el mapa sin ficha en el test de controles: ${[...missingControls].join(', ')}. No reducen el residual.`);
  if (missingCauses.size) warnings.push(`Causas usadas en el mapa sin detalle en la hoja Causas: ${[...missingCauses].join(', ')}.`);
  if (risks.length === 0) warnings.push('No se encontró ningún riesgo en el mapa.');

  return { matrix: { version: versionFrom(fileName, wb), sourceFile: fileName, risks, causes, controls }, warnings };
};
