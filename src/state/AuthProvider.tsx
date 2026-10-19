import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { auth, isFirebaseConfigured } from '@/config/firebase';
import { clearFamilyPrivateKeyCache } from '@/services/family-encryption';

type AuthStatus = 'loading' | 'unconfigured' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const previousUid = useRef<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>(isFirebaseConfigured ? 'loading' : 'unconfigured');

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') clearFamilyPrivateKeyCache();
    });
    const firebaseAuth = auth;
    if (!firebaseAuth) return () => appState.remove();
    const authState = onAuthStateChanged(firebaseAuth, (nextUser) => {
      if (previousUid.current && previousUid.current !== nextUser?.uid) {
        clearFamilyPrivateKeyCache(previousUid.current);
      }
      if (nextUser && !nextUser.emailVerified) {
        previousUid.current = null;
        void firebaseSignOut(firebaseAuth);
        setUser(null);
        setStatus('signed-out');
        return;
      }
      previousUid.current = nextUser?.uid ?? null;
      setUser(nextUser);
      setStatus(nextUser ? 'signed-in' : 'signed-out');
    }, (error) => {
      console.error('Firebase sign-in state could not be loaded:', error);
      setStatus('signed-out');
    });
    return () => {
      appState.remove();
      authState();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    signOut: async () => {
      if (!auth) throw new Error('Firebase Authentication is not configured.');
      clearFamilyPrivateKeyCache(user?.uid);
      await auth.signOut();
    },
  }), [status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth requires AuthProvider');
  return context;
}
