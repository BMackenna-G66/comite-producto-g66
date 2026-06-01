import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import { AppUser } from '../types';

const provider = new GoogleAuthProvider();

export const signInWithGoogle = async (): Promise<AppUser | null> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase no configurado');
  const result = await signInWithPopup(auth, provider);
  const { user } = result;

  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    // Check if this is the very first user → auto admin
    const { getDocs, collection } = await import('firebase/firestore');
    const allUsers = await getDocs(collection(db, 'users'));
    const isFirstUser = allUsers.empty;

    const newUser: Omit<AppUser, 'createdAt'> & { createdAt: unknown } = {
      uid: user.uid,
      email: user.email ?? '',
      name: user.displayName ?? user.email ?? '',
      photoURL: user.photoURL ?? '',
      role: isFirstUser ? 'admin' : 'pending',
      company: 'Global81 SpA',
      createdAt: serverTimestamp(),
    };
    await setDoc(userRef, newUser);
    return { ...newUser, createdAt: new Date().toISOString() } as AppUser;
  }

  return snap.data() as AppUser;
};

export const signOut = () => fbSignOut(auth);

export const onAuthChange = (callback: (user: User | null) => void) =>
  onAuthStateChanged(auth, callback);

export const getUserProfile = async (uid: string): Promise<AppUser | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as AppUser) : null;
};
