
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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
  const [isKeycloakInitialized, setIsKeycloakInitialized] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    console.log('[CLIENT] AuthProvider:useEffect[] - Setting Keycloak instance from getKeycloakInstance()');
    const kcInstance = getKeycloakInstance();
    if (kcInstance) {
      console.log('[CLIENT] AuthProvider:useEffect[] - Keycloak instance obtained:', kcInstance);
      setKeycloak(kcInstance);
    } else {
      console.error('[CLIENT] AuthProvider:useEffect[] - Failed to get Keycloak instance!');
    }
  }, []);

  const initializeKeycloak = useCallback(async () => {
    if (!keycloak) {
      console.log('[CLIENT] AuthProvider:initializeKeycloak - Keycloak instance not yet available. Waiting.');
      setIsLoading(true);
      return;
    }
    if (isKeycloakInitialized) {
      console.log('[CLIENT] AuthProvider:initializeKeycloak - Keycloak already initialized. Skipping.');
      setIsLoading(false);
      return;
    }

    console.log('[CLIENT] AuthProvider:initializeKeycloak - Starting initialization process for path:', pathname);
    setIsLoading(true);

    try {
      let initOptions: Keycloak.KeycloakInitOptions;
      const storedAccessToken = localStorage.getItem('kc_access_token');
      const storedRefreshToken = localStorage.getItem('kc_refresh_token');
      const storedIdToken = localStorage.getItem('kc_id_token');

      if (storedAccessToken && storedRefreshToken && storedIdToken) {
        console.log('[CLIENT] AuthProvider:initializeKeycloak - Found stored tokens from Direct Access Grant. Initializing Keycloak with these tokens.');
        console.log('[CLIENT] AuthProvider:initializeKeycloak - Stored Access Token (prefix):', storedAccessToken.substring(0,20) + "...");
        initOptions = {
          pkceMethod: 'S256', // Keep PKCE method for general good practice
          token: storedAccessToken,
          refreshToken: storedRefreshToken,
          idToken: storedIdToken,
          // DO NOT use onLoad: 'check-sso' when explicitly providing tokens.
        };
        console.log('[CLIENT] AuthProvider:initializeKeycloak - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:', JSON.stringify(initOptions));
        const authenticatedWithTokens = await keycloak.init(initOptions);
        console.log('[CLIENT] AuthProvider:initializeKeycloak - keycloak.init() with PRE-OBTAINED TOKENS returned:', authenticatedWithTokens);
        console.log('[CLIENT] AuthProvider:initializeKeycloak - After init with tokens, keycloak.authenticated is:', keycloak.authenticated);
        console.log('[CLIENT] AuthProvider:initializeKeycloak - After init with tokens, keycloak.token (prefix):', keycloak.token ? keycloak.token.substring(0, 20) + '...' : 'undefined');
        
        setIsKeycloakInitialized(true); // Mark as initialized here

        if (keycloak.authenticated) {
          console.log('[CLIENT] AuthProvider:initializeKeycloak - User IS authenticated after init with tokens. Setting isAuthenticated true.');
          setIsAuthenticated(true);
          console.log('[CLIENT] AuthProvider:initializeKeycloak - Attempting to load user profile...');
          try {
            const profile = await keycloak.loadUserProfile() as UserProfile;
            setUser(profile);
            console.log('[CLIENT] AuthProvider:initializeKeycloak - User profile loaded successfully:', profile);
          } catch (profileError) {
            console.error("[CLIENT] AuthProvider:initializeKeycloak - Error loading user profile even after successful init with tokens:", profileError);
            // Potentially logout or clear auth state if profile load is critical
            setIsAuthenticated(false); 
            setUser(null);
            keycloak.clearToken(); // Clear Keycloak's internal token state
          }
        } else {
          console.log('[CLIENT] AuthProvider:initializeKeycloak - User IS NOT authenticated after init with tokens, despite tokens being provided. This might indicate an issue with the tokens or Keycloak configuration.');
          setIsAuthenticated(false);
          setUser(null);
        }
        // Clear tokens from localStorage after attempting to use them, regardless of outcome, to prevent reuse of potentially problematic tokens.
        console.log('[CLIENT] AuthProvider:initializeKeycloak - Clearing DAG tokens from localStorage after init attempt.');
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');

      } else {
        console.log('[CLIENT] AuthProvider:initializeKeycloak - No stored DAG tokens found. Using default init options (check-sso).');
        initOptions = {
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
          pkceMethod: 'S256',
        };
        console.log('[CLIENT] AuthProvider:initializeKeycloak - Calling keycloak.init() with standard options:', JSON.stringify(initOptions));
        const authenticated = await keycloak.init(initOptions);
        console.log('[CLIENT] AuthProvider:initializeKeycloak - Keycloak init (standard) success. Authenticated flag from init:', authenticated);
        setIsKeycloakInitialized(true); // Mark as initialized here
        setIsAuthenticated(authenticated);
        console.log('[CLIENT] AuthProvider:initializeKeycloak - isAuthenticated state set to (standard init):', authenticated);

        if (authenticated) {
          console.log('[CLIENT] AuthProvider:initializeKeycloak - User is authenticated (standard init). Loading profile...');
          const profile = await keycloak.loadUserProfile() as UserProfile;
          setUser(profile);
          console.log('[CLIENT] AuthProvider:initializeKeycloak - User profile loaded (standard init):', profile);
        } else {
          console.log('[CLIENT] AuthProvider:initializeKeycloak - User is NOT authenticated (standard init).');
          setUser(null);
        }
      }
    } catch (error: any) {
      console.error("[CLIENT] AuthProvider:initializeKeycloak - Keycloak init() caught an error. Raw error object:", error);
      let errorMessage = "Keycloak initialization failed.";
      let errorDetailsString = "Could not serialize error object.";

      if (error && typeof error === 'object') {
          try { errorDetailsString = JSON.stringify(error, Object.getOwnPropertyNames(error)); }
          catch (e) { /* ignore */ }
          console.error("[CLIENT] AuthProvider:initializeKeycloak - Keycloak init error (raw object serialized to JSON):", errorDetailsString);

          if (error.message) { errorMessage += ` Details: ${error.message}`; }
          else if (error.error_description) { errorMessage += ` Details: ${error.error_description}`; }
          else if (error.error) { errorMessage += ` Error type: ${error.error}`; }
          else { errorMessage += " No standard 'message', 'error_description', or 'error' property found. Check browser Network tab and Keycloak server logs.";}
      } else if (typeof error === 'string' && error) {
          errorMessage += ` Details: ${error}`;
      }
      
      console.error("[CLIENT] AuthProvider:initializeKeycloak - Keycloak init error details (summary):", errorMessage);
      setIsKeycloakInitialized(true);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log('[CLIENT] AuthProvider:initializeKeycloak - Initialization process finished. isLoading:', false, 'isAuthenticated (state):', isAuthenticated, 'keycloak.authenticated (instance):', keycloak?.authenticated, 'isKeycloakInitialized (flag):', isKeycloakInitialized);
    }
  }, [keycloak, pathname, isKeycloakInitialized, isAuthenticated]); // Added isAuthenticated to dep array

  useEffect(() => {
    console.log(`[CLIENT] AuthProvider:useEffect[keycloak, isKeycloakInitialized, pathname] - Keycloak ready: ${!!keycloak}, Initialized: ${isKeycloakInitialized}, Path: ${pathname}`);
    if (keycloak && !isKeycloakInitialized) {
        console.log("[CLIENT] AuthProvider:useEffect[keycloak, isKeycloakInitialized, pathname] - Keycloak instance available and not yet initialized. Triggering initializeKeycloak.");
        initializeKeycloak();
    } else if (!keycloak && !isLoading) { // If keycloak is not set and we are not already loading, set loading.
        console.log("[CLIENT] AuthProvider:useEffect[keycloak, isKeycloakInitialized, pathname] - Waiting for keycloak instance to be set before initializing. Setting isLoading to true.");
        setIsLoading(true);
    } else if (keycloak && isKeycloakInitialized) {
        console.log("[CLIENT] AuthProvider:useEffect[keycloak, isKeycloakInitialized, pathname] - Keycloak instance available and already initialized. Ensuring isLoading is false.");
        if (isLoading) setIsLoading(false); // Ensure loading is false if already initialized
    }
  }, [keycloak, initializeKeycloak, isKeycloakInitialized, pathname, isLoading]);

  useEffect(() => {
    console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak?.token] - isAuthenticated: ${isAuthenticated}, keycloak?.token available: ${!!keycloak?.token}`);
    if (isAuthenticated && keycloak && keycloak.token) {
      console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - User is authenticated and token IS available.`);
      console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - Token (prefix): ${keycloak.token.substring(0, 20)}...`);
      console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - Attempting to call logTokenOnServer...`);
      logTokenOnServer(keycloak.token)
        .then(() => {
          console.log('[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - logTokenOnServer Server Action was invoked successfully from client.');
        })
        .catch(error => {
          console.error('[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - Error calling logTokenOnServer Server Action:', error);
        });
    } else if (isAuthenticated && keycloak && !keycloak.token) {
        console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - User is authenticated BUT token is NOT available at this moment.`);
    }
  }, [isAuthenticated, keycloak?.token, keycloak]);

  useEffect(() => {
    if (!keycloak) return;

    const onAuthSuccess = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthSuccess triggered. keycloak.authenticated:', keycloak.authenticated);
      setIsAuthenticated(!!keycloak.authenticated);
      if (keycloak.authenticated) {
        keycloak.loadUserProfile().then(profile => {
          setUser(profile as UserProfile);
          console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - User profile loaded:', profile as UserProfile);
        }).catch(err => console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile:", err));
      } else {
        setUser(null);
      }
    };
    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered. Error data:", errorData);
      setIsAuthenticated(false);
      setUser(null);
    };
    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered.');
    };
    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError - Failed to refresh token. Forcing logout.");
      setIsAuthenticated(false);
      setUser(null);
      // Consider clearing tokens and re-initializing or redirecting to login
      keycloak.clearToken();
      setIsKeycloakInitialized(false); // Allow re-init on next opportunity
      router.push('/login?sessionExpired=true');
    };
    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered.');
      setIsAuthenticated(false);
      setUser(null);
      localStorage.removeItem('kc_access_token');
      localStorage.removeItem('kc_refresh_token');
      localStorage.removeItem('kc_id_token');
      localStorage.removeItem('kc_expires_in');
      setIsKeycloakInitialized(false);
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout - States reset, DAG tokens cleared from localStorage, isKeycloakInitialized set to false.');
    };
    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting to update token...');
      keycloak.updateToken(30).catch(() => {
        console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Failed to update token after expiry. Forcing logout.");
        // Forcing logout by redirecting, Keycloak's logout might be more graceful if server is reachable
        setIsAuthenticated(false);
        setUser(null);
        keycloak.clearToken();
        setIsKeycloakInitialized(false);
        router.push('/login?sessionExpired=true&reason=tokenUpdateFailed');
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
      console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Cleaning up Keycloak event handlers.');
      if (keycloak) {
        keycloak.onAuthSuccess = null;
        keycloak.onAuthError = null;
        // ... nullify other handlers
      }
    };
  }, [keycloak, router]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:login - Login attempt initiated with standard Keycloak login (redirect flow).');
      setIsLoading(true);
      try {
        // setIsKeycloakInitialized(false); // This might not be needed if Keycloak handles post-redirect init correctly
        await keycloak.login(options);
      } catch (error) {
        console.error("[CLIENT] AuthProvider:login - Keycloak login method error:", error);
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false);
      }
    } else {
       console.error("[CLIENT] AuthProvider:login - Keycloak instance not available to login.");
    }
  };

  const logout = async () => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:logout - Logout attempt initiated.');
      setIsLoading(true);
      try {
        const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
        await keycloak.logout({ redirectUri });
      } catch (error) {
        console.error("[CLIENT] AuthProvider:logout - Keycloak logout error:", error);
        setIsLoading(false);
      }
    } else {
      console.error("[CLIENT] AuthProvider:logout - Keycloak instance not available to logout.");
    }
  };

  const register = async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:register - Register attempt initiated.');
      setIsLoading(true);
      try {
        // setIsKeycloakInitialized(false);
        await keycloak.register(options);
      } catch (error) {
        console.error("[CLIENT] AuthProvider:register - Keycloak register error:", error);
        setIsLoading(false);
      }
    } else {
      console.error("[CLIENT] AuthProvider:register - Keycloak instance not available to register.");
    }
  };

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!keycloak) {
      console.warn("[CLIENT] AuthProvider:getToken - Keycloak instance not available.");
      return undefined;
    }
    if (!keycloak.authenticated) {
      console.warn("[CLIENT] AuthProvider:getToken - User not authenticated, token not requested.");
      return undefined;
    }
    try {
      // Update token if it's expired or will expire in less than 5 seconds
      const refreshed = await keycloak.updateToken(5);
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed successfully.');
      } else {
        console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (either still valid or refresh failed, or not needed).');
      }
    } catch (error) {
      console.warn("[CLIENT] AuthProvider:getToken - Failed to refresh token during getToken:", error);
      // Potentially logout or handle error
      setIsAuthenticated(false);
      setUser(null);
      router.push('/login?sessionExpired=true&reason=getTokenUpdateFailed');
      return undefined;
    }
    
    if (!keycloak.token) {
      console.warn("[CLIENT] AuthProvider:getToken - Token is still not available after potential refresh.");
      return undefined;
    }
    
    console.log(`[CLIENT] AuthProvider:getToken - Returning token (prefix): ${keycloak.token.substring(0, 20)}...`);
    return keycloak.token;
  }, [keycloak, router]);

  console.log(`[CLIENT] AuthProvider RENDER - isLoading: ${isLoading}, isAuthenticated: ${isAuthenticated}, user: ${user?.username}, keycloak set: ${!!keycloak}, initialized: ${isKeycloakInitialized}`);

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

    