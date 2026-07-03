import { useState, useEffect, createContext, useContext } from 'react';
import { getRedirectResult } from 'firebase/auth';
import { auth } from '../services/firebase';
import { onAuthChange, getUserProfile, getOrCreateUserProfile, signOut as fbSignOut } from '../services/auth';
import { AppUser } from '../types';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const useAuthProvider = (): AuthContextType => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    if (user?.uid) {
      const profile = await getUserProfile(user.uid);
      setUser(profile);
    }
  };

  useEffect(() => {
    // Captura errores del regreso del redirect (p.ej. cuenta ya vinculada a
    // otro proveedor). El resultado exitoso lo entrega onAuthStateChanged.
    getRedirectResult(auth).catch((err) => {
      console.error('Error al completar el inicio de sesión con Google:', err);
    });

    const unsub = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        const profile = await getOrCreateUserProfile(firebaseUser);
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signOut = async () => {
    await fbSignOut();
    setUser(null);
  };

  return { user, loading, signOut, refreshUser };
};
