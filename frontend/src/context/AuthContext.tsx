import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import client from '../api/client';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore session from the HttpOnly cookie via /me
  useEffect(() => {
    client.get('/auth/me')
      .then(res => setUser({ ...res.data.user, name: res.data.user.email }))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = (newUser: User) => {
    // Cookies are set by the server — just update local state
    setUser(newUser);
  };

  const logout = () => {
    client.post('/auth/logout').catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
