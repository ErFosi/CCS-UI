
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
  const keycloakActualInitInvokedRef = useRef(false);
  const { setTheme } = useTheme(); // Get setTheme from ThemeContext


  // Effect to instantiate Keycloak.js client
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
          idToken: storedIdToken ?? undefined, // Pass idToken if present
          checkLoginIframe: false, // Recommended when initializing with tokens
          // pkceMethod is not typically needed here as we are not doing a code flow.
        };
        console.log(`[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:`, {token: "...", refreshToken: "...", idToken: storedIdToken ? "..." : undefined, checkLoginIframe: false});
        
        authenticatedByInit = await kcInstance.init(initOptions);
        console.log(`[CLIENT] AuthProvider:performInitialization - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByInit}`);
        console.log(`[CLIENT] AuthProvider:performInitialization - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
        
        // Clear localStorage tokens AFTER attempting to use them for init
        clearDagTokens();

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
        if (storedAccessToken) clearDagTokens(); 
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
  }, [pathname, setTheme]); // Added setTheme to dependencies

  // Effect to initialize Keycloak only once and handle path changes for re-sync
  useEffect(() => {
    console.log(`[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Path: ${pathname}. kc.auth before performInitialization: ${keycloak?.authenticated}, actualInitInvokedRef: ${keycloakActualInitInvokedRef.current}`);
    if (keycloak && !keycloakActualInitInvokedRef.current) {
      console.log("[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Keycloak instance available and init not yet invoked. Calling performInitialization.");
      keycloakActualInitInvokedRef.current = true; // Set flag before calling init
      performInitialization(keycloak);
    } else if (keycloak && keycloakActualInitInvokedRef.current) {
      console.log(`[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Init already attempted or in progress. Current kc.auth: ${keycloak.authenticated}. Syncing React state if needed.`);
      // If init was already done, just sync React state with Keycloak instance state
      const currentAuthStatus = !!keycloak.authenticated;
      if (isAuthenticated !== currentAuthStatus) {
        setIsAuthenticated(currentAuthStatus);
        console.log(`[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Synced isAuthenticated state to: ${currentAuthStatus}`);
      }
      if (currentAuthStatus && !user && keycloak.token) {
        console.log("[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Authenticated but no user object, attempting to load profile.");
        keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile)).catch(() => {
          console.error("[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Failed to load profile for already authenticated user.");
          setUser(null);
          setIsAuthenticated(false);
          if(keycloak.token) keycloak.clearToken();
          clearDagTokens();
        });
      } else if (!currentAuthStatus && user) {
        setUser(null);
         console.log("[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Not authenticated but user object exists, clearing user.");
      }
      // Ensure isLoading is false if init was already attempted and we are just re-syncing
      if (isLoading) setIsLoading(false);
    }
  }, [keycloak, pathname, performInitialization, isAuthenticated, user, isLoading]); // Added isAuthenticated, user, isLoading to ensure re-sync logic runs if these external states change


  // Effect to set up Keycloak event handlers
  useEffect(() => {
    if (!keycloak) {
      console.log("[CLIENT] AuthProvider:useEffect[keycloak event handlers] - Keycloak instance not yet available. Skipping event handler setup.");
      return;
    }

    console.log("[CLIENT] AuthProvider:useEffect[keycloak event handlers] - Setting up Keycloak event handlers.");

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
            // Fetch preferences on auth success as well
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
          setUser(null);
          setIsAuthenticated(false);
          if(keycloak.token) keycloak.clearToken();
          clearDagTokens();
        }
      } else {
        setUser(null);
        setIsAuthenticated(false); // Ensure consistent state
      }
      setIsLoading(false);
    };

    const onAuthError = (errorData?: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered.", errorData);
      if (errorData) {
        console.error(`Error: ${errorData.error}, Description: ${errorData.error_description}`);
      }
      setIsAuthenticated(false);
      setUser(null);
      clearDagTokens();
      setIsLoading(false);
    };

    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered.');
       setIsAuthenticated(!!keycloak.authenticated); // Re-affirm auth state
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
      setIsLoading(false); // Ensure loading is false on logout
    };

    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting token refresh...');
      keycloak.updateToken(30) // Attempt to refresh if token expires in <30s
        .then(refreshed => {
          if (refreshed) {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token was refreshed successfully.');
            if (keycloak.token) {
                logTokenOnServer(keycloak.token);
            }
          } else {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token not refreshed (still valid or refresh not needed). kc.authenticated:', keycloak.authenticated);
             // If not refreshed and not authenticated, it implies a real expiry/problem
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
          setIsLoading(false); // Stop loading on failure
      });
    };

    // Use 'keycloak' from state, not 'kcInstance' from a different scope
    keycloak.onAuthSuccess = onAuthSuccess;
    keycloak.onAuthError = onAuthError;
    keycloak.onAuthRefreshSuccess = onAuthRefreshSuccess;
    keycloak.onAuthRefreshError = onAuthRefreshError;
    keycloak.onAuthLogout = onAuthLogout;
    keycloak.onTokenExpired = onTokenExpired;
    console.log('[CLIENT] AuthProvider:useEffect[keycloak event handlers] - Keycloak event handlers successfully registered.');

    // Cleanup function to remove handlers if Keycloak instance changes or component unmounts
    // Though typically Keycloak instance doesn't change.
    return () => {
        console.log("[CLIENT] AuthProvider:useEffect[keycloak event handlers] - Cleaning up Keycloak event handlers (if keycloak instance existed).");
        if (keycloak) { // Check if keycloak instance was set before trying to clear handlers
            keycloak.onAuthSuccess = undefined;
            keycloak.onAuthError = undefined;
            keycloak.onAuthRefreshSuccess = undefined;
            keycloak.onAuthRefreshError = undefined;
            keycloak.onAuthLogout = undefined;
            keycloak.onTokenExpired = undefined;
        }
    };
  }, [keycloak, setTheme]); // Ensure setTheme is in dependencies because onAuthSuccess uses it


  const login = useCallback(async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      const defaultOptions: Keycloak.KeycloakLoginOptions = {
        redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/dashboard/my-videos` : undefined, 
        ...options,
      };
      console.log('[CLIENT] AuthProvider:login - Standard Keycloak login initiated. Options:', defaultOptions);
      setIsLoading(true);
      try {
        await keycloak.login(defaultOptions);
        // Redirect happens, so code after this might not execute immediately in this context
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
        // Redirect happens
      } catch (e) {
        console.error('[CLIENT] AuthProvider:logout - keycloak.logout() threw an error. Manual state reset.', e);
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false); 
        clearDagTokens(); 
        if (typeof window !== 'undefined') {
          // Force redirect if Keycloak's logout didn't
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
        // Redirect to Keycloak's registration page happens
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
      // Attempt to update token, force refresh if it's expiring within 5 seconds
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
      setIsAuthenticated(false); // Session is likely invalid
      setUser(null);
      clearDagTokens(); // Clear any stored tokens
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
