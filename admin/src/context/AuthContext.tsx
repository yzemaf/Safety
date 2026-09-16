import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  adminUser: { name: string; email: string; role: string } | null;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'safety_admin_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem(AUTH_STORAGE_KEY);
  });

  const [adminUser, setAdminUser] = useState<{ name: string; email: string; role: string } | null>(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      return { name: 'Dispatch Officer', email: 'admin@safety.org', role: 'Control Room Supervisor' };
    }
    return null;
  });

  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setAdminUser(null);
    }
  }, [isAuthenticated]);

  const login = async (email: string, _pass: string): Promise<boolean> => {
    localStorage.setItem(AUTH_STORAGE_KEY, `token_${Date.now()}`);
    setIsAuthenticated(true);
    setAdminUser({
      name: 'Dispatch Officer',
      email: email || 'admin@safety.org',
      role: 'Control Room Supervisor',
    });
    return true;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
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
