
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
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    console.log('[CLIENT] AuthProvider:useEffect[] - Setting Keycloak instance from getKeycloakInstance()');
    const kcInstance = getKeycloakInstance();
    if (kcInstance) {
      console.log('[CLIENT] AuthProvider:useEffect[] - Keycloak instance obtained.');
      setKeycloak(kcInstance);
    } else {
      console.error('[CLIENT] AuthProvider:useEffect[] - Failed to get Keycloak instance!');
      setIsLoading(false); 
    }
  }, []);

  const initSessionAsync = useCallback(async (kcInstance: Keycloak) => {
    console.log('[CLIENT] AuthProvider:initSessionAsync - Starting session initialization for path:', pathname);
    setIsLoading(true);

    try {
      const storedAccessToken = localStorage.getItem('kc_access_token');
      const storedRefreshToken = localStorage.getItem('kc_refresh_token');
      const storedIdToken = localStorage.getItem('kc_id_token');

      let authenticatedByInit = false;

      if (storedAccessToken && storedRefreshToken && storedIdToken) {
        console.log('[CLIENT] AuthProvider:initSessionAsync - Found stored tokens from Direct Access Grant.');
        console.log('[CLIENT] AuthProvider:initSessionAsync - Stored Access Token (prefix):', storedAccessToken.substring(0, 20) + "...");
        // console.log('[CLIENT] AuthProvider:initSessionAsync - Full Stored Access Token:', storedAccessToken); // Uncomment for deep debug
        console.log('[CLIENT] AuthProvider:initSessionAsync - Stored Refresh Token (prefix):', storedRefreshToken.substring(0, 20) + "...");
        console.log('[CLIENT] AuthProvider:initSessionAsync - Stored ID Token (prefix):', storedIdToken.substring(0, 20) + "...");

        const initOptions: Keycloak.KeycloakInitOptions = {
          token: storedAccessToken,
          refreshToken: storedRefreshToken,
          idToken: storedIdToken,
          pkceMethod: 'S256', 
          // Explicitly DO NOT use onLoad when initing with tokens
        };
        console.log('[CLIENT] AuthProvider:initSessionAsync - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:', JSON.stringify(initOptions, null, 2));
        
        try {
          authenticatedByInit = await kcInstance.init(initOptions);
          console.log(`[CLIENT] AuthProvider:initSessionAsync - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByInit}`);
          console.log(`[CLIENT] AuthProvider:initSessionAsync - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
          console.log('[CLIENT] AuthProvider:initSessionAsync - AFTER init with tokens, kcInstance.token (prefix):', kcInstance.token ? kcInstance.token.substring(0, 20) + '...' : 'undefined');
          
          if (kcInstance.authenticated === undefined && authenticatedByInit === true) {
             console.warn("[CLIENT] AuthProvider:initSessionAsync - kcInstance.authenticated is undefined BUT init() promise resolved true. This is unusual. Trusting init() promise.");
          } else if (kcInstance.authenticated !== authenticatedByInit) {
             console.warn(`[CLIENT] AuthProvider:initSessionAsync - Mismatch: init() promise was ${authenticatedByInit} but kcInstance.authenticated is ${kcInstance.authenticated}. Using kcInstance.authenticated.`);
          }

        } catch (initError: any) {
            console.error("[CLIENT] AuthProvider:initSessionAsync - Error DURING keycloak.init() with pre-obtained tokens:", initError.error || initError);
            authenticatedByInit = false; 
        }

        console.log('[CLIENT] AuthProvider:initSessionAsync - Clearing DAG tokens from localStorage after init attempt.');
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');

      } else if (kcInstance.authenticated) {
        console.log('[CLIENT] AuthProvider:initSessionAsync - Keycloak instance is ALREADY authenticated (e.g. from previous redirect/SSO). Syncing state.');
        authenticatedByInit = true; // Reflect existing authenticated state
      } else {
        console.log('[CLIENT] AuthProvider:initSessionAsync - No stored DAG tokens found and not already authenticated. Using default init options (check-sso).');
        const standardInitOptions: Keycloak.KeycloakInitOptions = {
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
          pkceMethod: 'S256',
        };
        console.log('[CLIENT] AuthProvider:initSessionAsync - Calling keycloak.init() with standard options:', JSON.stringify(standardInitOptions));
        authenticatedByInit = await kcInstance.init(standardInitOptions);
        console.log('[CLIENT] AuthProvider:initSessionAsync - Keycloak init (standard) returned:', authenticatedByInit);
        console.log(`[CLIENT] AuthProvider:initSessionAsync - AFTER standard init, kcInstance.authenticated is: ${kcInstance.authenticated}`);
      }
      
      // Primary source of truth for authenticated status after init attempt
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
          console.error("[CLIENT] AuthProvider:initSessionAsync - Error loading user profile despite KCAUTH true:", profileError);
          setIsAuthenticated(false); 
          setUser(null);
          kcInstance.clearToken();
        }
      } else {
        console.log('[CLIENT] AuthProvider:initSessionAsync - User IS NOT authenticated after all checks/init attempts.');
        setUser(null);
        // Do not clear token here if it was a failed standard init, Keycloak handles it.
        // If it was a failed token-based init, tokens were already cleared from localStorage.
      }
    } catch (error: any) {
      console.error("[CLIENT] AuthProvider:initSessionAsync - Outer catch block error during Keycloak initialization. Raw error object:", error);
      // ... (rest of error logging)
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log('[CLIENT] AuthProvider:initSessionAsync - Initialization process finished. isLoading:', false, 'isAuthenticated (React state):', isAuthenticated, 'kcInstance.authenticated:', kcInstance?.authenticated);
    }
  }, [pathname, isAuthenticated]); // Re-added isAuthenticated for specific re-eval scenarios, but initSessionAsync guards itself.

  useEffect(() => {
    console.log(`[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Keycloak ready: ${!!keycloak}, Path: ${pathname}`);
    if (keycloak) {
      // This effect ensures initSessionAsync is called once keycloak is set and on path changes.
      // initSessionAsync itself will decide if a full re-init is needed or just state sync.
      initSessionAsync(keycloak);
    } else if (!isLoading && !keycloak) {
      console.log("[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Keycloak instance not set and not loading. Auth will not proceed.");
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keycloak, pathname]); // initSessionAsync is memoized with useCallback

  useEffect(() => {
    if (isAuthenticated && keycloak && keycloak.token) {
      console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - User is authenticated and token IS available.`);
      console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - Token (prefix): ${keycloak.token.substring(0, 20)}...`);
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
      // Re-sync state if keycloak's state changed
      if (keycloak.authenticated !== isAuthenticated) {
        setIsAuthenticated(!!keycloak.authenticated);
        if (keycloak.authenticated) {
          keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile))
            .catch(err => { console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile:", err); setUser(null);});
        } else {
          setUser(null);
        }
      } else if (keycloak.authenticated && !user) { // Authenticated but user profile somehow missing
         keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile))
            .catch(err => { console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile (already auth):", err); setUser(null);});
      }
    };
    // ... (other event handlers: onAuthError, onAuthRefreshSuccess, etc. remain similar)
    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered. Error data:", errorData);
      setIsAuthenticated(false);
      setUser(null);
    };
    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered. Token (prefix):', keycloak.token ? keycloak.token.substring(0,20) + '...' : 'undefined');
    };
    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError - Failed to refresh token. Forcing logout actions.");
      setIsAuthenticated(false);
      setUser(null);
      keycloak.clearToken(); 
      router.push('/login?sessionExpired=true&reason=onAuthRefreshError');
    };
    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered.');
      setIsAuthenticated(false);
      setUser(null);
      localStorage.removeItem('kc_access_token');
      localStorage.removeItem('kc_refresh_token');
      localStorage.removeItem('kc_id_token');
      localStorage.removeItem('kc_expires_in');
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout - States reset, DAG tokens cleared from localStorage.');
    };
    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting to update token...');
      keycloak.updateToken(30).catch(() => { 
        console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Failed to update token after expiry. Forcing logout actions.");
        setIsAuthenticated(false);
        setUser(null);
        keycloak.clearToken();
        router.push('/login?sessionExpired=true&reason=tokenUpdateFailedOnExpiry');
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
        keycloak.onAuthRefreshSuccess = null;
        keycloak.onAuthRefreshError = null;
        keycloak.onAuthLogout = null;
        keycloak.onTokenExpired = null;
      }
    };
  }, [keycloak, router, isAuthenticated, user]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:login - Login attempt initiated with standard Keycloak login (redirect flow).');
      setIsLoading(true);
      try {
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
        setIsAuthenticated(false); 
        setUser(null);
        setIsLoading(false);
      }
    } else {
      console.error("[CLIENT] AuthProvider:logout - Keycloak instance not available to logout.");
    }
  };

  const register = async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:register - Register attempt initiated (redirect to Keycloak page).');
      setIsLoading(true);
      try {
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
    if (!keycloak.authenticated) { // Check the instance's own idea of auth
      console.warn("[CLIENT] AuthProvider:getToken - User not authenticated (kc.authenticated is false), token not requested.");
      return undefined;
    }
    try {
      console.log("[CLIENT] AuthProvider:getToken - Attempting to update token (minValidity: 5s)...");
      const refreshed = await keycloak.updateToken(5); 
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed successfully.');
      } else {
        console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (still valid or refresh failed silently).');
      }
    } catch (error) {
      console.error("[CLIENT] AuthProvider:getToken - Error during keycloak.updateToken():", error);
      setIsAuthenticated(false);
      setUser(null);
      keycloak.clearToken();
      router.push('/login?sessionExpired=true&reason=getTokenUpdateFailed');
      return undefined;
    }
    
    if (!keycloak.token) {
      console.warn("[CLIENT] AuthProvider:getToken - Token is still not available after potential refresh. kc.authenticated:", keycloak.authenticated);
      return undefined;
    }
    
    console.log(`[CLIENT] AuthProvider:getToken - Returning token (prefix): ${keycloak.token.substring(0, 20)}...`);
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

    