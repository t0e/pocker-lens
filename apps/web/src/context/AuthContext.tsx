'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserResponse, LoginInput, RegisterInput } from '@pocketlens/shared';
import { apiClient, ApiError } from '@/lib/api-client';

interface AuthContextType {
  user: UserResponse | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiClient<{ user: UserResponse }>('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (input: LoginInput) => {
    const data = await apiClient<{ user: UserResponse }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setUser(data.user);
  };

  const register = async (input: RegisterInput) => {
    const data = await apiClient<{ user: UserResponse }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await apiClient('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors during logout
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
