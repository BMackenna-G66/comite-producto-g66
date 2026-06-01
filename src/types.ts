export type UserRole = 'admin' | 'member' | 'observer' | 'pending';
export type GateStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'blocked';
export type ProductStatus = 'draft' | 'gate1' | 'gate2' | 'gate3' | 'approved' | 'rejected';
export type RiskLevel = 'muy_alto' | 'alto' | 'moderado' | 'bajo' | 'muy_bajo';
export type RoamState = 'Owned' | 'Accepted' | 'Mitigated' | 'Resolved';
export type CommitteeResolution = 'APROBADO' | 'RECHAZADO' | 'APROBADO_CON_CONDICIONANTES' | 'PENDIENTE';

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  role: UserRole;
  company: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  businessCase: string;
  owner: string;
  ownerName: string;
  companies: string[];
  status: ProductStatus;
  currentGate: 1 | 2 | 3;
  gate1Status: GateStatus;
  gate2Status: GateStatus;
  gate3Status: GateStatus;
  createdAt: string;
  updatedAt: string;
  publicTarget?: string;
  principles?: Record<string, { compliant: boolean; observations: string }>;
  designFlows?: string;
  legalContracts?: string;
  sarlaftSaro?: string;
  technicalSpecs?: string;
  postSaleMonitoring?: string;
}

export interface Risk {
  id: string;
  productId: string;
  title: string;
  description: string;
  category: string;
  macroprocess: string;
  process: string;
  impact: 1 | 2 | 3 | 4 | 5;
  probability: 1 | 2 | 3 | 4 | 5;
  inherentRisk: number;
  riskLevel: RiskLevel;
  control?: string;
  controlPeriodicity?: string;
  controlEvidence?: string;
  controlType?: string;
  roamStatus: RoamState;
  owner: string;
  mitigationPlan?: string;
  isRedFlag: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommitteeSession {
  id: string;
  productId: string;
  productName: string;
  sessionId: string;
  gate: 1 | 2 | 3;
  sessionDate: string;
  secretaryId: string;
  secretaryName: string;
  presidentId: string;
  presidentName: string;
  attendees: Attendee[];
  quorumAchieved: boolean;
  conflictDeclarations: ConflictDeclaration[];
  principlesEvaluation: PrincipleEvaluation[];
  redFlags: RedFlag[];
  memberOpinions: MemberOpinion[];
  votes: Vote[];
  votesFavor: number;
  votesContra: number;
  votesAbstencion: number;
  usedTieBreaker: boolean;
  resolution: CommitteeResolution;
  condicionantes?: string;
  commitments: Commitment[];
  status: 'draft' | 'in_progress' | 'closed';
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attendee {
  userId: string;
  name: string;
  roleLabel: string;
  quality: 'Titular' | 'Suplente';
  present: boolean;
}

export interface ConflictDeclaration {
  userId: string;
  userName: string;
  hasConflict: boolean;
  description?: string;
}

export interface PrincipleEvaluation {
  principle: string;
  compliant: boolean | null;
  observations: string;
}

export interface RedFlag {
  id: string;
  productId: string;
  description: string;
  area: string;
  correctiveAction: string;
  status: 'active' | 'closed';
  createdAt: string;
  closedAt?: string;
}

export interface MemberOpinion {
  userId: string;
  userName: string;
  roleLabel: string;
  opinion: string;
  timestamp: string;
}

export interface Vote {
  userId: string;
  userName: string;
  vote: 'favor' | 'contra' | 'abstencion';
  timestamp: string;
}

export interface Commitment {
  id: string;
  task: string;
  responsible: string;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  sessionId: string;
  productId: string;
}

export const PRINCIPLES = [
  'Trato justo al cliente',
  'Definición de público objetivo',
  'Entendimiento del producto/servicio',
  'Precio razonable',
  'Aptitud de canales e infraestructura',
  'Transparencia',
  'Adecuada comunicación con clientes',
  'Seguimiento de productos',
  'Gestión de reclamos',
  'Tratamiento de datos personales',
];

export const RISK_CATEGORIES = [
  'Riesgo Operacional',
  'Riesgo AML/Compliance',
  'Riesgo de Fraude',
  'Riesgo Legal/Normativo',
  'Riesgo de Conducta',
  'Riesgo Ciberseguridad',
  'Riesgo Reputacional',
  'Riesgo Contable',
  'Riesgo Continuidad del Negocio',
  'Riesgo Estratégico',
];

export const COMPANIES = ['Global81 SpA', 'GlobalCard S.A.', 'Sedpe', 'Arpagos', 'Todas'];

export const COMMITTEE_ROLES = [
  {
    roleLabel: 'General Counsel',
    shortLabel: 'General Counsel',
    rolInComite: 'Presidente',
    canVote: true,
    riskCategories: ['Riesgo Legal/Normativo', 'Riesgo de Conducta', 'Riesgo Reputacional', 'Riesgo Estratégico'],
    expertise: 'Gobierno corporativo, marco legal, cumplimiento normativo regional',
  },
  {
    roleLabel: 'Legal Lead',
    shortLabel: 'Legal Lead',
    rolInComite: 'Secretario / Integrante Evaluador',
    canVote: true,
    riskCategories: ['Riesgo Legal/Normativo', 'Riesgo AML/Compliance', 'Riesgo de Conducta'],
    expertise: 'AML, SARLAFT, cumplimiento regulatorio, contratos, T&C',
  },
  {
    roleLabel: 'Oficial de Cumplimiento Colombia',
    shortLabel: 'Compliance Colombia',
    rolInComite: 'Integrante Evaluador',
    canVote: true,
    riskCategories: ['Riesgo AML/Compliance', 'Riesgo Legal/Normativo'],
    expertise: 'AML / SARLAFT / Cumplimiento SFC / Protección de Datos Colombia',
  },
  {
    roleLabel: 'Oficial de Cumplimiento Argentina',
    shortLabel: 'Compliance Argentina',
    rolInComite: 'Integrante Evaluador',
    canVote: true,
    riskCategories: ['Riesgo AML/Compliance', 'Riesgo Legal/Normativo'],
    expertise: 'AML / SARLAFT / Cumplimiento BCRA / Regulación Argentina',
  },
  {
    roleLabel: 'Data Compliance Specialist',
    shortLabel: 'Data Compliance',
    rolInComite: 'Integrante Evaluador',
    canVote: true,
    riskCategories: ['Riesgo de Datos/Privacidad', 'Riesgo Operacional'],
    expertise: 'Señales de alerta, monitoreos, calidad de datos, privacidad',
  },
  {
    roleLabel: 'Head Fraude',
    shortLabel: 'Head Fraude',
    rolInComite: 'Integrante Evaluador',
    canVote: true,
    riskCategories: ['Riesgo de Fraude'],
    expertise: 'Señales de alerta, monitoreos de fraude, topes transaccionales',
  },
  {
    roleLabel: 'Head Ciberseguridad',
    shortLabel: 'Head Ciber',
    rolInComite: 'Integrante Evaluador',
    canVote: true,
    riskCategories: ['Riesgo Ciberseguridad', 'Riesgo Continuidad del Negocio'],
    expertise: 'Infraestructura, activos tecnológicos, monitoreo de seguridad',
  },
  {
    roleLabel: 'Gerente de Riesgos',
    shortLabel: 'Gte. Riesgos',
    rolInComite: 'Integrante Evaluador / Secretario',
    canVote: true,
    riskCategories: ['Riesgo Operacional', 'Riesgo Continuidad del Negocio', 'Riesgo Contable'],
    expertise: 'Riesgos transversales, Matriz de Riesgos, SLA, planes de continuidad',
  },
];

export interface AIRiskAnalysis {
  risks: {
    title: string;
    description: string;
    category: string;
    riskLevel: RiskLevel;
    suggestedControl: string;
    isNew: boolean;
  }[];
  summary: string;
  recommendations: string[];
}

export const riskLevelFromScore = (score: number): RiskLevel => {
  if (score >= 15) return 'muy_alto';
  if (score >= 10) return 'alto';
  if (score >= 5) return 'moderado';
  if (score >= 3) return 'bajo';
  return 'muy_bajo';
};

// Auto-assign a committee member based on risk category
export const assignRiskOwner = (category: string): typeof COMMITTEE_ROLES[0] | null => {
  const match = COMMITTEE_ROLES.find(r =>
    r.riskCategories.some(c => category.toLowerCase().includes(c.toLowerCase().split('/')[0].toLowerCase().trim()))
  );
  return match ?? COMMITTEE_ROLES.find(r => r.roleLabel === 'Gerente de Riesgos') ?? null;
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  muy_alto: 'Muy Alto',
  alto: 'Alto',
  moderado: 'Moderado',
  bajo: 'Bajo',
  muy_bajo: 'Muy Bajo',
};

export const GATE_LABELS: Record<number, string> = {
  1: 'Gate 1 · Levantamiento',
  2: 'Gate 2 · Planificación',
  3: 'Gate 3 · Ejecución y Cierre',
};

export const STATUS_LABELS: Record<GateStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En Progreso',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  blocked: 'Bloqueado',
};
