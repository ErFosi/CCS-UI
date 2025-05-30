
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import getKeycloakInstance, { type UserProfile } from '@/lib/keycloak';
import type Keycloak from 'keycloak-js';
import { logTokenOnServer } from '@/lib/server-actions/auth-actions';
import { getPreferenceApi, UserPreference } from '@/lib/apiClient';
import { useTheme } from '@/context/theme-context'; // Import useTheme

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
  if (typeof window !== 'undefined') {
    localStorage.removeItem('kc_access_token');
    localStorage.removeItem('kc_refresh_token');
    localStorage.removeItem('kc_id_token');
    localStorage.removeItem('kc_expires_in');
  }
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
      const storedAccessToken = typeof window !== 'undefined' ? localStorage.getItem('kc_access_token') : null;
      const storedRefreshToken = typeof window !== 'undefined' ? localStorage.getItem('kc_refresh_token') : null;
      const storedIdToken = typeof window !== 'undefined' ? localStorage.getItem('kc_id_token') : null;

      if (storedAccessToken && storedRefreshToken) {
        console.log("[CLIENT] AuthProvider:performInitialization - Found stored tokens from Direct Access Grant.");
        console.log(`[CLIENT] AuthProvider:performInitialization - Using Access Token (prefix): ${storedAccessToken.substring(0, 20)}...`);
        initOptions = {
          token: storedAccessToken,
          refreshToken: storedRefreshToken,
          idToken: storedIdToken ?? undefined,
          checkLoginIframe: false, // Crucial for DAG token init
        };
        console.log(`[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:`, {token: "...", refreshToken: "...", idToken: storedIdToken ? "..." : undefined, checkLoginIframe: false});
        
        authenticatedByInit = await kcInstance.init(initOptions);
        console.log(`[CLIENT] AuthProvider:performInitialization - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByInit}`);
        console.log(`[CLIENT] AuthProvider:performInitialization - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
        
        // Clear DAG tokens AFTER attempting to use them
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
            
            try {
              console.log('[CLIENT] AuthProvider:performInitialization - Fetching user preferences...');
              const preferences: UserPreference = await getPreferenceApi(kcInstance.token);
              console.log('[CLIENT] AuthProvider:performInitialization - User preferences received:', preferences);
              if (preferences && typeof preferences.darkTheme === 'boolean') {
                const newTheme = preferences.darkTheme ? 'dark' : 'light';
                console.log(`[CLIENT] AuthProvider:performInitialization - Applying theme from API preferences: ${newTheme} (darkTheme: ${preferences.darkTheme})`);
                setTheme(newTheme);
              } else {
                console.log('[CLIENT] AuthProvider:performInitialization - No darkTheme boolean preference found in API response.');
              }
            } catch (prefError) {
              console.error("[CLIENT] AuthProvider:performInitialization - Error fetching user preferences:", prefError);
              // Do not necessarily de-authenticate if preferences fail to load
            }
          }
        } catch (profileError) {
          console.error("[CLIENT] AuthProvider:performInitialization - Error loading user profile:", profileError);
          setIsAuthenticated(false); 
          setUser(null);
          if (kcInstance.token) kcInstance.clearToken(); 
          clearDagTokens(); // Clear any potentially problematic tokens
        }
      } else {
        console.log('[CLIENT] AuthProvider:performInitialization - User IS NOT effectively authenticated after this run.');
        setUser(null);
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
      clearDagTokens(); // Clear tokens on any init error
    } finally {
      setIsLoading(false);
      console.log(`[CLIENT] AuthProvider:performInitialization - Initialization process finished. isLoading: ${isLoading} isAuthenticated (state): ${isAuthenticated} keycloak.authenticated (instance): ${keycloak?.authenticated}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, setTheme]); // Added setTheme to dependencies

  // This useEffect handles the one-time Keycloak initialization.
  useEffect(() => {
    if (keycloak && !keycloakActualInitInvokedRef.current) {
      console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance available and init not yet invoked. Path: ${pathname}. Calling performInitialization.`);
      keycloakActualInitInvokedRef.current = true; // Set ref BEFORE calling async init
      performInitialization(keycloak);
    } else if (keycloak && keycloakActualInitInvokedRef.current) {
      // This block handles state synchronization if the effect re-runs due to pathname change
      // after Keycloak has already been initialized.
      console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Init already attempted for this Keycloak instance. Path: ${pathname}. Current kc.auth: ${keycloak.authenticated}. Syncing React state if needed.`);
      const currentAuthStatus = !!keycloak.authenticated;
      if (isAuthenticated !== currentAuthStatus) {
        setIsAuthenticated(currentAuthStatus);
        console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Synced isAuthenticated state to: ${currentAuthStatus} for path ${pathname}`);
      }
      if (currentAuthStatus && !user && keycloak.token) {
        console.log("[CLIENT] AuthProvider:useEffect[keycloak] - Authenticated but no user object, attempting to load profile.");
        keycloak.loadUserProfile()
          .then(profile => setUser(profile as UserProfile))
          .catch(() => {
            console.error("[CLIENT] AuthProvider:useEffect[keycloak] - Failed to load profile for already authenticated user. Clearing session.");
            setIsAuthenticated(false);
            setUser(null);
            if(keycloak.token) keycloak.clearToken();
            clearDagTokens();
          });
      } else if (!currentAuthStatus && user) {
        setUser(null);
        console.log("[CLIENT] AuthProvider:useEffect[keycloak] - Not authenticated but user object exists, clearing user.");
      }
      // If init was attempted, isLoading should reflect the outcome of performInitialization
      // performInitialization sets isLoading to false in its finally block.
      // If this effect runs and isLoading is still true, it means performInitialization might not have completed
      // or there's a state issue. For safety, ensure isLoading is false if init was attempted.
      if (isLoading && keycloakActualInitInvokedRef.current) {
        console.log("[CLIENT] AuthProvider:useEffect[keycloak] - Ensuring isLoading is false as init was already attempted.");
        setIsLoading(false);
      }
    }
  // Only re-run if keycloak instance changes or pathname changes.
  // performInitialization is wrapped in useCallback and changes if pathname or setTheme changes.
  }, [keycloak, performInitialization, pathname, isAuthenticated, user, isLoading]);


  // This useEffect handles setting up Keycloak event handlers.
  useEffect(() => {
    if (!keycloak) {
      console.log("[CLIENT] AuthProvider:useEffect[event handlers] - Keycloak instance not yet available. Skipping event handler setup.");
      return;
    }
    console.log("[CLIENT] AuthProvider:useEffect[event handlers] - Setting up Keycloak event handlers.");

    const onAuthSuccess = async () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthSuccess triggered. kc.authenticated:', keycloak.authenticated);
      setIsAuthenticated(!!keycloak.authenticated); // Update React state
      if (keycloak.authenticated) {
        try {
          const profile = await keycloak.loadUserProfile() as UserProfile;
          setUser(profile);
          console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - User profile loaded:', profile);
          if (keycloak.token) {
            logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error calling logTokenOnServer:", e));
            
            console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - Fetching user preferences...');
            const preferences: UserPreference = await getPreferenceApi(keycloak.token);
            console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - User preferences received:', preferences);
            if (preferences && typeof preferences.darkTheme === 'boolean') {
              const newTheme = preferences.darkTheme ? 'dark' : 'light';
              console.log(`[CLIENT] Keycloak EVENT: onAuthSuccess - Applying theme from API preferences: ${newTheme} (darkTheme: ${preferences.darkTheme})`);
              setTheme(newTheme);
            } else {
              console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - No darkTheme boolean preference found in API response.');
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
        setIsAuthenticated(false); // Ensure unauthenticated if kc.auth is false
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
       setIsAuthenticated(!!keycloak.authenticated); // Update React state
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
      setIsLoading(false); // Make sure loading state is updated on logout
    };

    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting token refresh...');
      keycloak.updateToken(30) // Minimum 30 seconds validity for new token
        .then(refreshed => {
          if (refreshed) {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token was refreshed successfully.');
            if (keycloak.token) logTokenOnServer(keycloak.token);
          } else {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token not refreshed (still valid or refresh not needed). kc.authenticated:', keycloak.authenticated);
            if (!keycloak.authenticated) { // If not refreshed and not authenticated, treat as logout
                setIsAuthenticated(false);
                setUser(null);
                clearDagTokens();
             }
          }
        })
        .catch(() => { 
          console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Token refresh failed. Logging out.");
          setIsAuthenticated(false);
          setUser(null);
          if (keycloak.token) keycloak.clearToken();
          clearDagTokens();
          setIsLoading(false);
      });
    };

    // Use the 'keycloak' state variable here
    if (keycloak) {
      keycloak.onAuthSuccess = onAuthSuccess;
      keycloak.onAuthError = onAuthError;
      keycloak.onAuthRefreshSuccess = onAuthRefreshSuccess;
      keycloak.onAuthRefreshError = onAuthRefreshError;
      keycloak.onAuthLogout = onAuthLogout;
      keycloak.onTokenExpired = onTokenExpired;
      console.log('[CLIENT] AuthProvider:useEffect[event handlers] - Keycloak event handlers successfully registered to keycloak instance.');
    }


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
  }, [keycloak, setTheme]); // Added setTheme to dependencies

  const login = useCallback(async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      const defaultOptions: Keycloak.KeycloakLoginOptions = {
        // redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/dashboard/my-videos` : undefined, 
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
      setIsLoading(true); // Set loading true before async operation
      clearDagTokens(); 
      await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined });
      // Note: after keycloak.logout(), the page will redirect, so setting isLoading to false here might not always be necessary
      // as the component might unmount. However, if the redirect is slow or fails, it's good practice.
      // Let Keycloak's onAuthLogout handler manage final state if redirect occurs.
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
      // Setting minValidity to 5 seconds. If token expires in less than 5s, it tries to refresh.
      const refreshed = await keycloak.updateToken(5); 
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed.');
        if (keycloak.token) logTokenOnServer(keycloak.token);
      } else {
        console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (still valid).');
      }
    } catch (error) {
      console.error('[CLIENT] AuthProvider:getToken - Error updating token. Session might be invalid. Clearing tokens.', error);
      setIsAuthenticated(false); // Assume session is now invalid
      setUser(null);
      clearDagTokens(); // Clear stored tokens
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

