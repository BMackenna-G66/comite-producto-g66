import { RequirementAnswer } from './types';

// Espejo del Excel "Comité Producto.xlsx": una área por hoja, con sus secciones
// y preguntas. Los ids son claves de campo en Firestore (product.requirements.<id>):
// solo minúsculas, dígitos y "_", y no se deben renombrar sin migrar los datos.

export type RequirementAnswerType = 'si_no' | 'in_out' | 'texto';

export interface RequirementQuestion {
  id: string;
  question: string;
  type: RequirementAnswerType;
  // Quién responde según el Excel. La IA propone respuesta para todas; el
  // responsable la valida o corrige.
  owner: string;
  hint?: string;
}

export interface RequirementSection {
  title: string;
  note?: string;
  questions: RequirementQuestion[];
}

export interface RequirementArea {
  id: 'aml' | 'fraude' | 'legal' | 'pdp' | 'sicb';
  label: string;
  inConstruction?: boolean;
  sections: RequirementSection[];
}

const PRODUCTO = 'Insumo de Producto';

const paises = (area: string): RequirementQuestion => ({
  id: `${area}_paises`, question: '¿A qué países le aplica el producto?', type: 'texto', owner: PRODUCTO,
});

const partnerSla = (area: string): RequirementQuestion[] => [
  { id: `${area}_partner_sla`, question: '¿Existen SLA? ¿Cuáles?', type: 'texto', owner: PRODUCTO },
  { id: `${area}_partner_multas_sla`, question: '¿Existen multas por incumplimiento de SLA?', type: 'texto', owner: PRODUCTO },
];

export const REQUIREMENT_AREAS: RequirementArea[] = [
  {
    id: 'aml',
    label: 'AML',
    sections: [
      {
        title: 'General',
        questions: [
          paises('aml'),
          { id: 'aml_oficial_cumplimiento', question: 'Oficial de Cumplimiento', type: 'texto', owner: PRODUCTO, hint: 'Oficial(es) de Cumplimiento según los países donde aplica el producto' },
        ],
      },
      {
        title: 'Matriz',
        questions: [
          { id: 'aml_matriz', question: 'Matriz de riesgos con sus respectivos controles', type: 'texto', owner: 'Equipo AML', hint: 'Se requiere que Vanne entregue la metodología' },
          { id: 'aml_planes_accion', question: 'Planes de acción', type: 'texto', owner: 'Equipo AML', hint: 'Si de la matriz se obtienen acciones a realizar, deben quedar documentadas aquí' },
        ],
      },
      {
        title: 'KYC',
        questions: [
          { id: 'aml_kyc_requiere', question: '¿Requiere KYC?', type: 'si_no', owner: PRODUCTO },
          { id: 'aml_kyc_documentos', question: 'Documentos de vinculación', type: 'texto', owner: 'Equipo KYC', hint: 'Si requiere KYC, KYC debe informar qué requisitos pide para la vinculación' },
        ],
      },
      {
        title: 'KYT',
        questions: [
          { id: 'aml_kyt_monitoreo', question: '¿Requiere monitoreo especial?', type: 'si_no', owner: PRODUCTO },
          { id: 'aml_kyt_alertas', question: 'Alertas a parametrizar', type: 'texto', owner: 'Equipo KYT', hint: 'KYT establece qué requiere de producto para implementar nuevas señales de alerta' },
          { id: 'aml_kyt_partner', question: '¿Integra un nuevo partner?', type: 'si_no', owner: PRODUCTO },
        ],
      },
      {
        title: 'Requisitos del nuevo partner',
        note: 'Aplica si integra un nuevo partner: producto debe suministrarlos.',
        questions: [
          { id: 'aml_partner_politicas', question: 'Políticas del partner', type: 'texto', owner: PRODUCTO },
          { id: 'aml_partner_rfc', question: 'RFC', type: 'texto', owner: PRODUCTO },
          { id: 'aml_partner_canales_rfc', question: 'Canales de comunicación para RFC', type: 'texto', owner: PRODUCTO },
          ...partnerSla('aml'),
          { id: 'aml_partner_contactos', question: 'Matriz de contactos (personas a contactar en casos relacionados a AML)', type: 'texto', owner: PRODUCTO },
        ],
      },
    ],
  },
  {
    id: 'fraude',
    label: 'Fraude',
    sections: [
      { title: 'General', questions: [paises('fraude')] },
      {
        title: 'Motor de Fraude',
        questions: [
          { id: 'fraude_motor', question: '¿Se incluyó el motor de fraude dentro del proyecto?', type: 'si_no', owner: PRODUCTO },
          { id: 'fraude_naturaleza', question: 'Naturaleza de la transacción', type: 'in_out', owner: PRODUCTO },
          { id: 'fraude_reglas', question: '¿Se requieren nuevas reglas de monitoreo?', type: 'si_no', owner: 'Equipo Fraude' },
          { id: 'fraude_alertas', question: 'Alertas a parametrizar', type: 'texto', owner: 'Equipo Fraude', hint: 'Fraude establece qué requiere de producto para implementar nuevas señales de alerta' },
          { id: 'fraude_requiere_limites', question: '¿El producto requiere límites?', type: 'si_no', owner: PRODUCTO },
          { id: 'fraude_limite', question: 'Límite', type: 'texto', owner: 'Comité de Producto', hint: 'Lo define el comité de producto' },
          { id: 'fraude_partner', question: '¿Integra un nuevo partner?', type: 'si_no', owner: PRODUCTO },
        ],
      },
      {
        title: 'Requisitos del nuevo partner',
        note: 'Aplica si integra un nuevo partner: producto debe suministrarlos.',
        questions: [
          { id: 'fraude_partner_politicas', question: 'Políticas del partner relacionadas a fraude', type: 'texto', owner: PRODUCTO },
          { id: 'fraude_partner_canales', question: 'Canales de comunicación para reportar y recibir casos de fraude', type: 'texto', owner: PRODUCTO },
          ...partnerSla('fraude'),
          { id: 'fraude_partner_contactos', question: 'Matriz de contactos (personas a contactar en caso de fraude)', type: 'texto', owner: PRODUCTO },
          { id: 'fraude_partner_devoluciones', question: 'Procedimiento de casos de devoluciones ante recuperaciones', type: 'texto', owner: PRODUCTO },
        ],
      },
    ],
  },
  {
    id: 'legal',
    label: 'Legal',
    sections: [
      { title: 'General', questions: [paises('legal')] },
      {
        title: 'Documentación',
        questions: [
          { id: 'legal_nuevo_contrato', question: '¿Se requiere un nuevo contrato?', type: 'si_no', owner: PRODUCTO },
          { id: 'legal_sociedad', question: '¿Cuál es la sociedad que va a operar el producto?', type: 'texto', owner: PRODUCTO },
          { id: 'legal_licencia', question: '¿Requiere licencia para operar? ¿En qué país?', type: 'si_no', owner: PRODUCTO },
          { id: 'legal_concepto_juridico', question: '¿Requiere concepto jurídico? ¿En qué país?', type: 'si_no', owner: 'Legal' },
          { id: 'legal_aprobacion_regulador', question: '¿Requiere aprobación del regulador? ¿En qué país?', type: 'si_no', owner: 'Legal' },
          { id: 'legal_intercompany', question: '¿Requiere implementar/actualizar contrato intercompany?', type: 'si_no', owner: 'Legal' },
          { id: 'legal_tyc', question: '¿Requiere actualización de Términos y Condiciones?', type: 'si_no', owner: 'Legal' },
          { id: 'legal_normativa', question: '¿Qué normativa aplica y cómo se cumple?', type: 'texto', owner: 'Legal', hint: 'Cada país donde aplique el producto debería tener una matriz normativa con su cumplimiento' },
        ],
      },
    ],
  },
  {
    id: 'pdp',
    label: 'PDP',
    sections: [
      { title: 'General', questions: [paises('pdp')] },
      {
        title: 'Documentación',
        questions: [
          { id: 'pdp_normativa', question: '¿Le aplica normativa de algún país?', type: 'si_no', owner: 'PDP' },
          { id: 'pdp_dato_nuevo', question: '¿Se va a capturar algún dato nuevo a los ya recaudados en otros productos?', type: 'si_no', owner: PRODUCTO },
          { id: 'pdp_politica_privacidad', question: '¿Se requiere modificar la Política de Privacidad?', type: 'si_no', owner: 'PDP' },
          { id: 'pdp_politica_tratamiento', question: '¿Se requiere modificar la Política de Tratamiento de Datos?', type: 'si_no', owner: 'PDP' },
          { id: 'pdp_info_sensible', question: '¿Las transacciones contienen información sensible?', type: 'si_no', owner: PRODUCTO },
        ],
      },
    ],
  },
  {
    id: 'sicb',
    label: 'SICB',
    inConstruction: true,
    sections: [
      {
        title: 'Requisitos',
        questions: [
          { id: 'sicb_microservicios', question: 'Mapa de los microservicios por donde pasará la transacción', type: 'texto', owner: PRODUCTO },
          { id: 'sicb_conexiones_externas', question: '¿Se requiere habilitar conexiones externas con nuevos partners?', type: 'si_no', owner: PRODUCTO },
          { id: 'sicb_accesos_plataformas', question: '¿Se requieren accesos a nuevas plataformas?', type: 'si_no', owner: PRODUCTO },
          { id: 'sicb_nuevos_usuarios', question: '¿Se requiere creación de nuevos usuarios?', type: 'si_no', owner: PRODUCTO },
        ],
      },
    ],
  },
];

export const ALL_REQUIREMENT_QUESTIONS: RequirementQuestion[] =
  REQUIREMENT_AREAS.flatMap(a => a.sections.flatMap(s => s.questions));

export const ANSWER_OPTIONS: Record<Exclude<RequirementAnswerType, 'texto'>, string[]> = {
  si_no: ['SI', 'NO'],
  in_out: ['IN', 'OUT', 'IN/OUT'],
};

export const areaQuestions = (area: RequirementArea) => area.sections.flatMap(s => s.questions);

// Convierte las respuestas de la IA al formato guardado, omitiendo las que un
// miembro ya editó a mano: un reanálisis nunca pisa trabajo humano.
export const mergeAIAnswers = (
  aiAnswers: { id: string; answer: string; detail: string }[],
  existing: Record<string, RequirementAnswer> = {},
): Record<string, RequirementAnswer> => {
  const updatedAt = new Date().toISOString();
  return Object.fromEntries(
    aiAnswers
      .filter(a => existing[a.id]?.origin !== 'manual')
      .map(a => [a.id, { answer: a.answer, detail: a.detail, origin: 'ia' as const, updatedAt, updatedByName: 'Análisis IA' }]),
  );
};
