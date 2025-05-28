
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import getKeycloakInstance, { type UserProfile } from '@/lib/keycloak';
import type Keycloak from 'keycloak-js';

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserProfile | null;
  keycloak: Keycloak | null;
  login: (options?: Keycloak.KeycloakLoginOptions) => Promise<void>;
  logout: () => Promise<void>;
  register: (options?: Keycloak.KeycloakRegisterOptions) => Promise<void>;
  getToken: () => Promise<string | undefined>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const initializeKeycloak = useCallback(async () => {
    const kcInstance = getKeycloakInstance();
    if (kcInstance) {
      try {
        // Check if URL contains tokens (after redirect from Keycloak)
        // For Direct Access Grant, this onLoad: 'check-sso' might not be strictly necessary
        // if you're not using Keycloak's login page, but it's good for session checking.
        const authenticated = await kcInstance.init({ 
          onLoad: 'check-sso', 
          silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
          pkceMethod: 'S256' // Recommended for public clients
        });
        
        setIsAuthenticated(authenticated);
        if (authenticated) {
          const profile = await kcInstance.loadUserProfile() as UserProfile;
          setUser(profile);
        }
      } catch (error) {
        console.error("Keycloak init error:", error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setKeycloak(kcInstance);
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    initializeKeycloak();
  }, [initializeKeycloak]);


  useEffect(() => {
    if (keycloak) {
      keycloak.onAuthSuccess = () => {
        setIsAuthenticated(true);
        keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile));
      };
      keycloak.onAuthError = () => {
        setIsAuthenticated(false);
        setUser(null);
      };
      keycloak.onAuthRefreshSuccess = () => {
         // Token refreshed
      };
      keycloak.onAuthRefreshError = () => {
        setIsAuthenticated(false);
        setUser(null);
        keycloak.clearToken(); // Clear tokens if refresh fails
      };
      keycloak.onAuthLogout = () => {
        setIsAuthenticated(false);
        setUser(null);
        router.push('/login'); // Redirect to login on logout
      };
      keycloak.onTokenExpired = () => {
        keycloak.updateToken(30).catch(() => {
          keycloak.logout();
        });
      };
    }
  }, [keycloak, router]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      setIsLoading(true);
      try {
        await keycloak.login(options);
        // For Direct Access Grant, success is handled by onAuthSuccess or manual token handling
      } catch (error) {
        console.error("Keycloak login error:", error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const logout = async () => {
    if (keycloak) {
      setIsLoading(true);
      try {
        await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? window.location.origin + '/login' : undefined });
      } catch (error) {
        console.error("Keycloak logout error:", error);
      } finally {
        // State update will be handled by onAuthLogout
        setIsLoading(false);
      }
    }
  };
  
  // This register function will redirect to Keycloak's registration page
  // if it's enabled. For custom UI registration, you'd call your backend.
  const register = async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) {
      setIsLoading(true);
      try {
        await keycloak.register(options);
      } catch (error) {
        console.error("Keycloak register error:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const getToken = async (): Promise<string | undefined> => {
    if (keycloak && keycloak.token) {
      try {
        await keycloak.updateToken(5); // Update token if it expires in less than 5 seconds
        return keycloak.token;
      } catch (error) {
        console.error("Failed to refresh token or token not available", error);
        // keycloak.logout(); // Optionally logout user if token refresh fails
        return undefined;
      }
    }
    return undefined;
  };


  return (
    <AuthContext.Provider value={{ isAuthenticated, user, keycloak, login, logout, register, getToken, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
