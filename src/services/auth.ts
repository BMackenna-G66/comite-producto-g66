import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import { AppUser, UserRole, Invite } from '../types';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export const signInWithGoogle = async (): Promise<User> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase no configurado');
  const result = await signInWithPopup(auth, provider);
  return result.user;
};

export const signOut = () => fbSignOut(auth);

export const onAuthChange = (callback: (user: User | null) => void) =>
  onAuthStateChanged(auth, callback);

export const getUserProfile = async (uid: string): Promise<AppUser | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as AppUser) : null;
};

// Se llama en cada cambio de estado de auth. Todo usuario nuevo entra como
// 'pending' — salvo que un admin lo haya invitado antes (precargando su
// email + rol en 'invites'), en cuyo caso queda aprobado automáticamente.
// Las reglas de Firestore validan este mismo criterio del lado del servidor.
// El primer admin se promueve manualmente desde la consola de Firebase (ver README).
export const getOrCreateUserProfile = async (user: User): Promise<AppUser> => {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return snap.data() as AppUser;

  const email = (user.email ?? '').toLowerCase();
  const inviteRef = doc(db, 'invites', email);
  const inviteSnap = await getDoc(inviteRef);
  const invite = inviteSnap.exists() ? (inviteSnap.data() as Invite) : null;

  const newUser: Omit<AppUser, 'createdAt'> & { createdAt: unknown } = {
    uid: user.uid,
    email: user.email ?? '',
    name: user.displayName ?? user.email ?? '',
    photoURL: user.photoURL ?? '',
    role: (invite?.role ?? 'pending') as UserRole,
    company: invite?.company ?? 'Global81 SpA',
    createdAt: serverTimestamp(),
  };
  await setDoc(userRef, newUser);
  if (invite) await deleteDoc(inviteRef);
  return { ...newUser, createdAt: new Date().toISOString() } as AppUser;
};
