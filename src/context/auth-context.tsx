
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import getKeycloakInstance, { type UserProfile } from '@/lib/keycloak';
import type Keycloak from 'keycloak-js';
import { logTokenOnServer } from '@/lib/server-actions/auth-actions';

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

// Helper function to clear DAG tokens from localStorage
const clearDagTokens = () => {
  console.log("[CLIENT] AuthProvider:clearDagTokens - Clearing stored DAG tokens from localStorage.");
  localStorage.removeItem('kc_access_token');
  localStorage.removeItem('kc_refresh_token');
  localStorage.removeItem('kc_id_token');
  localStorage.removeItem('kc_expires_in');
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const keycloakActualInitInvokedRef = useRef(false);

  useEffect(() => {
    console.log('[CLIENT] AuthProvider:useEffect[] - Getting Keycloak instance.');
    const kcInstance = getKeycloakInstance();
    if (kcInstance) {
      setKeycloak(kcInstance);
    } else {
      console.error('[CLIENT] AuthProvider:useEffect[] - Failed to get Keycloak instance!');
      setIsLoading(false);
    }
  }, []);

  const performInitialization = useCallback(async (kcInstance: Keycloak) => {
    console.log(`[CLIENT] AuthProvider:performInitialization - Starting for path: ${pathname}`);
    setIsLoading(true);

    let initOptions: Keycloak.KeycloakInitOptions = {};
    let authenticatedByInit = false;

    try {
      const storedAccessToken = localStorage.getItem('kc_access_token');
      const storedRefreshToken = localStorage.getItem('kc_refresh_token');
      const storedIdToken = localStorage.getItem('kc_id_token');

      if (storedAccessToken && storedRefreshToken) {
        console.log("[CLIENT] AuthProvider:performInitialization - Found stored tokens from Direct Access Grant.");
        console.log(`[CLIENT] AuthProvider:performInitialization - Using Access Token (prefix): ${storedAccessToken.substring(0, 20)}...`);
        initOptions = {
          token: storedAccessToken,
          refreshToken: storedRefreshToken,
          idToken: storedIdToken ?? undefined,
          checkLoginIframe: false, // Important for manual token initialization
        };
        console.log(`[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:`, JSON.stringify({ token: "...", refreshToken: "...", idToken: storedIdToken ? "..." : undefined, checkLoginIframe: false }));
        
        authenticatedByInit = await kcInstance.init(initOptions);
        console.log(`[CLIENT] AuthProvider:performInitialization - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByInit}`);
        console.log(`[CLIENT] AuthProvider:performInitialization - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
        
        // If init with tokens fails to authenticate, clear them
        if (!kcInstance.authenticated) {
            console.warn("[CLIENT] AuthProvider:performInitialization - Init with stored tokens did NOT result in authenticated state. Clearing stored tokens.");
            clearDagTokens();
        }
      } else {
        console.log("[CLIENT] AuthProvider:performInitialization - No stored DAG tokens found. Using default init options (check-sso).");
        initOptions = {
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
          pkceMethod: 'S256',
        };
        console.log('[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with standard options:', JSON.stringify(initOptions));
        authenticatedByInit = await kcInstance.init(initOptions);
        console.log(`[CLIENT] AuthProvider:performInitialization - Keycloak init (standard) success. Authenticated flag from init: ${authenticatedByInit}`);
      }

      const currentAuthStatus = !!kcInstance.authenticated;
      setIsAuthenticated(currentAuthStatus);
      console.log(`[CLIENT] AuthProvider:performInitialization - isAuthenticated state set to: ${currentAuthStatus}`);

      if (currentAuthStatus) {
        console.log('[CLIENT] AuthProvider:performInitialization - User IS authenticated. Attempting to load user profile...');
        try {
          const profile = await kcInstance.loadUserProfile() as UserProfile;
          setUser(profile);
          console.log('[CLIENT] AuthProvider:performInitialization - User profile loaded:', profile);
          if (kcInstance.token) {
            logTokenOnServer(kcInstance.token).catch(e => console.error("[CLIENT] AuthProvider:performInitialization - Error in logTokenOnServer (after profile):", e));
          }
        } catch (profileError) {
          console.error("[CLIENT] AuthProvider:performInitialization - Error loading user profile:", profileError);
          setIsAuthenticated(false); 
          setUser(null);
          if (kcInstance.token) kcInstance.clearToken(); 
          clearDagTokens(); // Also clear localStorage tokens if profile load fails
        }
      } else {
        console.log('[CLIENT] AuthProvider:performInitialization - User IS NOT effectively authenticated after this run.');
        setUser(null);
        // If init was standard and failed, or with tokens and failed, ensure tokens are cleared.
        if (storedAccessToken) clearDagTokens();
      }
    } catch (error: any) {
      console.error("[CLIENT] AuthProvider:performInitialization - Outer catch block error during Keycloak initialization. Raw error object:", error);
      console.error("[CLIENT] AuthProvider:performInitialization - Error details:", error.message, error.stack);
      if (error.error && error.error_description) {
        console.error(`[CLIENT] AuthProvider:performInitialization - Keycloak error: ${error.error}, Description: ${error.error_description}`);
      }
      setIsAuthenticated(false);
      setUser(null);
      clearDagTokens(); // Clear any potentially problematic tokens on any init error
    } finally {
      // Clear tokens if they were from localStorage and init attempted to use them,
      // regardless of success, to prevent re-processing stale tokens.
      // This is now handled more specifically within the try block.
      // if (localStorage.getItem('kc_access_token')) { // This might be too broad
      //   console.log("[CLIENT] AuthProvider:performInitialization - Clearing stored DAG tokens from localStorage (after init attempt).");
      //   clearDagTokens();
      // }
      setIsLoading(false);
      console.log(`[CLIENT] AuthProvider:performInitialization - Initialization process finished. isLoading: ${isLoading} isAuthenticated (state): ${isAuthenticated} keycloak.authenticated (instance): ${kcInstance?.authenticated}`);
    }
  }, [pathname, isLoading, isAuthenticated]); // Dependencies kept for re-evaluation on path change

  useEffect(() => {
    if (keycloak && !keycloakActualInitInvokedRef.current) {
      console.log("[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance is set AND init not yet invoked. Calling performInitialization.");
      keycloakActualInitInvokedRef.current = true; 
      performInitialization(keycloak);
    } else if (keycloak && keycloakActualInitInvokedRef.current) {
      console.log("[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance set AND init was already invoked. Syncing state if necessary.");
      const currentAuthStatus = !!keycloak.authenticated;
      if (isAuthenticated !== currentAuthStatus) {
        setIsAuthenticated(currentAuthStatus);
        console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Synced isAuthenticated state to: ${currentAuthStatus}`);
      }
      if (currentAuthStatus && !user && keycloak.token) { 
        keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile)).catch(() => {
          setUser(null);
          // If profile fails to load after being authenticated, treat as auth error
          setIsAuthenticated(false);
          if(keycloak.token) keycloak.clearToken();
          clearDagTokens();
        });
      } else if (!currentAuthStatus && user) {
        setUser(null);
      }
      if (isLoading) setIsLoading(false); 
    }
  }, [keycloak, performInitialization, isAuthenticated, user, isLoading]); // performInitialization is a dependency

  useEffect(() => {
    if (!keycloak) return;

    const onAuthSuccess = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthSuccess triggered. kc.authenticated:', keycloak.authenticated);
      setIsAuthenticated(!!keycloak.authenticated);
      if (keycloak.authenticated) {
        keycloak.loadUserProfile().then(profile => {
          setUser(profile as UserProfile);
          console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - User profile loaded:', profile);
           if (keycloak.token) {
             logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error calling logTokenOnServer:", e));
           }
        }).catch(err => { 
          console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile:", err); 
          setUser(null);
          setIsAuthenticated(false);
          if(keycloak.token) keycloak.clearToken();
          clearDagTokens();
        });
      } else {
        setUser(null);
        setIsAuthenticated(false); // Ensure state is false if kc.auth is false
      }
      setIsLoading(false); 
    };

    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered.", errorData);
      console.error(`[CLIENT] Keycloak EVENT: onAuthError - Error: ${errorData.error}, Description: ${errorData.error_description}`);
      setIsAuthenticated(false); 
      setUser(null);
      clearDagTokens(); // Clear localStorage tokens on auth error
      setIsLoading(false);
    };

    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered.');
       setIsAuthenticated(!!keycloak.authenticated); 
       if (keycloak.token && keycloak.authenticated) {
           logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthRefreshSuccess - Error calling logTokenOnServer:", e));
       }
    };

    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError. User session might be invalid.");
      setIsAuthenticated(false); 
      setUser(null); 
      if (keycloak.token) keycloak.clearToken();
      clearDagTokens(); // Clear localStorage tokens on refresh error
      setIsLoading(false);
    };

    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered. Stack trace:', new Error().stack);
      setIsAuthenticated(false); 
      setUser(null);
      clearDagTokens(); // Crucial: ensure localStorage is cleared on logout event
      console.log("[CLIENT] Keycloak EVENT: onAuthLogout - Cleared DAG tokens from localStorage.");
      setIsLoading(false); // Ensure loading is false after logout processing
    };

    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting token refresh...');
      keycloak.updateToken(30) 
        .then(refreshed => {
          if (refreshed) {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token was refreshed successfully.');
            if (keycloak.token) {
                logTokenOnServer(keycloak.token);
            }
          } else {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token not refreshed. kc.authenticated:', keycloak.authenticated);
             if (!keycloak.authenticated) {
                setIsAuthenticated(false);
                setUser(null);
                clearDagTokens(); // Clear localStorage if refresh fails and not authenticated
             }
          }
        })
        .catch(() => { 
          console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Token refresh failed.");
          setIsAuthenticated(false);
          setUser(null);
          if (keycloak.token) keycloak.clearToken();
          clearDagTokens(); // Clear localStorage on token refresh failure
          setIsLoading(false);
      });
    };

    keycloak.onAuthSuccess = onAuthSuccess;
    keycloak.onAuthError = onAuthError;
    keycloak.onAuthRefreshSuccess = onAuthRefreshSuccess;
    keycloak.onAuthRefreshError = onAuthRefreshError;
    keycloak.onAuthLogout = onAuthLogout;
    keycloak.onTokenExpired = onTokenExpired;
    console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak event handlers registered.');

  }, [keycloak]); // Only re-register handlers if keycloak instance changes


  const login = useCallback(async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      const defaultOptions: Keycloak.KeycloakLoginOptions = {
        // redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/dashboard/my-videos` : undefined,
        ...options, // Allow overriding
      };
      console.log('[CLIENT] AuthProvider:login - Standard Keycloak login initiated (redirect flow). Options:', defaultOptions);
      setIsLoading(true);
      try {
        await keycloak.login(defaultOptions);
      } catch (e) {
        console.error('[CLIENT] AuthProvider:login - keycloak.login() threw an error', e);
        setIsLoading(false); 
      }
    } else {
      console.error('[CLIENT] AuthProvider:login - Keycloak instance not available.');
      setIsLoading(false);
    }
  },[keycloak]);

  const logout = useCallback(async () => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:logout - Logout initiated.');
      setIsLoading(true);
      clearDagTokens(); // Ensure localStorage is cleared before Keycloak logout call
      try {
        await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined });
        // After this, onAuthLogout event should fire and handle final state cleanup
      } catch (e) {
        console.error('[CLIENT] AuthProvider:logout - keycloak.logout() threw an error. Manual state reset.', e);
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false); 
        clearDagTokens(); // Belt and braces
        if (typeof window !== 'undefined') {
          window.location.href = '/login?logoutFailed=true';
        }
      }
    } else {
      console.error('[CLIENT] AuthProvider:logout - Keycloak instance not available.');
      setIsLoading(false);
    }
  }, [keycloak]);

  const register = useCallback(async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:register - Standard Keycloak registration initiated (redirect flow). Options:', options);
      setIsLoading(true);
      try {
        await keycloak.register(options);
      } catch (e) {
        console.error('[CLIENT] AuthProvider:register - keycloak.register() threw an error', e);
        setIsLoading(false);
      }
    } else {
      console.error('[CLIENT] AuthProvider:register - Keycloak instance not available.');
      setIsLoading(false);
    }
  }, [keycloak]);

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!keycloak || !keycloak.authenticated) {
      console.log('[CLIENT] AuthProvider:getToken - Not authenticated or Keycloak not available. Returning undefined.');
      return undefined;
    }
    try {
      const refreshed = await keycloak.updateToken(5); // Try to update token if it's less than 5 seconds valid
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed.');
        if (keycloak.token) {
           logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] AuthProvider:getToken - Error calling logTokenOnServer (after refresh):", e));
        }
      } else {
        console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (still valid or refresh not needed).');
      }
    } catch (error) {
      console.error('[CLIENT] AuthProvider:getToken - Error updating token. Session might be invalid.', error);
      setIsAuthenticated(false); 
      setUser(null);
      clearDagTokens(); // Clear localStorage tokens if refresh fails
      return undefined;
    }
    return keycloak.token;
  }, [keycloak]);

  console.log(`[CLIENT] AuthProvider RENDER - isLoading: ${isLoading}, isAuthenticated (React state): ${isAuthenticated}, user: ${user?.username}, keycloak set: ${!!keycloak}, kc.auth: ${keycloak?.authenticated}`);

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

