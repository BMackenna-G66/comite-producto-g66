import { AppUser } from '../types';

const USERS_KEY = 'cp_users';
const SESSION_KEY = 'cp_session';

const getUsers = (): AppUser[] => JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]');
const saveUsers = (users: AppUser[]) => localStorage.setItem(USERS_KEY, JSON.stringify(users));

export const signInWithGoogle = async (): Promise<AppUser> => {
  // Simulate Google OAuth — ask for email/name since we have no real OAuth
  const email = prompt('Ingresa tu correo Gmail:')?.trim();
  if (!email) throw new Error('Correo requerido');
  const name = prompt('Tu nombre completo:')?.trim() || email.split('@')[0];

  const users = getUsers();
  let user = users.find(u => u.email === email);

  if (!user) {
    const isFirst = users.length === 0;
    user = {
      uid: crypto.randomUUID(),
      email,
      name,
      photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0ea5e9&color=fff`,
      role: isFirst ? 'admin' : 'pending',
      company: 'Global81 SpA',
      createdAt: new Date().toISOString(),
    };
    saveUsers([...users, user]);
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
};

export const signOut = async () => {
  localStorage.removeItem(SESSION_KEY);
};

export const getSession = (): AppUser | null => {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const refreshSession = (uid: string): AppUser | null => {
  const users = getUsers();
  const user = users.find(u => u.uid === uid) ?? null;
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
};

export const getUserProfile = async (uid: string): Promise<AppUser | null> => {
  const users = getUsers();
  return users.find(u => u.uid === uid) ?? null;
};

export const onAuthChange = (cb: (user: AppUser | null) => void): (() => void) => {
  // fire once immediately
  const session = getSession();
  if (session) {
    // re-read from storage in case role was updated
    const fresh = refreshSession(session.uid);
    cb(fresh);
  } else {
    cb(null);
  }
  // listen for storage events (other tabs)
  const handler = () => cb(getSession());
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
};
