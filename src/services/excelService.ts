import * as XLSX from 'xlsx';
import { Risk, RISK_LEVEL_LABELS } from '../types';

const RISK_COLUMNS = [
  'Producto', 'Título', 'Descripción', 'Categoría', 'Macroproceso', 'Proceso',
  'Impacto (1-5)', 'Probabilidad (1-5)', 'Riesgo Inherente', 'Nivel de Riesgo',
  'Estado ROAM', 'Responsable', 'Control', 'Periodicidad de Control',
  'Tipo de Control', 'Evidencia de Control', 'Plan de Mitigación',
  'Red Flag', 'Observaciones', 'Creado', 'Actualizado',
] as const;

const riskToRow = (r: Risk, productName: string) => ({
  'Producto': productName,
  'Título': r.title,
  'Descripción': r.description,
  'Categoría': r.category,
  'Macroproceso': r.macroprocess,
  'Proceso': r.process,
  'Impacto (1-5)': r.impact,
  'Probabilidad (1-5)': r.probability,
  'Riesgo Inherente': r.inherentRisk,
  'Nivel de Riesgo': RISK_LEVEL_LABELS[r.riskLevel],
  'Estado ROAM': r.roamStatus,
  'Responsable': r.owner,
  'Control': r.control ?? '',
  'Periodicidad de Control': r.controlPeriodicity ?? '',
  'Tipo de Control': r.controlType ?? '',
  'Evidencia de Control': r.controlEvidence ?? '',
  'Plan de Mitigación': r.mitigationPlan ?? '',
  'Red Flag': r.isRedFlag ? 'Sí' : 'No',
  'Observaciones': r.observations ?? '',
  'Creado': new Date(r.createdAt).toLocaleDateString('es-CL'),
  'Actualizado': new Date(r.updatedAt).toLocaleDateString('es-CL'),
});

// getProductName: resuelve el nombre del producto para cada riesgo (para el
// export global de RisksPage); si se omite, se usa un nombre fijo (para el
// export de un solo producto desde ProductDetailPage).
export const downloadRisksExcel = (
  risks: Risk[],
  filename: string,
  getProductName: (productId: string) => string = () => '',
) => {
  const rows = risks.map(r => riskToRow(r, getProductName(r.productId)));
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...RISK_COLUMNS] });
  sheet['!cols'] = RISK_COLUMNS.map(c => ({ wch: Math.min(Math.max(c.length, 12), 40) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Riesgos');
  XLSX.writeFile(book, filename);
};
