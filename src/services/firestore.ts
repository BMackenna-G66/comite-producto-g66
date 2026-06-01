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
