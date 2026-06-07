// localStorage-based persistence — drop-in replacement for Firestore
import { Product, Risk, CommitteeSession, RedFlag, Commitment, AppUser, UserRole, riskLevelFromScore } from '../types';

// ─── generic helpers ─────────────────────────────────────────────────────────
const read = <T>(key: string): T[] => JSON.parse(localStorage.getItem(key) ?? '[]');
const write = <T>(key: string, data: T[]) => localStorage.setItem(key, JSON.stringify(data));
const now = () => new Date().toISOString();

const insert = <T extends { id: string }>(key: string, item: Omit<T, 'id'>): string => {
  const id = crypto.randomUUID();
  const items = read<T>(key);
  write<T>(key, [...items, { ...item, id } as T]);
  return id;
};

const patch = <T extends { id: string }>(key: string, id: string, data: Partial<T>) => {
  const items = read<T>(key);
  write<T>(key, items.map(i => i.id === id ? { ...i, ...data } : i));
};

const remove = <T extends { id: string }>(key: string, id: string) => {
  write<T>(key, read<T>(key).filter(i => i.id !== id));
};

// ─── USERS ───────────────────────────────────────────────────────────────────
const USERS_KEY = 'cp_users';

export const getUsers = async (): Promise<AppUser[]> =>
  read<AppUser>(USERS_KEY).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const updateUserRole = async (uid: string, role: UserRole, company: string) => {
  const users = read<AppUser>(USERS_KEY);
  write<AppUser>(USERS_KEY, users.map(u => u.uid === uid ? { ...u, role, company } : u));
  // update session if it's the current user
  const session = localStorage.getItem('cp_session');
  if (session) {
    const s = JSON.parse(session) as AppUser;
    if (s.uid === uid) localStorage.setItem('cp_session', JSON.stringify({ ...s, role, company }));
  }
};

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
export const getProducts = async (): Promise<Product[]> =>
  read<Product>('cp_products').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const getProduct = async (id: string): Promise<Product | null> =>
  read<Product>('cp_products').find(p => p.id === id) ?? null;

export const createProduct = async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> =>
  insert<Product>('cp_products', { ...data, createdAt: now(), updatedAt: now() });

export const updateProduct = async (id: string, data: Partial<Product>) =>
  patch<Product>('cp_products', id, { ...data, updatedAt: now() });

export const deleteProduct = async (id: string) => remove<Product>('cp_products', id);

// ─── RISKS ───────────────────────────────────────────────────────────────────
export const getRisks = async (productId: string): Promise<Risk[]> =>
  read<Risk>('cp_risks').filter(r => r.productId === productId);

export const getAllRisks = async (): Promise<Risk[]> => read<Risk>('cp_risks');

export const createRisk = async (data: Omit<Risk, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const score = data.impact * data.probability;
  return insert<Risk>('cp_risks', {
    ...data,
    inherentRisk: score,
    riskLevel: riskLevelFromScore(score),
    createdAt: now(),
    updatedAt: now(),
  });
};

export const updateRisk = async (id: string, data: Partial<Risk>) => {
  const risks = read<Risk>('cp_risks');
  const current = risks.find(r => r.id === id);
  if (!current) return;
  const impact = data.impact ?? current.impact;
  const probability = data.probability ?? current.probability;
  const score = impact * probability;
  patch<Risk>('cp_risks', id, {
    ...data,
    inherentRisk: score,
    riskLevel: riskLevelFromScore(score),
    updatedAt: now(),
  });
};

export const deleteRisk = async (id: string) => remove<Risk>('cp_risks', id);

// ─── RED FLAGS ───────────────────────────────────────────────────────────────
export const getRedFlags = async (productId: string): Promise<RedFlag[]> =>
  read<RedFlag>('cp_redflags').filter(r => r.productId === productId);

export const createRedFlag = async (data: Omit<RedFlag, 'id' | 'createdAt'>): Promise<string> =>
  insert<RedFlag>('cp_redflags', { ...data, createdAt: now() });

export const resolveRedFlag = async (id: string) =>
  patch<RedFlag>('cp_redflags', id, { status: 'closed', closedAt: now() });

// ─── SESSIONS ────────────────────────────────────────────────────────────────
export const getCommitteeSessions = async (productId: string): Promise<CommitteeSession[]> =>
  read<CommitteeSession>('cp_sessions')
    .filter(s => s.productId === productId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const getAllSessions = async (): Promise<CommitteeSession[]> =>
  read<CommitteeSession>('cp_sessions').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const createCommitteeSession = async (data: Omit<CommitteeSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> =>
  insert<CommitteeSession>('cp_sessions', { ...data, createdAt: now(), updatedAt: now() });

export const updateCommitteeSession = async (id: string, data: Partial<CommitteeSession>) =>
  patch<CommitteeSession>('cp_sessions', id, { ...data, updatedAt: now() });

// ─── COMMITMENTS ─────────────────────────────────────────────────────────────
export const getCommitments = async (productId: string): Promise<Commitment[]> =>
  read<Commitment>('cp_commitments').filter(c => c.productId === productId);

export const createCommitment = async (data: Omit<Commitment, 'id'>): Promise<string> =>
  insert<Commitment>('cp_commitments', data);

export const updateCommitmentStatus = async (id: string, status: Commitment['status']) =>
  patch<Commitment>('cp_commitments', id, { status });

// ═══════════════════════════════════════════════════════════════════════════
// GRC / ERM CRUD — Capas 1-8
// ═══════════════════════════════════════════════════════════════════════════
import type { CorporateRisk, KRI, RiskAppetite, RiskEvent, OperationalLoss, ControlTest, RegulatoryUpdate, AuditLog, KRIStatus } from '../types';

// CAPA 1 — Corporate Risks
export const getCorporateRisks = async (): Promise<CorporateRisk[]> =>
  read<CorporateRisk>('cp_corp_risks').sort((a, b) => b.inherentRisk - a.inherentRisk);
export const createCorporateRisk = async (data: Omit<CorporateRisk, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> =>
  insert<CorporateRisk>('cp_corp_risks', { ...data, createdAt: now(), updatedAt: now() });
export const updateCorporateRisk = async (id: string, data: Partial<CorporateRisk>) =>
  patch<CorporateRisk>('cp_corp_risks', id, { ...data, updatedAt: now() });
export const deleteCorporateRisk = async (id: string) => remove<CorporateRisk>('cp_corp_risks', id);

// CAPA 2 — KRIs
export const getKRIs = async (): Promise<KRI[]> => read<KRI>('cp_kris');
export const createKRI = async (data: Omit<KRI, 'id'>): Promise<string> => insert<KRI>('cp_kris', data);
export const updateKRI = async (id: string, data: Partial<KRI>) => patch<KRI>('cp_kris', id, { ...data, lastUpdated: now() });
export const deleteKRI = async (id: string) => remove<KRI>('cp_kris', id);

// CAPA 3 — Risk Appetite
export const getRiskAppetites = async (): Promise<RiskAppetite[]> => read<RiskAppetite>('cp_appetite');
export const createRiskAppetite = async (data: Omit<RiskAppetite, 'id'>): Promise<string> => insert<RiskAppetite>('cp_appetite', data);
export const updateRiskAppetite = async (id: string, data: Partial<RiskAppetite>) => patch<RiskAppetite>('cp_appetite', id, data);

// CAPA 4 — Risk Events
export const getRiskEvents = async (): Promise<RiskEvent[]> =>
  read<RiskEvent>('cp_events').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const createRiskEvent = async (data: Omit<RiskEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> =>
  insert<RiskEvent>('cp_events', { ...data, createdAt: now(), updatedAt: now() });
export const updateRiskEvent = async (id: string, data: Partial<RiskEvent>) =>
  patch<RiskEvent>('cp_events', id, { ...data, updatedAt: now() });

// CAPA 5 — Operational Losses
export const getOperationalLosses = async (eventId?: string): Promise<OperationalLoss[]> => {
  const all = read<OperationalLoss>('cp_losses');
  return eventId ? all.filter(l => l.riskEventId === eventId) : all;
};
export const createOperationalLoss = async (data: Omit<OperationalLoss, 'id'>): Promise<string> =>
  insert<OperationalLoss>('cp_losses', data);

// CAPA 6 — Control Testing
export const getControlTests = async (): Promise<ControlTest[]> =>
  read<ControlTest>('cp_controls').sort((a, b) => b.testDate.localeCompare(a.testDate));
export const createControlTest = async (data: Omit<ControlTest, 'id'>): Promise<string> =>
  insert<ControlTest>('cp_controls', data);
export const updateControlTest = async (id: string, data: Partial<ControlTest>) =>
  patch<ControlTest>('cp_controls', id, data);

// CAPA 7 — Regulatory Updates
export const getRegulatoryUpdates = async (): Promise<RegulatoryUpdate[]> =>
  read<RegulatoryUpdate>('cp_regulatory').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const createRegulatoryUpdate = async (data: Omit<RegulatoryUpdate, 'id' | 'createdAt'>): Promise<string> =>
  insert<RegulatoryUpdate>('cp_regulatory', { ...data, createdAt: now() });
export const updateRegulatoryUpdate = async (id: string, data: Partial<RegulatoryUpdate>) =>
  patch<RegulatoryUpdate>('cp_regulatory', id, data);

// CAPA 8 — Audit Log
export const addAuditLog = (entry: Omit<AuditLog, 'id'>) => insert<AuditLog>('cp_audit', entry);
export const getAuditLogs = async (limit = 100): Promise<AuditLog[]> =>
  read<AuditLog>('cp_audit').sort((a, b) => b.performedAt.localeCompare(a.performedAt)).slice(0, limit);

// Re-export types so pages can import from here
export type { KRIStatus };
