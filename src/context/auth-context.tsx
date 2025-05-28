
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  const [isKeycloakInitialized, setIsKeycloakInitialized] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const kc = getKeycloakInstance();
    console.log('AuthProvider: Setting Keycloak instance:', kc);
    setKeycloak(kc);
  }, []);

  const initializeKeycloak = useCallback(async () => {
    if (isKeycloakInitialized || !keycloak) {
      if (!keycloak) console.log('AuthProvider initializeKeycloak: Keycloak instance not yet available. Still loading.');
      if (isKeycloakInitialized) console.log('AuthProvider initializeKeycloak: Keycloak already initialized. No action needed.');
      
      // Ensure loading reflects the state: if keycloak isn't set OR it's set but not initialized, we are loading.
      // If keycloak is set AND initialized, we are not loading.
      if (!keycloak || (keycloak && !isKeycloakInitialized)) {
        setIsLoading(true);
      } else {
        setIsLoading(false);
      }
      return;
    }

    console.log('AuthProvider initializeKeycloak: Starting initialization process for path:', pathname);
    setIsLoading(true);

    try {
      let initOptions: Keycloak.KeycloakInitOptions = {
        pkceMethod: 'S256',
      };

      const storedAccessToken = localStorage.getItem('kc_access_token');
      const storedRefreshToken = localStorage.getItem('kc_refresh_token');
      const storedIdToken = localStorage.getItem('kc_id_token');

      if (storedAccessToken && storedRefreshToken && storedIdToken) {
        console.log('AuthProvider: Found stored tokens from Direct Access Grant. Initializing Keycloak with these tokens.');
        initOptions = {
          ...initOptions,
          token: storedAccessToken,
          refreshToken: storedRefreshToken,
          idToken: storedIdToken,
        };
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
      } else {
        console.log('AuthProvider: No stored DAG tokens found. Using default init options (check-sso).');
        initOptions = {
          ...initOptions,
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
        };
      }
      
      console.log('AuthProvider: Calling keycloak.init() with options:', initOptions);
      const authenticated = await keycloak.init(initOptions);
      console.log('AuthProvider: Keycloak init success. Authenticated:', authenticated);
      setIsKeycloakInitialized(true);
      setIsAuthenticated(authenticated);

      if (authenticated) {
        const profile = await keycloak.loadUserProfile() as UserProfile;
        setUser(profile);
        console.log('AuthProvider: User profile loaded:', profile);
      } else {
        console.log('AuthProvider: Keycloak init determined user is not authenticated.');
        setUser(null);
      }
    } catch (error: any) {
      console.error("Keycloak init() caught an error. Raw error object:", error);
      let errorMessage = "Keycloak initialization failed.";
      let errorDetailsString = "Could not serialize error object.";

      if (error && typeof error === 'object') {
          try { errorDetailsString = JSON.stringify(error, Object.getOwnPropertyNames(error)); }
          catch (e) { try { errorDetailsString = JSON.stringify(error); } catch (e2) { /* ignore */ } }
          console.error("Keycloak init error (raw object serialized to JSON):", errorDetailsString);

          if (error.message) { errorMessage += ` Details: ${error.message}`; }
          else if (error.error_description) { errorMessage += ` Details: ${error.error_description}`; }
          else if (error.error) { errorMessage += ` Error type: ${error.error}`; }
          else { errorMessage += " No standard 'message', 'error_description', or 'error' property found. This might be due to network issues (Keycloak server unreachable), CORS problems, or SSL certificate errors. Check browser Network tab.";}
      } else if (typeof error === 'string' && error) {
          errorMessage += ` Details: ${error}`;
      } else {
          errorMessage += " The error was not a standard object or string. Check network, CORS, SSL.";
      }
      
      console.error("Keycloak init error details (summary):", errorMessage);
      setIsKeycloakInitialized(true); // Mark as initialized even on error to prevent retry loops
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      // Use local variable for isKeycloakInitialized for this log as state update might be pending
      console.log('AuthProvider: Keycloak initialization process finished. isLoading:', false, 'isAuthenticated (from state):', isAuthenticated, 'keycloak.authenticated:', keycloak?.authenticated, 'isKeycloakInitialized (flag): true');
    }
  }, [keycloak, router, pathname, isKeycloakInitialized]);

  useEffect(() => {
    if (keycloak && !isKeycloakInitialized) {
        console.log("AuthProvider: Keycloak instance available and not yet initialized. Triggering initializeKeycloak due to pathname or keycloak instance change.");
        initializeKeycloak();
    } else if (!keycloak && !isKeycloakInitialized) {
        console.log("AuthProvider: Waiting for keycloak instance to be set before initializing. Setting isLoading to true.");
        setIsLoading(true);
    } else if (keycloak && isKeycloakInitialized) {
        console.log("AuthProvider: Keycloak instance available and already initialized. Setting isLoading to false.");
        setIsLoading(false);
    }
  }, [pathname, keycloak, initializeKeycloak, isKeycloakInitialized]);

  useEffect(() => {
    if (!keycloak) return;

    const onAuthSuccess = () => {
      console.log('Keycloak onAuthSuccess triggered.');
      setIsAuthenticated(!!keycloak.authenticated);
      if (keycloak.authenticated) {
        keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile));
      } else {
        setUser(null);
      }
    };
    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("Keycloak onAuthError triggered:", errorData);
      setIsAuthenticated(false);
      setUser(null);
    };
    const onAuthRefreshSuccess = () => {
       console.log('Keycloak onAuthRefreshSuccess triggered.');
    };
    const onAuthRefreshError = () => {
      console.error("Keycloak onAuthRefreshError: Failed to refresh token. Forcing logout.");
      keycloak.clearToken();
      setIsAuthenticated(false);
      setUser(null);
      setIsKeycloakInitialized(false);
      router.push('/login?sessionExpired=true');
    };
    const onAuthLogout = () => {
      console.log('Keycloak onAuthLogout triggered.');
      setIsAuthenticated(false);
      setUser(null);
      localStorage.removeItem('kc_access_token'); 
      localStorage.removeItem('kc_refresh_token');
      localStorage.removeItem('kc_id_token');
      localStorage.removeItem('kc_expires_in');
      setIsKeycloakInitialized(false);
    };
    const onTokenExpired = () => {
      console.log('Keycloak onTokenExpired triggered. Attempting to update token.');
      keycloak.updateToken(30).catch(() => { 
        console.error("Keycloak Token Expired: Failed to update token. Forcing logout.");
        setIsKeycloakInitialized(false); 
        keycloak.logout(); 
      });
    };
    
    keycloak.onAuthSuccess = onAuthSuccess;
    keycloak.onAuthError = onAuthError;
    keycloak.onAuthRefreshSuccess = onAuthRefreshSuccess;
    keycloak.onAuthRefreshError = onAuthRefreshError;
    keycloak.onAuthLogout = onAuthLogout;
    keycloak.onTokenExpired = onTokenExpired;

    // Cleanup: Keycloak docs suggest it's better not to set these to undefined.
    // Re-assignment on re-render should be fine if keycloak instance itself changes (which it doesn't here).
  }, [keycloak, router]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    // This login function is for redirect-based login (standard flow)
    if (keycloak) {
      setIsLoading(true);
      try {
        setIsKeycloakInitialized(false); // Allow re-init for standard flow
        await keycloak.login(options);
      } catch (error) {
        console.error("Keycloak login method error:", error);
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false);
      }
    }
  };

  const logout = async () => {
    if (keycloak) {
      setIsLoading(true); 
      try {
        const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
        await keycloak.logout({ redirectUri });
        // isKeycloakInitialized set to false in onAuthLogout
      } catch (error) {
        console.error("Keycloak logout error:", error);
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
        setIsKeycloakInitialized(false);
        setIsLoading(false);
      }
    }
  };

  const register = async (options?: Keycloak.KeycloakRegisterOptions) => {
    // This is for redirect-based registration.
    if (keycloak) {
      setIsLoading(true);
      try {
        setIsKeycloakInitialized(false); // Allow re-init for standard flow
        await keycloak.register(options);
      } catch (error) {
        console.error("Keycloak register error:", error);
        setIsLoading(false);
      }
    }
  };

  const getToken = async (): Promise<string | undefined> => {
    if (keycloak && keycloak.token) {
      try {
        await keycloak.updateToken(5); 
        return keycloak.token;
      } catch (error) {
        console.warn("Failed to refresh token or token not available during getToken:", error);
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
