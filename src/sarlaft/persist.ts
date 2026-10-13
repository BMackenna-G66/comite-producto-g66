import { createSarlaftRisk, deleteSarlaftRisk, updateProduct } from '../services/firestore';
import { SarlaftAnalysisOutput } from './analysis';
import { SarlaftProductRisk } from './types';

// Un nuevo cruce reemplaza los riesgos SARLAFT generados por IA. Los editados a
// mano se conservan y mandan sobre la IA para el mismo riesgo de la matriz.
export const persistSarlaftAnalysis = async (
  productId: string,
  output: SarlaftAnalysisOutput,
  previous: SarlaftProductRisk[],
): Promise<SarlaftProductRisk[]> => {
  const manual = previous.filter(r => r.origin === 'manual');
  const manualCodes = new Set(manual.map(r => r.matrixRiskCode).filter(Boolean));
  for (const r of previous.filter(r => r.origin === 'ia')) await deleteSarlaftRisk(r.id);
  const created: SarlaftProductRisk[] = [];
  for (const r of output.risks) {
    if (r.matrixRiskCode && manualCodes.has(r.matrixRiskCode)) continue;
    const data = { ...r, productId };
    created.push({ ...data, id: await createSarlaftRisk(data) });
  }
  await updateProduct(productId, { sarlaftAnalysis: output.summary });
  return [...manual, ...created];
};
