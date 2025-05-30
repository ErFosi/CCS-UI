
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
  const { setTheme } = useTheme();

  useEffect(() => {
    console.log('[CLIENT] AuthProvider:useEffect[] - Getting Keycloak instance.');
    const kc = getKeycloakInstance();
    if (kc) {
      setKeycloak(kc);
    } else {
      console.error('[CLIENT] AuthProvider:useEffect[] - Failed to get Keycloak instance!');
      setIsLoading(false);
    }
  }, []);

  const performInitialization = useCallback(async (kcInstance: Keycloak) => {
    console.log(`[CLIENT] AuthProvider:performInitialization - Starting for path: ${pathname}`);
    setIsLoading(true); // Set loading true at the start of initialization attempt

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
          checkLoginIframe: false, // Crucial for this flow
        };
        console.log(`[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:`, {token: "...", refreshToken: "...", idToken: storedIdToken ? "..." : undefined, checkLoginIframe: false});
        
        authenticatedByInit = await kcInstance.init(initOptions);
        console.log(`[CLIENT] AuthProvider:performInitialization - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByInit}`);
        console.log(`[CLIENT] AuthProvider:performInitialization - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
        
        clearDagTokens(); // Clear tokens after attempting to use them

        if (!kcInstance.authenticated) {
            console.warn("[CLIENT] AuthProvider:performInitialization - Init with stored tokens did NOT result in authenticated state.");
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
      setIsAuthenticated(currentAuthStatus); // Update React state
      console.log(`[CLIENT] AuthProvider:performInitialization - isAuthenticated state set to: ${currentAuthStatus}`);

      if (currentAuthStatus) {
        console.log('[CLIENT] AuthProvider:performInitialization - User IS authenticated. Attempting to load user profile...');
        try {
          const profile = await kcInstance.loadUserProfile() as UserProfile;
          setUser(profile);
          console.log('[CLIENT] AuthProvider:performInitialization - User profile loaded:', profile);
          if (kcInstance.token) {
            logTokenOnServer(kcInstance.token).catch(e => console.error("[CLIENT] AuthProvider:performInitialization - Error in logTokenOnServer (after profile):", e));
            
            try {
              console.log('[CLIENT] AuthProvider:performInitialization - Fetching user preferences...');
              const preferences = await getPreferenceApi(kcInstance.token);
              console.log('[CLIENT] AuthProvider:performInitialization - User preferences received:', preferences);
              if (preferences && preferences.theme) {
                console.log(`[CLIENT] AuthProvider:performInitialization - Applying theme from preferences: ${preferences.theme}`);
                setTheme(preferences.theme);
              } else {
                console.log('[CLIENT] AuthProvider:performInitialization - No theme preference found in API response.');
              }
            } catch (prefError) {
              console.error("[CLIENT] AuthProvider:performInitialization - Error fetching user preferences:", prefError);
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
        // if (storedAccessToken) clearDagTokens(); // Already cleared above if tokens were present
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
      console.log(`[CLIENT] AuthProvider:performInitialization - Initialization process finished. isLoading: ${isLoading} isAuthenticated (state): ${isAuthenticated} keycloak.authenticated (instance): ${keycloak?.authenticated}`);
    }
  }, [pathname, setTheme]); // Added setTheme

  useEffect(() => {
    if (keycloak && !keycloakActualInitInvokedRef.current) {
      console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance available and init not yet invoked. Path: ${pathname}. Calling performInitialization.`);
      keycloakActualInitInvokedRef.current = true; // Set flag BEFORE calling init
      performInitialization(keycloak);
    } else if (keycloak && keycloakActualInitInvokedRef.current) {
      // This block handles route changes after initial init was already attempted.
      // We mainly want to ensure isLoading is false and sync React state if needed.
      console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Init already attempted or in progress. Path: ${pathname}. Current kc.auth: ${keycloak.authenticated}. Syncing React state if needed.`);
      const currentAuthStatus = !!keycloak.authenticated;
      if (isAuthenticated !== currentAuthStatus) {
        setIsAuthenticated(currentAuthStatus);
        console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Synced isAuthenticated state to: ${currentAuthStatus} for path ${pathname}`);
      }
      if (currentAuthStatus && !user && keycloak.token) {
        console.log("[CLIENT] AuthProvider:useEffect[keycloak] - Authenticated but no user object, attempting to load profile.");
        keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile)).catch(() => {
          console.error("[CLIENT] AuthProvider:useEffect[keycloak] - Failed to load profile for already authenticated user.");
          setIsAuthenticated(false); // Revert if profile load fails
          setUser(null);
          if(keycloak.token) keycloak.clearToken();
          clearDagTokens();
        });
      } else if (!currentAuthStatus && user) {
        setUser(null);
        console.log("[CLIENT] AuthProvider:useEffect[keycloak] - Not authenticated but user object exists, clearing user.");
      }
      if (isLoading) { // Ensure loading is false if init was already attempted
        setIsLoading(false);
        console.log("[CLIENT] AuthProvider:useEffect[keycloak] - Setting isLoading to false as init was already attempted.");
      }
    }
  }, [keycloak, pathname, performInitialization, isAuthenticated, user, isLoading]); // Added isAuthenticated, user, isLoading

  useEffect(() => {
    if (!keycloak) {
      console.log("[CLIENT] AuthProvider:useEffect[event handlers] - Keycloak instance not yet available. Skipping event handler setup.");
      return;
    }
    console.log("[CLIENT] AuthProvider:useEffect[event handlers] - Setting up Keycloak event handlers.");

    const onAuthSuccess = async () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthSuccess triggered. kc.authenticated:', keycloak.authenticated);
      setIsAuthenticated(!!keycloak.authenticated);
      if (keycloak.authenticated) {
        try {
          const profile = await keycloak.loadUserProfile() as UserProfile;
          setUser(profile);
          console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - User profile loaded:', profile);
          if (keycloak.token) {
            logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error calling logTokenOnServer:", e));
            console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - Fetching user preferences...');
            const preferences = await getPreferenceApi(keycloak.token);
            console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - User preferences received:', preferences);
            if (preferences && preferences.theme) {
              console.log(`[CLIENT] Keycloak EVENT: onAuthSuccess - Applying theme from preferences: ${preferences.theme}`);
              setTheme(preferences.theme);
            } else {
              console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - No theme preference found in API response.');
            }
          }
        } catch (err) {
          console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile or preferences:", err);
          setIsAuthenticated(false); 
          setUser(null);
          if(keycloak.token) keycloak.clearToken();
          clearDagTokens();
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setIsLoading(false); // Ensure loading is false after auth success
    };

    const onAuthError = (errorData?: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered.", errorData);
      if (errorData) console.error(`Error: ${errorData.error}, Description: ${errorData.error_description}`);
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
      setIsLoading(false);
    };

    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting token refresh...');
      keycloak.updateToken(30)
        .then(refreshed => {
          if (refreshed) {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token was refreshed successfully.');
            if (keycloak.token) logTokenOnServer(keycloak.token);
          } else {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token not refreshed (still valid or refresh not needed). kc.authenticated:', keycloak.authenticated);
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

    keycloak.onAuthSuccess = onAuthSuccess;
    keycloak.onAuthError = onAuthError;
    keycloak.onAuthRefreshSuccess = onAuthRefreshSuccess;
    keycloak.onAuthRefreshError = onAuthRefreshError;
    keycloak.onAuthLogout = onAuthLogout;
    keycloak.onTokenExpired = onTokenExpired;
    console.log('[CLIENT] AuthProvider:useEffect[event handlers] - Keycloak event handlers successfully registered.');

    return () => {
        console.log("[CLIENT] AuthProvider:useEffect[event handlers] - Cleaning up Keycloak event handlers.");
        if (keycloak) {
            keycloak.onAuthSuccess = undefined;
            keycloak.onAuthError = undefined;
            keycloak.onAuthRefreshSuccess = undefined;
            keycloak.onAuthRefreshError = undefined;
            keycloak.onAuthLogout = undefined;
            keycloak.onTokenExpired = undefined;
        }
    };
  }, [keycloak, setTheme]); // Added setTheme

  const login = useCallback(async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      const defaultOptions: Keycloak.KeycloakLoginOptions = {
        redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/dashboard/my-videos` : undefined, 
        ...options,
      };
      console.log('[CLIENT] AuthProvider:login - Standard Keycloak login initiated. Options:', defaultOptions);
      setIsLoading(true);
      await keycloak.login(defaultOptions);
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
      await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined });
    } else {
      console.error('[CLIENT] AuthProvider:logout - Keycloak instance not available.');
      setIsLoading(false);
    }
  }, [keycloak]);

  const register = useCallback(async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:register - Standard Keycloak registration initiated. Options:', options);
      setIsLoading(true);
      await keycloak.register(options);
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
        if (keycloak.token) logTokenOnServer(keycloak.token);
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

    