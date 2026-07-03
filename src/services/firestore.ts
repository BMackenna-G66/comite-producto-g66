// Firestore-based persistence — estado compartido entre todos los miembros del comité
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where,
} from 'firebase/firestore';
import { db } from './firebase';
import { Product, Risk, CommitteeSession, RedFlag, Commitment, AppUser, UserRole, riskLevelFromScore } from '../types';

const now = () => new Date().toISOString();

// ─── generic helpers ─────────────────────────────────────────────────────────
// Sin `orderBy` en las queries a propósito: evita depender de índices compuestos
// de Firestore. El orden se resuelve en el cliente, igual que antes.
const listAll = async <T>(col: string): Promise<(T & { id: string })[]> => {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map(d => ({ ...(d.data() as T), id: d.id }));
};

const listWhere = async <T>(col: string, field: string, value: string): Promise<(T & { id: string })[]> => {
  const snap = await getDocs(query(collection(db, col), where(field, '==', value)));
  return snap.docs.map(d => ({ ...(d.data() as T), id: d.id }));
};

const getOne = async <T>(col: string, id: string): Promise<(T & { id: string }) | null> => {
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? ({ ...(snap.data() as T), id: snap.id }) : null;
};

const insert = async (col: string, data: object): Promise<string> => {
  const ref = await addDoc(collection(db, col), data as Record<string, unknown>);
  return ref.id;
};

const patch = async (col: string, id: string, data: object): Promise<void> => {
  await updateDoc(doc(db, col, id), data as any);
};

const remove = async (col: string, id: string): Promise<void> => {
  await deleteDoc(doc(db, col, id));
};

// ─── USERS ───────────────────────────────────────────────────────────────────
export const getUsers = async (): Promise<AppUser[]> =>
  (await listAll<AppUser>('users')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const updateUserRole = async (uid: string, role: UserRole, company: string) =>
  patch('users', uid, { role, company });

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
export const getProducts = async (): Promise<Product[]> =>
  (await listAll<Product>('products')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const getProduct = async (id: string): Promise<Product | null> => getOne<Product>('products', id);

export const createProduct = async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> =>
  insert('products', { ...data, createdAt: now(), updatedAt: now() });

export const updateProduct = async (id: string, data: Partial<Product>) =>
  patch('products', id, { ...data, updatedAt: now() });

export const deleteProduct = async (id: string) => remove('products', id);

// ─── RISKS ───────────────────────────────────────────────────────────────────
export const getRisks = async (productId: string): Promise<Risk[]> =>
  listWhere<Risk>('risks', 'productId', productId);

export const getAllRisks = async (): Promise<Risk[]> => listAll<Risk>('risks');

export const createRisk = async (data: Omit<Risk, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const score = data.impact * data.probability;
  return insert('risks', {
    ...data,
    inherentRisk: score,
    riskLevel: riskLevelFromScore(score),
    createdAt: now(),
    updatedAt: now(),
  });
};

export const updateRisk = async (id: string, data: Partial<Risk>) => {
  const current = await getOne<Risk>('risks', id);
  if (!current) return;
  const impact = data.impact ?? current.impact;
  const probability = data.probability ?? current.probability;
  const score = impact * probability;
  await patch('risks', id, {
    ...data,
    inherentRisk: score,
    riskLevel: riskLevelFromScore(score),
    updatedAt: now(),
  });
};

export const deleteRisk = async (id: string) => remove('risks', id);

// ─── RED FLAGS ───────────────────────────────────────────────────────────────
export const getRedFlags = async (productId: string): Promise<RedFlag[]> =>
  listWhere<RedFlag>('redflags', 'productId', productId);

export const createRedFlag = async (data: Omit<RedFlag, 'id' | 'createdAt'>): Promise<string> =>
  insert('redflags', { ...data, createdAt: now() });

export const resolveRedFlag = async (id: string) =>
  patch('redflags', id, { status: 'closed', closedAt: now() });

// ─── SESSIONS ────────────────────────────────────────────────────────────────
export const getCommitteeSessions = async (productId: string): Promise<CommitteeSession[]> =>
  (await listWhere<CommitteeSession>('sessions', 'productId', productId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const getAllSessions = async (): Promise<CommitteeSession[]> =>
  (await listAll<CommitteeSession>('sessions')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const createCommitteeSession = async (data: Omit<CommitteeSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> =>
  insert('sessions', { ...data, createdAt: now(), updatedAt: now() });

export const updateCommitteeSession = async (id: string, data: Partial<CommitteeSession>) =>
  patch('sessions', id, { ...data, updatedAt: now() });

// ─── COMMITMENTS ─────────────────────────────────────────────────────────────
export const getCommitments = async (productId: string): Promise<Commitment[]> =>
  listWhere<Commitment>('commitments', 'productId', productId);

export const createCommitment = async (data: Omit<Commitment, 'id'>): Promise<string> =>
  insert('commitments', data);

export const updateCommitmentStatus = async (id: string, status: Commitment['status']) =>
  patch('commitments', id, { status });

// ═══════════════════════════════════════════════════════════════════════════
// GRC / ERM CRUD — Capas 1-8
// ═══════════════════════════════════════════════════════════════════════════
import type { CorporateRisk, KRI, RiskAppetite, RiskEvent, OperationalLoss, ControlTest, RegulatoryUpdate, AuditLog, KRIStatus } from '../types';

// CAPA 1 — Corporate Risks
export const getCorporateRisks = async (): Promise<CorporateRisk[]> =>
  (await listAll<CorporateRisk>('corporateRisks')).sort((a, b) => b.inherentRisk - a.inherentRisk);
export const createCorporateRisk = async (data: Omit<CorporateRisk, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> =>
  insert('corporateRisks', { ...data, createdAt: now(), updatedAt: now() });
export const updateCorporateRisk = async (id: string, data: Partial<CorporateRisk>) =>
  patch('corporateRisks', id, { ...data, updatedAt: now() });
export const deleteCorporateRisk = async (id: string) => remove('corporateRisks', id);

// CAPA 2 — KRIs
export const getKRIs = async (): Promise<KRI[]> => listAll<KRI>('kris');
export const createKRI = async (data: Omit<KRI, 'id'>): Promise<string> => insert('kris', data);
export const updateKRI = async (id: string, data: Partial<KRI>) => patch('kris', id, { ...data, lastUpdated: now() });
export const deleteKRI = async (id: string) => remove('kris', id);

// CAPA 3 — Risk Appetite
export const getRiskAppetites = async (): Promise<RiskAppetite[]> => listAll<RiskAppetite>('riskAppetite');
export const createRiskAppetite = async (data: Omit<RiskAppetite, 'id'>): Promise<string> => insert('riskAppetite', data);
export const updateRiskAppetite = async (id: string, data: Partial<RiskAppetite>) => patch('riskAppetite', id, data);

// CAPA 4 — Risk Events
export const getRiskEvents = async (): Promise<RiskEvent[]> =>
  (await listAll<RiskEvent>('riskEvents')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const createRiskEvent = async (data: Omit<RiskEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> =>
  insert('riskEvents', { ...data, createdAt: now(), updatedAt: now() });
export const updateRiskEvent = async (id: string, data: Partial<RiskEvent>) =>
  patch('riskEvents', id, { ...data, updatedAt: now() });

// CAPA 5 — Operational Losses
export const getOperationalLosses = async (eventId?: string): Promise<OperationalLoss[]> =>
  eventId ? listWhere<OperationalLoss>('operationalLosses', 'riskEventId', eventId) : listAll<OperationalLoss>('operationalLosses');
export const createOperationalLoss = async (data: Omit<OperationalLoss, 'id'>): Promise<string> =>
  insert('operationalLosses', data);

// CAPA 6 — Control Testing
export const getControlTests = async (): Promise<ControlTest[]> =>
  (await listAll<ControlTest>('controlTests')).sort((a, b) => b.testDate.localeCompare(a.testDate));
export const createControlTest = async (data: Omit<ControlTest, 'id'>): Promise<string> =>
  insert('controlTests', data);
export const updateControlTest = async (id: string, data: Partial<ControlTest>) =>
  patch('controlTests', id, data);

// CAPA 7 — Regulatory Updates
export const getRegulatoryUpdates = async (): Promise<RegulatoryUpdate[]> =>
  (await listAll<RegulatoryUpdate>('regulatoryUpdates')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const createRegulatoryUpdate = async (data: Omit<RegulatoryUpdate, 'id' | 'createdAt'>): Promise<string> =>
  insert('regulatoryUpdates', { ...data, createdAt: now() });
export const updateRegulatoryUpdate = async (id: string, data: Partial<RegulatoryUpdate>) =>
  patch('regulatoryUpdates', id, data);

// CAPA 8 — Audit Log
export const addAuditLog = async (entry: Omit<AuditLog, 'id'>): Promise<string> => insert('auditLogs', entry);
export const getAuditLogs = async (limit = 100): Promise<AuditLog[]> =>
  (await listAll<AuditLog>('auditLogs')).sort((a, b) => b.performedAt.localeCompare(a.performedAt)).slice(0, limit);

// Re-export types so pages can import from here
export type { KRIStatus };
