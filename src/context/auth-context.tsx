
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
  login: (options?: Keycloak.KeycloakLoginOptions) => Promise<void>; // Kept for potential future use or standard flow
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
  const router = useRouter(); // Kept for logout redirect
  const pathname = usePathname(); // For logging

  // Ref to ensure keycloak.init() is called only once for the lifetime of the Keycloak instance
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


  useEffect(() => {
    const kcInstance = keycloak;

    if (!kcInstance || keycloakActualInitInvokedRef.current) {
      if (kcInstance && keycloakActualInitInvokedRef.current) {
        // If init was already attempted, ensure React state reflects Keycloak's current state,
        // especially after HMR or other re-renders not involving path changes.
        const currentAuthStatus = !!kcInstance.authenticated;
        if (isAuthenticated !== currentAuthStatus) {
            setIsAuthenticated(currentAuthStatus);
            console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Synced isAuthenticated state to: ${currentAuthStatus} (init already attempted)`);
        }
        if(isLoading && !currentAuthStatus && keycloakActualInitInvokedRef.current) {
            setIsLoading(false); // Ensure loading is false if init done and not auth
            console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Set isLoading to false (init already attempted, not auth)`);
        }
      }
      return; // Keycloak not ready or init already attempted
    }
    
    const performInitialization = async () => {
      console.log(`[CLIENT] AuthProvider:performInitialization - Starting for path: ${pathname}`);
      setIsLoading(true);
      keycloakActualInitInvokedRef.current = true; // Mark that init is being ATTEMPTED

      let initOptions: Keycloak.KeycloakInitOptions = {};
      let authenticatedByInit = false;

      try {
        const storedAccessToken = localStorage.getItem('kc_access_token');
        const storedRefreshToken = localStorage.getItem('kc_refresh_token');
        const storedIdToken = localStorage.getItem('kc_id_token');

        if (storedAccessToken && storedRefreshToken) {
          console.log("[CLIENT] AuthProvider:performInitialization - Found stored tokens from Direct Access Grant.");
          console.log(`[CLIENT] AuthProvider:performInitialization - Using Access Token (prefix): ${storedAccessToken.substring(0,20)}...`);
          initOptions = {
            token: storedAccessToken,
            refreshToken: storedRefreshToken,
            idToken: storedIdToken ?? undefined, // idToken might be null if not stored
            checkLoginIframe: false, // Important for manual token initialization
          };
          console.log(`[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:`, JSON.stringify({token: "...", refreshToken: "...", idToken: storedIdToken ? "..." : undefined, checkLoginIframe: false}));
          
          authenticatedByInit = await kcInstance.init(initOptions);
          console.log(`[CLIENT] AuthProvider:performInitialization - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByInit}`);
          console.log(`[CLIENT] AuthProvider:performInitialization - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);

          // Clear tokens after attempting to use them for init
          localStorage.removeItem('kc_access_token');
          localStorage.removeItem('kc_refresh_token');
          localStorage.removeItem('kc_id_token');
          localStorage.removeItem('kc_expires_in');
          console.log("[CLIENT] AuthProvider:performInitialization - Cleared stored DAG tokens from localStorage.");

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
              console.log(`[CLIENT] AuthProvider:performInitialization - Token available. Attempting to log on server (after profile).`);
              logTokenOnServer(kcInstance.token).catch(e => console.error("[CLIENT] AuthProvider:performInitialization - Error in logTokenOnServer (after profile):", e));
            }
          } catch (profileError) {
            console.error("[CLIENT] AuthProvider:performInitialization - Error loading user profile:", profileError);
            // If profile load fails, we might reconsider isAuthenticated
            setIsAuthenticated(false); // Or handle more gracefully
            setUser(null);
            if (kcInstance.token) kcInstance.clearToken();
          }
        } else {
          console.log('[CLIENT] AuthProvider:performInitialization - User IS NOT effectively authenticated after this run.');
          setUser(null);
        }
      } catch (error: any) {
        console.error("[CLIENT] AuthProvider:performInitialization - Outer catch block error during Keycloak initialization. Raw error object:", error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
        console.log(`[CLIENT] AuthProvider:performInitialization - Initialization process finished. isLoading: ${isLoading} isAuthenticated (React state): ${isAuthenticated} kcInstance.authenticated: ${kcInstance?.authenticated}`);
      }
    };

    performInitialization();

  // This effect should run only once when keycloak instance is set
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keycloak]);


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
             console.log(`[CLIENT] Keycloak EVENT: onAuthSuccess - Token available. Attempting to log on server.`);
             logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error calling logTokenOnServer:", e));
           }
        }).catch(err => { 
          console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile:", err); 
          setUser(null); 
        });
      } else {
        setUser(null);
      }
      setIsLoading(false); 
    };

    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered.", errorData);
      setIsAuthenticated(false); 
      setUser(null);
      setIsLoading(false);
    };

    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered.');
       setIsAuthenticated(!!keycloak.authenticated); 
       if (keycloak.token && keycloak.authenticated) {
           console.log(`[CLIENT] Keycloak EVENT: onAuthRefreshSuccess - Token available. Attempting to log on server.`);
           logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthRefreshSuccess - Error calling logTokenOnServer:", e));
       }
    };

    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError. User session might be invalid.");
      setIsAuthenticated(false); 
      setUser(null); 
      if (keycloak.token) keycloak.clearToken();
      setIsLoading(false);
    };

    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered. Stack trace:', new Error().stack);
      setIsAuthenticated(false); 
      setUser(null);
      setIsLoading(false);
      // For DAG logout, we might need to manually clear localStorage too if not using standard logout redirect
      localStorage.removeItem('kc_access_token');
      localStorage.removeItem('kc_refresh_token');
      localStorage.removeItem('kc_id_token');
      localStorage.removeItem('kc_expires_in');
      // Could redirect to login page here if desired, e.g., router.push('/login');
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
                // This might be where a redirect to login is needed if refresh fails and session is lost
             }
          }
        })
        .catch(() => { 
          console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Token refresh failed.");
          setIsAuthenticated(false);
          setUser(null);
          if (keycloak.token) keycloak.clearToken();
          setIsLoading(false);
          // Redirect to login or show error
      });
    };

    keycloak.onAuthSuccess = onAuthSuccess;
    keycloak.onAuthError = onAuthError;
    keycloak.onAuthRefreshSuccess = onAuthRefreshSuccess;
    keycloak.onAuthRefreshError = onAuthRefreshError;
    keycloak.onAuthLogout = onAuthLogout;
    keycloak.onTokenExpired = onTokenExpired;
    console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak event handlers registered.');

    return () => {
      if (keycloak) {
        console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Cleaning up Keycloak event handlers.');
        // It's generally not recommended to undefined these directly if the instance persists
        // keycloak.onAuthSuccess = undefined; 
        // ...
      }
    };
  }, [keycloak]);


  // This login function is for the standard redirect flow
  const login = useCallback(async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:login - Standard Keycloak login initiated (redirect flow). Options:', options);
      setIsLoading(true);
      try {
        await keycloak.login(options); // This will redirect the browser
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
      // Clear local storage irrespective of Keycloak's own clearing, for DAG tokens
      localStorage.removeItem('kc_access_token');
      localStorage.removeItem('kc_refresh_token');
      localStorage.removeItem('kc_id_token');
      localStorage.removeItem('kc_expires_in');
      console.log("[CLIENT] AuthProvider:logout - Cleared DAG tokens from localStorage.");
      try {
        await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined });
        // onAuthLogout event should handle state changes.
      } catch (e) {
        console.error('[CLIENT] AuthProvider:logout - keycloak.logout() threw an error. Manual state reset.', e);
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false); 
        if (typeof window !== 'undefined') {
          window.location.href = '/login?logoutFailed=true'; // Force redirect
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
        await keycloak.register(options); // This will redirect the browser
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
      // console.log('[CLIENT] AuthProvider:getToken - Not authenticated or keycloak not available.');
      return undefined;
    }
    try {
      const refreshed = await keycloak.updateToken(5); 
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed.');
        if (keycloak.token) {
           logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] AuthProvider:getToken - Error calling logTokenOnServer (after refresh):", e));
        }
      }
    } catch (error) {
      console.error('[CLIENT] AuthProvider:getToken - Error updating token. Session might be invalid.', error);
      // This could be a place to trigger full logout / re-authentication
      setIsAuthenticated(false); 
      setUser(null);
      // setIsLoading(false); // Careful with setting isLoading here, might cause loops
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

