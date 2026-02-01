import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8888';

// User interface
export interface User {
  user_id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  provider: string;
}

// Auth context interface
interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (provider: 'github' | 'google') => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current user
  const refreshUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include', // Important for cookies
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Login - redirect to OAuth provider
  const login = useCallback((provider: 'github' | 'google') => {
    const currentUrl = window.location.href;
    const loginUrl = `${API_BASE_URL}/api/auth/${provider}/login?redirect_url=${encodeURIComponent(currentUrl)}`;
    window.location.href = loginUrl;
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }, []);

  // Check for login errors in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const loginError = urlParams.get('error');
    if (loginError) {
      setError(loginError === 'github_auth_failed'
        ? 'GitHub 登录失败，请重试'
        : loginError === 'google_auth_failed'
        ? 'Google 登录失败，请重试'
        : '登录失败，请重试');
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch user on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const value: AuthContextType = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
