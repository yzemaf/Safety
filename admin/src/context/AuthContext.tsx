import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface AuthContextType {
  isAuthenticated: boolean;
  adminUser: { id?: string; name: string; email: string; role: string } | null;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'safety_admin_token';
const USER_STORAGE_KEY = 'safety_admin_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem(AUTH_STORAGE_KEY);
  });

  const [adminUser, setAdminUser] = useState<{ id?: string; name: string; email: string; role: string } | null>(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return null;
  });

  useEffect(() => {
    const verifySession = async () => {
      const token = localStorage.getItem(AUTH_STORAGE_KEY);
      if (token) {
        const me = await apiService.getMe();
        if (me && me.user) {
          setIsAuthenticated(true);
          setAdminUser({
            id: me.user._id || me.user.id,
            name: me.user.name || 'Staff Officer',
            email: me.user.email,
            role: me.user.role || 'dispatch_officer',
          });
        } else {
          // Token is invalid/expired on backend
          logout();
        }
      } else {
        setIsAuthenticated(false);
        setAdminUser(null);
      }
    };

    verifySession();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      apiService.logout();
      setAdminUser(null);
    }
  }, [isAuthenticated]);

  const login = async (email: string, pass: string): Promise<boolean> => {
    const result = await apiService.login(email, pass);
    if (result.success && result.user) {
      setIsAuthenticated(true);
      setAdminUser({
        id: result.user.id,
        name: result.user.name || 'Staff Officer',
        email: result.user.email || email,
        role: result.user.role || 'dispatch_officer',
      });
      return true;
    }

    return false;
  };

  const logout = () => {
    apiService.logout();
    setIsAuthenticated(false);
    setAdminUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, adminUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
