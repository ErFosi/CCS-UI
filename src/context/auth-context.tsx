
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const keycloakActualInitInvokedRef = useRef(false); // Tracks if keycloak.init() has been called

  useEffect(() => {
    console.log('[CLIENT] AuthProvider:useEffect[] - Setting Keycloak instance.');
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

    if (kcInstance && !keycloakActualInitInvokedRef.current) {
      console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance available. Attempting ONE-TIME initialization.');
      keycloakActualInitInvokedRef.current = true; // Mark that we are now attempting init, ONCE.

      const performInitialization = async () => {
        console.log(`[CLIENT] AuthProvider:performInitialization - Starting for path: ${pathname}`);
        setIsLoading(true);
        let initOptions: Keycloak.KeycloakInitOptions = {};
        let authenticatedByThisInitRun = false;

        try {
          const storedAccessToken = localStorage.getItem('kc_access_token');
          const storedRefreshToken = localStorage.getItem('kc_refresh_token');
          const storedIdToken = localStorage.getItem('kc_id_token'); // Can be null

          if (storedAccessToken && storedRefreshToken) {
            console.log('[CLIENT] AuthProvider:performInitialization - Found stored tokens from Direct Access Grant.');
            console.log(`[CLIENT] AuthProvider:performInitialization - Using Access Token (prefix): ${storedAccessToken.substring(0,20)}...`);
            
            initOptions = {
              token: storedAccessToken,
              refreshToken: storedRefreshToken,
              idToken: storedIdToken ?? undefined, // Pass undefined if null
              // NO onLoad, NO silentCheckSsoRedirectUri, NO pkceMethod for this path
              // This is a direct attempt to initialize with existing tokens.
            };
            console.log('[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:', JSON.stringify(initOptions, (key, value) => (key === 'token' || key === 'refreshToken' || key === 'idToken') && value ? `${value.substring(0,10)}...` : value , 2));
            
            authenticatedByThisInitRun = await kcInstance.init(initOptions);
            
            console.log(`[CLIENT] AuthProvider:performInitialization - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByThisInitRun}`);
            console.log(`[CLIENT] AuthProvider:performInitialization - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
            
            console.log('[CLIENT] AuthProvider:performInitialization - Clearing DAG tokens from localStorage after init attempt.');
            localStorage.removeItem('kc_access_token');
            localStorage.removeItem('kc_refresh_token');
            localStorage.removeItem('kc_id_token');
            localStorage.removeItem('kc_expires_in');
          } else {
            console.log('[CLIENT] AuthProvider:performInitialization - No stored DAG tokens found. Using default init options (check-sso).');
            initOptions = {
              onLoad: 'check-sso',
              silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
              pkceMethod: 'S256',
            };
            console.log('[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with standard options:', JSON.stringify(initOptions));
            authenticatedByThisInitRun = await kcInstance.init(initOptions);
            console.log(`[CLIENT] AuthProvider:performInitialization - Keycloak init (standard) success. Authenticated flag from init: ${authenticatedByThisInitRun}`);
          }
          
          // Use kcInstance.authenticated directly after init attempt as the source of truth
          const currentAuthStatus = !!kcInstance.authenticated; 
          setIsAuthenticated(currentAuthStatus);
          console.log('[CLIENT] AuthProvider:performInitialization - isAuthenticated state set to:', currentAuthStatus);

          if (currentAuthStatus) {
            console.log('[CLIENT] AuthProvider:performInitialization - User IS authenticated. Attempting to load user profile...');
            try {
              const profile = await kcInstance.loadUserProfile() as UserProfile;
              setUser(profile);
              console.log('[CLIENT] AuthProvider:performInitialization - User profile loaded successfully:', profile);
              if (kcInstance.token) {
                 console.log(`[CLIENT] AuthProvider:performInitialization - Token available after profile load. Token (prefix): ${kcInstance.token.substring(0, 20)}... Attempting to log on server.`);
                 logTokenOnServer(kcInstance.token).catch(e => console.error("[CLIENT] AuthProvider:performInitialization - Error calling logTokenOnServer (after profile load):", e));
              } else {
                 console.log('[CLIENT] AuthProvider:performInitialization - Token NOT available after profile load, even though authenticated.');
              }
            } catch (profileError) {
              console.error("[CLIENT] AuthProvider:performInitialization - Error loading user profile despite kc.authenticated true:", profileError);
              setIsAuthenticated(false); // Revert if profile load fails
              setUser(null);
              if (kcInstance.token) kcInstance.clearToken(); 
            }
          } else {
            console.log('[CLIENT] AuthProvider:performInitialization - User IS NOT effectively authenticated after this run.');
            setUser(null);
          }

        } catch (error: any) {
          console.error("[CLIENT] AuthProvider:performInitialization - Error during Keycloak initialization. Raw error object:", error);
          let detailedMessage = "Keycloak initialization failed. ";
          if (error && error.message) { detailedMessage += `Details: ${error.message}. `; }
          else { detailedMessage += "No specific error message was provided. "; }
          
          if (error?.message?.includes("initialized once")) {
            console.warn("[CLIENT] AuthProvider:performInitialization - Caught 'already initialized' error. This should have been prevented by keycloakActualInitInvokedRef. Current kc.authenticated:", kcInstance.authenticated);
          } else {
            console.error(detailedMessage, "Error Name:", error?.name);
          }
          setIsAuthenticated(false);
          setUser(null);
        } finally {
          setIsLoading(false);
          console.log(`[CLIENT] AuthProvider:performInitialization - Finished. isLoading: ${isLoading}, isAuthenticated (React state): ${isAuthenticated} kcInstance.authenticated: ${kcInstance?.authenticated}`);
        }
      };

      performInitialization();

    } else if (kcInstance && keycloakActualInitInvokedRef.current) {
      // This block handles subsequent renders/route changes AFTER initial init attempt.
      // We do NOT re-call keycloak.init(). We sync React state with Keycloak's current state.
      console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance available AND actual init already invoked. Syncing React state if necessary for path: ${pathname}. Current kc.authenticated: ${kcInstance.authenticated}`);
      const currentAuthStatus = !!kcInstance.authenticated;
      if (isAuthenticated !== currentAuthStatus) {
        setIsAuthenticated(currentAuthStatus);
        console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Synced isAuthenticated state to:', currentAuthStatus);
      }
      if (currentAuthStatus && !user) {
        kcInstance.loadUserProfile().then(profile => {
          setUser(profile as UserProfile);
          console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Synced user profile:', profile);
        }).catch(() => {
          console.error('[CLIENT] AuthProvider:useEffect[keycloak] - Error syncing user profile despite kc.authenticated true. Clearing user.');
          setUser(null);
        });
      } else if (!currentAuthStatus && user) {
        setUser(null);
        console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Cleared user profile as no longer authenticated.');
      }
      if (isLoading) { // Ensure isLoading is false if we reach here post-init.
        setIsLoading(false);
        console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Ensured isLoading is false post-init attempt.');
      }
    }
  }, [keycloak]); // This effect ONLY depends on the keycloak instance.

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
             console.log(`[CLIENT] Keycloak EVENT: onAuthSuccess - Token available. Token (prefix): ${keycloak.token.substring(0, 20)}... Attempting to log on server.`);
             logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error calling logTokenOnServer:", e));
           }
        }).catch(err => { 
          console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile:", err); 
          setUser(null); 
        });
      } else {
        setUser(null);
      }
    };

    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered.", errorData);
      setIsAuthenticated(false); 
      setUser(null);
    };

    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered. New token prefix:', keycloak.token ? keycloak.token.substring(0,20)+'...' : 'undefined');
       setIsAuthenticated(!!keycloak.authenticated); 
       if (keycloak.token && keycloak.authenticated) {
           console.log(`[CLIENT] Keycloak EVENT: onAuthRefreshSuccess - Token available and authenticated. Attempting to log on server.`);
           logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthRefreshSuccess - Error calling logTokenOnServer:", e));
       }
    };

    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError. User session might be invalid.");
      setIsAuthenticated(false); 
      setUser(null); 
      if (keycloak.token) keycloak.clearToken();
    };

    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered. Stack trace:', new Error().stack);
      setIsAuthenticated(false); 
      setUser(null);
      // DAG tokens are cleared by performInitialization, standard logout handles its own.
    };

    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting token refresh...');
      keycloak.updateToken(30) 
        .then(refreshed => {
          if (refreshed) {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token was refreshed successfully.');
          } else {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token not refreshed (e.g. still valid or error during refresh). kc.authenticated:', keycloak.authenticated);
             if (!keycloak.authenticated) { // If token not refreshed and not authenticated, treat as logout
                setIsAuthenticated(false);
                setUser(null);
             }
          }
        })
        .catch(() => { 
          console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Token refresh failed. Clearing session state.");
          setIsAuthenticated(false);
          setUser(null);
          if (keycloak.token) keycloak.clearToken();
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
        keycloak.onAuthSuccess = undefined;
        keycloak.onAuthError = undefined;
        keycloak.onAuthRefreshSuccess = undefined;
        keycloak.onAuthRefreshError = undefined;
        keycloak.onAuthLogout = undefined;
        keycloak.onTokenExpired = undefined;
      }
    };
  }, [keycloak]);

  const login = useCallback(async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:login - Standard Keycloak login initiated (redirect flow). Options:', options);
      setIsLoading(true);
      try {
        await keycloak.login(options);
      } catch (e) {
        console.error('[CLIENT] AuthProvider:login - keycloak.login() threw an error', e);
        setIsLoading(false);
      }
    } else {
      console.error('[CLIENT] AuthProvider:login - Keycloak instance not available.');
    }
  },[keycloak]);

  const logout = useCallback(async () => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:logout - Logout initiated.');
      setIsLoading(true); 
      try {
        // Clear any locally stored DAG tokens first, just in case.
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
        console.log('[CLIENT] AuthProvider:logout - Cleared potential DAG tokens from localStorage.');
        
        await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined });
        // onAuthLogout event handler should manage React state.
      } catch (e) {
        console.error('[CLIENT] AuthProvider:logout - keycloak.logout() threw an error. Manual state reset.', e);
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false); 
        if (typeof window !== 'undefined') {
          window.location.href = '/login?logoutFailed=true';
        }
      }
    } else {
      console.error('[CLIENT] AuthProvider:logout - Keycloak instance not available.');
    }
  }, [keycloak]);

  const register = useCallback(async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:register - Standard Keycloak registration initiated (redirect flow).');
      setIsLoading(true);
      try {
        await keycloak.register(options);
      } catch (e) {
        console.error('[CLIENT] AuthProvider:register - keycloak.register() threw an error', e);
        setIsLoading(false);
      }
    } else {
      console.error('[CLIENT] AuthProvider:register - Keycloak instance not available.');
    }
  }, [keycloak]);

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!keycloak || !keycloak.authenticated) {
      console.log('[CLIENT] AuthProvider:getToken - Not authenticated or keycloak not available.');
      return undefined;
    }
    try {
      const refreshed = await keycloak.updateToken(5); 
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed.');
      } else {
        console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (still valid or error during refresh).');
      }
    } catch (error) {
      console.error('[CLIENT] AuthProvider:getToken - Error updating token. Current session might be invalid.', error);
       // If token update fails critically, session might be invalid. Rely on onAuthRefreshError or onTokenExpired.
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

    