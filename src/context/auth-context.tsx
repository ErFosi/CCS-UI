
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
  
  // This ref tracks if keycloak.init() has been *actually invoked* on the current keycloak instance.
  const keycloakActualInitInvokedRef = useRef(false);

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
    console.log(`[CLIENT] AuthProvider:initSessionAsync - Called. kcInstance.authenticated (before init attempt): ${kcInstance.authenticated}, actualInitInvokedRef: ${keycloakActualInitInvokedRef.current}`);
    setIsLoading(true);

    let authenticatedByThisInitRun = false;

    try {
      // If keycloak-js already considers itself authenticated (e.g. from a redirect flow handled by keycloak.js itself or a token refresh),
      // we don't need to call init() again. Just sync our React state.
      if (kcInstance.authenticated) {
        console.log('[CLIENT] AuthProvider:initSessionAsync - Keycloak instance ALREADY authenticated. Syncing state.');
        authenticatedByThisInitRun = true;
      } else {
        // Check for tokens from Direct Access Grant (stored by LoginForm)
        const storedAccessToken = localStorage.getItem('kc_access_token');
        const storedRefreshToken = localStorage.getItem('kc_refresh_token');
        const storedIdToken = localStorage.getItem('kc_id_token');

        if (storedAccessToken && storedRefreshToken && storedIdToken) {
          console.log('[CLIENT] AuthProvider:initSessionAsync - Found stored tokens from Direct Access Grant.');
          console.log('[CLIENT] AuthProvider:initSessionAsync - Stored Access Token (prefix):', storedAccessToken.substring(0, 20) + "...");
          
          if (!keycloakActualInitInvokedRef.current) {
            const initOptions: Keycloak.KeycloakInitOptions = {
              token: storedAccessToken,
              refreshToken: storedRefreshToken,
              idToken: storedIdToken,
              pkceMethod: 'S256',
            };
            console.log('[CLIENT] AuthProvider:initSessionAsync - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:', JSON.stringify(initOptions, null, 2));
            keycloakActualInitInvokedRef.current = true; // Mark that we are ATTEMPTING init
            authenticatedByThisInitRun = await kcInstance.init(initOptions);
            console.log(`[CLIENT] AuthProvider:initSessionAsync - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByThisInitRun}`);
            console.log(`[CLIENT] AuthProvider:initSessionAsync - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
          } else {
            console.log('[CLIENT] AuthProvider:initSessionAsync - Stored tokens found, but keycloak.init() was already invoked. Relying on current kcInstance.authenticated state.');
            authenticatedByThisInitRun = !!kcInstance.authenticated; // Reflect current state
          }
          // Always clear DAG tokens from localStorage after attempting to use them or acknowledging them.
          console.log('[CLIENT] AuthProvider:initSessionAsync - Clearing DAG tokens from localStorage after init attempt with them.');
          localStorage.removeItem('kc_access_token');
          localStorage.removeItem('kc_refresh_token');
          localStorage.removeItem('kc_id_token');
          localStorage.removeItem('kc_expires_in');

        } else if (!keycloakActualInitInvokedRef.current) { // No localStorage tokens, and init not yet attempted for this instance
          console.log('[CLIENT] AuthProvider:initSessionAsync - No stored DAG tokens found. Using default init options (check-sso).');
          const initOptions: Keycloak.KeycloakInitOptions = {
            onLoad: 'check-sso',
            silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
            pkceMethod: 'S256',
          };
          console.log('[CLIENT] AuthProvider:initSessionAsync - Calling keycloak.init() with standard options:', JSON.stringify(initOptions));
          keycloakActualInitInvokedRef.current = true; // Mark that we are ATTEMPTING init
          authenticatedByThisInitRun = await kcInstance.init(initOptions);
          console.log(`[CLIENT] AuthProvider:initSessionAsync - Keycloak init (standard) success. Authenticated flag from init: ${authenticatedByThisInitRun}`);
        } else {
          // No localStorage tokens, and init has already been invoked. User is likely not logged in.
          console.log('[CLIENT] AuthProvider:initSessionAsync - No localStorage tokens, and keycloak.init() was already invoked. User likely not authenticated.');
          authenticatedByThisInitRun = !!kcInstance.authenticated; // Reflect current state
        }
      }
      
      // Sync React state based on the effective authentication status from this run
      const currentAuthStatus = !!kcInstance.authenticated; // Use the instance's final say
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
          kcInstance.clearToken();
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
      detailedMessage += "This could be due to network issues (Keycloak server unreachable), CORS problems (check Keycloak client's 'Web Origins'), or SSL certificate errors if you're using HTTPS with a self-signed certificate (the browser will block this; you need to trust the certificate). Please check your browser's console (Network tab) for more details and ensure your Keycloak server is correctly configured and accessible.";
      console.error(detailedMessage, "Error Name:", error?.name, "Raw error object:", error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log(`[CLIENT] AuthProvider:initSessionAsync - Initialization process finished. isLoading: false isAuthenticated (React state): ${isAuthenticated} kcInstance.authenticated: ${kcInstance?.authenticated}`);
    }
  }, [isAuthenticated, router]); // isAuthenticated dependency allows re-sync if auth state changes due to external factors (e.g. token refresh handled by events)

  // Main useEffect to trigger initialization or sync state
  useEffect(() => {
    if (keycloak) {
      console.log(`[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Path: ${pathname}. kc.auth before initSessionAsync: ${keycloak.authenticated}, actualInitInvokedRef: ${keycloakActualInitInvokedRef.current}`);
      // We call initSessionAsync on keycloak availability or path change.
      // initSessionAsync itself is now responsible for the "only call keycloak.init() once" logic.
      initSessionAsync(keycloak);
    }
  }, [keycloak, pathname, initSessionAsync]);


  // Effect for logging token to server (runs when isAuthenticated and keycloak.token are ready)
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

  // Effect for Keycloak event handlers
  useEffect(() => {
    if (!keycloak) return;

    const onAuthSuccess = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthSuccess triggered. kc.authenticated:', keycloak.authenticated);
      setIsAuthenticated(!!keycloak.authenticated);
      if (keycloak.authenticated) {
        keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile))
          .catch(err => { console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile:", err); setUser(null);});
      } else {
        setUser(null);
      }
    };
    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered. Error data:", errorData);
      setIsAuthenticated(false);
      setUser(null);
      keycloakActualInitInvokedRef.current = false; // Allow re-init attempt if auth error occurs
    };
    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered. Token (prefix):', keycloak.token ? keycloak.token.substring(0,20) + '...' : 'undefined');
       // State update for isAuthenticated/user should be handled by the main useEffect if token availability changes,
       // or if token refresh leads to onAuthSuccess implicitly.
    };
    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError - Failed to refresh token. Forcing logout actions.");
      setIsAuthenticated(false);
      setUser(null);
      keycloak.clearToken(); 
      keycloakActualInitInvokedRef.current = false; // Allow re-init attempt
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
      keycloakActualInitInvokedRef.current = false; 
    };
    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting to update token...');
      keycloak.updateToken(30).catch(() => { 
        console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Failed to update token after expiry. Forcing logout actions.");
        setIsAuthenticated(false);
        setUser(null);
        keycloak.clearToken();
        keycloakActualInitInvokedRef.current = false; // Allow re-init attempt
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
  }, [keycloak, router]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:login - Login attempt initiated with standard Keycloak login (redirect flow).');
      setIsLoading(true);
      keycloakActualInitInvokedRef.current = false; // Reset for redirect flow
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
      keycloakActualInitInvokedRef.current = false; // Reset for next login
      try {
        const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
        await keycloak.logout({ redirectUri });
      } catch (error) {
        console.error("[CLIENT] AuthProvider:logout - Keycloak logout error:", error);
        // State clearing should be handled by onAuthLogout event or redirect logic
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
      keycloakActualInitInvokedRef.current = false; // Reset for redirect flow
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
    if (!keycloak.authenticated) { 
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
      keycloakActualInitInvokedRef.current = false; // Allow re-init
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

    