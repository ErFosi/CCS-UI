
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo } from 'react';
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const keycloakInstanceFromLib = useMemo(() => getKeycloakInstance(), []);
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  
  const keycloakActualInitInvokedRef = useRef(false); // Tracks if keycloak.init() has been called

  useEffect(() => {
    console.log('[CLIENT] AuthProvider:useEffect[] - Setting Keycloak instance from keycloakInstanceFromLib');
    if (keycloakInstanceFromLib) {
      setKeycloak(keycloakInstanceFromLib);
    } else {
      console.error('[CLIENT] AuthProvider:useEffect[] - Failed to get Keycloak instance from lib!');
      setIsLoading(false);
    }
  }, [keycloakInstanceFromLib]);

  const initSessionAsync = useCallback(async (kcInstance: Keycloak) => {
    console.log(`[CLIENT] AuthProvider:initSessionAsync - Called. kcInstance.authenticated (before init attempt): ${kcInstance.authenticated}, actualInitInvokedRef: ${keycloakActualInitInvokedRef.current}`);
    
    if (kcInstance.authenticated && keycloakActualInitInvokedRef.current) {
      console.log('[CLIENT] AuthProvider:initSessionAsync - Keycloak instance already authenticated AND init was previously invoked. Syncing state.');
      setIsAuthenticated(true);
      try {
        const profile = await kcInstance.loadUserProfile() as UserProfile;
        setUser(profile);
        console.log('[CLIENT] AuthProvider:initSessionAsync - User profile loaded for already authenticated session:', profile);
      } catch (profileError) {
        console.error("[CLIENT] AuthProvider:initSessionAsync - Error loading user profile for already authenticated session:", profileError);
        setUser(null);
      }
      setIsLoading(false);
      return;
    }

    if (keycloakActualInitInvokedRef.current) {
      console.log('[CLIENT] AuthProvider:initSessionAsync - keycloak.init() was already invoked. Current kc.authenticated:', kcInstance.authenticated);
      setIsAuthenticated(!!kcInstance.authenticated);
      if (!kcInstance.authenticated) setUser(null);
      setIsLoading(false);
      return;
    }
    
    keycloakActualInitInvokedRef.current = true;
    console.log('[CLIENT] AuthProvider:initSessionAsync - Marked actualInitInvokedRef as true. Attempting keycloak.init().');

    let authenticatedByThisInitRun = false;
    let initOptions: Keycloak.KeycloakInitOptions = {};

    try {
      const storedAccessToken = localStorage.getItem('kc_access_token');
      const storedRefreshToken = localStorage.getItem('kc_refresh_token');
      const storedIdToken = localStorage.getItem('kc_id_token');

      if (storedAccessToken && storedRefreshToken && storedIdToken) {
        console.log('[CLIENT] AuthProvider:initSessionAsync - Found stored tokens from Direct Access Grant.');
        console.log(`[CLIENT] AuthProvider:initSessionAsync - Using Access Token (prefix): ${storedAccessToken.substring(0,20)}...`);
        
        initOptions = {
          token: storedAccessToken,
          refreshToken: storedRefreshToken,
          idToken: storedIdToken,
          pkceMethod: 'S256',
        };
        console.log('[CLIENT] AuthProvider:initSessionAsync - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:', JSON.stringify(initOptions, null, 2));
        authenticatedByThisInitRun = await kcInstance.init(initOptions);
        console.log(`[CLIENT] AuthProvider:initSessionAsync - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByThisInitRun}`);
        console.log(`[CLIENT] AuthProvider:initSessionAsync - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
        console.log(`[CLIENT] AuthProvider:initSessionAsync - AFTER init with tokens, kcInstance.token (prefix): ${kcInstance.token ? kcInstance.token.substring(0,20)+'...' : 'undefined'}`);
        
        console.log('[CLIENT] AuthProvider:initSessionAsync - Clearing DAG tokens from localStorage after init attempt.');
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');

      } else {
        console.log('[CLIENT] AuthProvider:initSessionAsync - No stored DAG tokens found. Using default init options (check-sso).');
        initOptions = {
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
          pkceMethod: 'S256',
        };
        console.log('[CLIENT] AuthProvider:initSessionAsync - Calling keycloak.init() with standard options:', JSON.stringify(initOptions));
        authenticatedByThisInitRun = await kcInstance.init(initOptions);
        console.log(`[CLIENT] AuthProvider:initSessionAsync - Keycloak init (standard) success. Authenticated flag from init: ${authenticatedByThisInitRun}`);
      }
      
      const currentAuthStatus = !!kcInstance.authenticated;
      setIsAuthenticated(currentAuthStatus);
      console.log('[CLIENT] AuthProvider:initSessionAsync - isAuthenticated state set to:', currentAuthStatus);

      if (currentAuthStatus) {
        console.log('[CLIENT] AuthProvider:initSessionAsync - User IS authenticated. Attempting to load user profile...');
        try {
          const profile = await kcInstance.loadUserProfile() as UserProfile;
          setUser(profile);
          console.log('[CLIENT] AuthProvider:initSessionAsync - User profile loaded successfully:', profile);
        } catch (profileError) {
          console.error("[CLIENT] AuthProvider:initSessionAsync - Error loading user profile despite kc.authenticated true:", profileError);
          setIsAuthenticated(false); 
          setUser(null);
          if (kcInstance.token) kcInstance.clearToken();
        }
      } else {
        console.log('[CLIENT] AuthProvider:initSessionAsync - User IS NOT effectively authenticated after this run.');
        setUser(null);
      }

    } catch (error: any) {
      console.error("[CLIENT] AuthProvider:initSessionAsync - Outer catch block error during Keycloak initialization. Raw error object:", error);
      let detailedMessage = "Keycloak initialization failed. ";
      if (error && error.message) { detailedMessage += `Details: ${error.message}. `; }
      else { detailedMessage += "No specific error message was provided. "; }
      console.error(detailedMessage, "Error Name:", error?.name);
      
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log(`[CLIENT] AuthProvider:initSessionAsync - Initialization process finished. isLoading: false isAuthenticated (React state): ${isAuthenticated} kcInstance.authenticated: ${kcInstance?.authenticated}`);
    }
  }, [isAuthenticated]); // Only re-evaluate if isAuthenticated changes externally

  useEffect(() => {
    console.log(`[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Path: ${pathname}. kc.auth before initSessionAsync: ${keycloak?.authenticated}, actualInitInvokedRef: ${keycloakActualInitInvokedRef.current}`);
    if (keycloak) {
      initSessionAsync(keycloak);
    }
  }, [keycloak, pathname, initSessionAsync]);


  useEffect(() => {
    if (isAuthenticated && keycloak && keycloak.token) {
      console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - User is authenticated and token IS available. Token (prefix): ${keycloak.token.substring(0, 20)}...`);
      logTokenOnServer(keycloak.token)
        .then(() => {
          console.log('[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - logTokenOnServer Server Action was invoked successfully from client.');
        })
        .catch(serverActionError => {
          console.error('[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - Error calling logTokenOnServer Server Action:', serverActionError);
        });
    } else if (isAuthenticated && keycloak && !keycloak.token) {
        console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - User is authenticated BUT token is NOT available at this moment in this effect.`);
    }
  }, [isAuthenticated, keycloak, keycloak?.token]);

  useEffect(() => {
    if (!keycloak) return;
    const onAuthSuccess = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthSuccess triggered. kc.authenticated:', keycloak.authenticated);
      setIsAuthenticated(!!keycloak.authenticated);
      if (keycloak.authenticated) {
        keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile))
        .catch(err => { console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile:", err); setUser(null); });
      } else { setUser(null); }
    };
    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered.", errorData);
      setIsAuthenticated(false); setUser(null);
    };
    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered.');
       setIsAuthenticated(!!keycloak.authenticated);
    };
    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError.");
      setIsAuthenticated(false); setUser(null); if (keycloak.token) keycloak.clearToken();
      router.push('/login?sessionExpired=true&reason=onAuthRefreshError');
    };
    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered.');
      setIsAuthenticated(false); setUser(null);
      localStorage.removeItem('kc_access_token'); localStorage.removeItem('kc_refresh_token');
      localStorage.removeItem('kc_id_token'); localStorage.removeItem('kc_expires_in');
      keycloakActualInitInvokedRef.current = false;
    };
    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting refresh...');
      keycloak.updateToken(30).catch(() => { 
        console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Refresh failed.");
        setIsAuthenticated(false); setUser(null); if (keycloak.token) keycloak.clearToken();
        router.push('/login?sessionExpired=true&reason=tokenExpiredNoRefresh');
      });
    };
    keycloak.onAuthSuccess = onAuthSuccess; keycloak.onAuthError = onAuthError;
    keycloak.onAuthRefreshSuccess = onAuthRefreshSuccess; keycloak.onAuthRefreshError = onAuthRefreshError;
    keycloak.onAuthLogout = onAuthLogout; keycloak.onTokenExpired = onTokenExpired;
    console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak event handlers registered.');
    return () => {
      if (keycloak) {
        keycloak.onAuthSuccess = undefined; keycloak.onAuthError = undefined;
        keycloak.onAuthRefreshSuccess = undefined; keycloak.onAuthRefreshError = undefined;
        keycloak.onAuthLogout = undefined; keycloak.onTokenExpired = undefined;
      }
    };
  }, [keycloak, router]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      setIsLoading(true); keycloakActualInitInvokedRef.current = false;
      await keycloak.login(options).catch(() => { setIsLoading(false); });
    }
  };
  const logout = async () => {
    if (keycloak) {
      setIsLoading(true);
      await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined })
      .catch(() => { /* Reset state manually if logout itself fails */
        setIsAuthenticated(false); setUser(null);
        localStorage.removeItem('kc_access_token'); localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token'); localStorage.removeItem('kc_expires_in');
        keycloakActualInitInvokedRef.current = false; setIsLoading(false);
      });
    }
  };
  const register = async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) { setIsLoading(true); keycloakActualInitInvokedRef.current = false; await keycloak.register(options).catch(() => setIsLoading(false));}
  };
  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!keycloak || !keycloak.authenticated) return undefined;
    try {
      await keycloak.updateToken(5);
    } catch {
      setIsAuthenticated(false); setUser(null);
      router.push('/login?sessionExpired=true&reason=getTokenUpdateFailed');
      return undefined;
    }
    return keycloak.token;
  }, [keycloak, router]);

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

    