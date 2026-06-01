import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthChange, signOut as localSignOut, refreshSession } from '../services/auth';
import { AppUser } from '../types';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  refreshUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const useAuthProvider = (): AuthContextType => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = () => {
    if (user?.uid) {
      const fresh = refreshSession(user.uid);
      setUser(fresh);
    }
  };

  useEffect(() => {
    const unsub = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signOut = async () => {
    await localSignOut();
    setUser(null);
  };

  return { user, loading, signOut, refreshUser };
};
