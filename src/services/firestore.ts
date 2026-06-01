import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Product, Risk, CommitteeSession, RedFlag, Commitment, AppUser, UserRole, riskLevelFromScore } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────
const toDate = (v: unknown): string => {
  if (!v) return new Date().toISOString();
  if (v instanceof Timestamp) return v.toDate().toISOString();
  return String(v);
};

// ─── USERS ──────────────────────────────────────────────────────────────────
export const getUsers = async (): Promise<AppUser[]> => {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ ...d.data(), uid: d.id, createdAt: toDate((d.data() as AppUser).createdAt) } as AppUser));
};

export const updateUserRole = async (uid: string, role: UserRole, company: string) => {
  await updateDoc(doc(db, 'users', uid), { role, company });
};

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
export const getProducts = async (): Promise<Product[]> => {
  const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ ...d.data(), id: d.id, createdAt: toDate((d.data() as Product).createdAt), updatedAt: toDate((d.data() as Product).updatedAt) } as Product));
};

export const getProduct = async (id: string): Promise<Product | null> => {
  const snap = await getDoc(doc(db, 'products', id));
  if (!snap.exists()) return null;
  const data = snap.data() as Product;
  return { ...data, id: snap.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
};

export const createProduct = async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const ref = await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
};

export const updateProduct = async (id: string, data: Partial<Product>) => {
  await updateDoc(doc(db, 'products', id), { ...data, updatedAt: serverTimestamp() });
};

export const deleteProduct = async (id: string) => {
  await deleteDoc(doc(db, 'products', id));
};

// ─── RISKS ───────────────────────────────────────────────────────────────────
export const getRisks = async (productId: string): Promise<Risk[]> => {
  const snap = await getDocs(query(collection(db, 'risks'), where('productId', '==', productId)));
  return snap.docs.map(d => {
    const data = d.data() as Risk;
    return { ...data, id: d.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
  });
};

export const getAllRisks = async (): Promise<Risk[]> => {
  const snap = await getDocs(collection(db, 'risks'));
  return snap.docs.map(d => {
    const data = d.data() as Risk;
    return { ...data, id: d.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
  });
};

export const createRisk = async (data: Omit<Risk, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const score = data.impact * data.probability;
  const ref = await addDoc(collection(db, 'risks'), {
    ...data,
    inherentRisk: score,
    riskLevel: riskLevelFromScore(score),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateRisk = async (id: string, data: Partial<Risk>) => {
  const updates: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
  if (data.impact !== undefined || data.probability !== undefined) {
    const snap = await getDoc(doc(db, 'risks', id));
    const current = snap.data() as Risk;
    const impact = data.impact ?? current.impact;
    const probability = data.probability ?? current.probability;
    const score = impact * probability;
    updates.inherentRisk = score;
    updates.riskLevel = riskLevelFromScore(score);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await updateDoc(doc(db, 'risks', id), updates as any);
};

export const deleteRisk = async (id: string) => {
  await deleteDoc(doc(db, 'risks', id));
};

// ─── RED FLAGS ───────────────────────────────────────────────────────────────
export const getRedFlags = async (productId: string): Promise<RedFlag[]> => {
  const snap = await getDocs(query(collection(db, 'redflags'), where('productId', '==', productId)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as RedFlag));
};

export const createRedFlag = async (data: Omit<RedFlag, 'id' | 'createdAt'>): Promise<string> => {
  const ref = await addDoc(collection(db, 'redflags'), { ...data, createdAt: new Date().toISOString() });
  return ref.id;
};

export const resolveRedFlag = async (id: string) => {
  await updateDoc(doc(db, 'redflags', id), { status: 'closed', closedAt: new Date().toISOString() });
};

// ─── COMMITTEE SESSIONS ──────────────────────────────────────────────────────
export const getCommitteeSessions = async (productId: string): Promise<CommitteeSession[]> => {
  const snap = await getDocs(query(collection(db, 'sessions'), where('productId', '==', productId), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => {
    const data = d.data() as CommitteeSession;
    return { ...data, id: d.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
  });
};

export const getAllSessions = async (): Promise<CommitteeSession[]> => {
  const snap = await getDocs(query(collection(db, 'sessions'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => {
    const data = d.data() as CommitteeSession;
    return { ...data, id: d.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
  });
};

export const createCommitteeSession = async (data: Omit<CommitteeSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const ref = await addDoc(collection(db, 'sessions'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
};

export const updateCommitteeSession = async (id: string, data: Partial<CommitteeSession>) => {
  await updateDoc(doc(db, 'sessions', id), { ...data, updatedAt: serverTimestamp() });
};

// ─── COMMITMENTS ─────────────────────────────────────────────────────────────
export const getCommitments = async (productId: string): Promise<Commitment[]> => {
  const snap = await getDocs(query(collection(db, 'commitments'), where('productId', '==', productId)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as Commitment));
};

export const updateCommitmentStatus = async (id: string, status: Commitment['status']) => {
  await updateDoc(doc(db, 'commitments', id), { status });
};

export const createCommitment = async (data: Omit<Commitment, 'id'>): Promise<string> => {
  const ref = await addDoc(collection(db, 'commitments'), data);
  return ref.id;
};
