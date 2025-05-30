
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import getKeycloakInstance, { type UserProfile } from '@/lib/keycloak';
import type Keycloak from 'keycloak-js';
import { logTokenOnServer } from '@/lib/server-actions/auth-actions';
import { getPreferenceApi } from '@/lib/apiClient'; // Import new API client function
import { useTheme } from '@/context/theme-context'; // Import useTheme to set theme

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
  const keycloakActualInitInvokedRef = useRef(false); // Tracks if kc.init() has been called

  const { setTheme } = useTheme(); // Get setTheme from ThemeContext

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
          checkLoginIframe: false, // Recommended when initializing with tokens
          // pkceMethod: 'S256', // Generally not needed if tokens are already obtained
        };
        console.log(`[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:`, {token: "...", refreshToken: "...", idToken: storedIdToken ? "..." : undefined, checkLoginIframe: false});
        
        authenticatedByInit = await kcInstance.init(initOptions);
        console.log(`[CLIENT] AuthProvider:performInitialization - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByInit}`);
        console.log(`[CLIENT] AuthProvider:performInitialization - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
        
        clearDagTokens(); // Clear localStorage tokens after attempting to use them for init

        if (!kcInstance.authenticated) {
            console.warn("[CLIENT] AuthProvider:performInitialization - Init with stored tokens did NOT result in authenticated state.");
            // No need to clear tokens again, already done. Fall through to set unauthenticated state.
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
            
            // Fetch and apply user preferences
            try {
              console.log('[CLIENT] AuthProvider:performInitialization - Fetching user preferences...');
              const preferences = await getPreferenceApi(kcInstance.token);
              console.log('[CLIENT] AuthProvider:performInitialization - User preferences received:', preferences);
              if (preferences && preferences.theme) {
                console.log(`[CLIENT] AuthProvider:performInitialization - Applying theme from preferences: ${preferences.theme}`);
                setTheme(preferences.theme); // setTheme from useTheme()
              } else {
                console.log('[CLIENT] AuthProvider:performInitialization - No theme preference found in API response.');
              }
            } catch (prefError) {
              console.error("[CLIENT] AuthProvider:performInitialization - Error fetching user preferences:", prefError);
              // Decide if this is critical. For now, just log it.
              // Theme will remain as loaded from localStorage or system preference.
            }

          }
        } catch (profileError) {
          console.error("[CLIENT] AuthProvider:performInitialization - Error loading user profile:", profileError);
          setIsAuthenticated(false); 
          setUser(null);
          if (kcInstance.token) kcInstance.clearToken(); 
          clearDagTokens(); 
        }
      } else {
        console.log('[CLIENT] AuthProvider:performInitialization - User IS NOT effectively authenticated after this run.');
        setUser(null);
        // If init was standard and failed, or with tokens and failed ensure tokens are cleared.
        if (storedAccessToken) clearDagTokens(); // Double ensure if path taken for stored tokens failed.
      }
    } catch (error: any) {
      console.error("[CLIENT] AuthProvider:performInitialization - Outer catch block error during Keycloak initialization.", error);
      if (error.message) console.error("Error message:", error.message);
      if (error.stack) console.error("Error stack:", error.stack);
      if (error.error && error.error_description) {
        console.error(`Keycloak error: ${error.error}, Description: ${error.error_description}`);
      }
      setIsAuthenticated(false);
      setUser(null);
      clearDagTokens(); 
    } finally {
      setIsLoading(false);
      console.log(`[CLIENT] AuthProvider:performInitialization - Initialization process finished. isLoading: ${isLoading} isAuthenticated (state): ${isAuthenticated} keycloak.authenticated (instance): ${kcInstance?.authenticated}`);
    }
  }, [pathname, setTheme]); // Added setTheme to dependencies of useCallback

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
          setIsAuthenticated(false);
          if(keycloak.token) keycloak.clearToken();
          clearDagTokens();
        });
      } else if (!currentAuthStatus && user) {
        setUser(null);
      }
      // Ensure isLoading is false if init was already attempted and we are just re-syncing
      if (isLoading) setIsLoading(false); 
    }
  }, [keycloak, performInitialization, isAuthenticated, user, isLoading]);

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
             // Fetch preferences on auth success as well
             getPreferenceApi(keycloak.token)
                .then(prefs => {
                    if (prefs && prefs.theme) setTheme(prefs.theme);
                })
                .catch(err => console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error fetching preferences:", err));
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
        setIsAuthenticated(false);
      }
      setIsLoading(false); 
    };

    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered.", errorData);
      if (errorData) { // errorData might be null/undefined in some scenarios
        console.error(`Error: ${errorData.error}, Description: ${errorData.error_description}`);
      }
      setIsAuthenticated(false); 
      setUser(null);
      clearDagTokens();
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
      clearDagTokens();
      setIsLoading(false);
    };

    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered. Stack trace:', new Error().stack);
      setIsAuthenticated(false); 
      setUser(null);
      clearDagTokens();
      console.log("[CLIENT] Keycloak EVENT: onAuthLogout - Cleared DAG tokens from localStorage.");
      setIsLoading(false);
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
                clearDagTokens();
             }
          }
        })
        .catch(() => { 
          console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Token refresh failed.");
          setIsAuthenticated(false);
          setUser(null);
          if (keycloak.token) keycloak.clearToken();
          clearDagTokens();
          setIsLoading(false);
      });
    };

    kcInstance.onAuthSuccess = onAuthSuccess;
    kcInstance.onAuthError = onAuthError;
    kcInstance.onAuthRefreshSuccess = onAuthRefreshSuccess;
    kcInstance.onAuthRefreshError = onAuthRefreshError;
    kcInstance.onAuthLogout = onAuthLogout;
    kcInstance.onTokenExpired = onTokenExpired;
    console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak event handlers registered.');

  }, [keycloak, setTheme]); // Added setTheme to dependencies of this useEffect


  const login = useCallback(async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      const defaultOptions: Keycloak.KeycloakLoginOptions = {
        // redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/dashboard/my-videos` : undefined, // Example
        ...options,
      };
      console.log('[CLIENT] AuthProvider:login - Standard Keycloak login initiated. Options:', defaultOptions);
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
      clearDagTokens(); 
      try {
        await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined });
      } catch (e) {
        console.error('[CLIENT] AuthProvider:logout - keycloak.logout() threw an error. Manual state reset.', e);
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false); 
        clearDagTokens(); 
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
      console.log('[CLIENT] AuthProvider:register - Standard Keycloak registration initiated. Options:', options);
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
      const refreshed = await keycloak.updateToken(5); 
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed.');
        if (keycloak.token) {
           logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] AuthProvider:getToken - Error calling logTokenOnServer (after refresh):", e));
        }
      } else {
        // console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (still valid or refresh not needed).');
      }
    } catch (error) {
      console.error('[CLIENT] AuthProvider:getToken - Error updating token. Session might be invalid.', error);
      setIsAuthenticated(false); 
      setUser(null);
      clearDagTokens(); 
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
