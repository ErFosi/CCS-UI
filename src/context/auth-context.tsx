
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

  // This useEffect is responsible for the one-time initialization of Keycloak
  useEffect(() => {
    if (keycloak && !keycloakActualInitInvokedRef.current) {
      console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance available and init NOT YET INVOKED. Starting initialization.');
      keycloakActualInitInvokedRef.current = true; // Mark that we are ATTEMPTING init now
      setIsLoading(true);

      const initSessionAsync = async (kcInstance: Keycloak) => {
        console.log(`[CLIENT] AuthProvider:initSessionAsync - Called.`);
        let authenticatedByThisInitRun = false;
        let initOptions: Keycloak.KeycloakInitOptions = {};

        try {
          const storedAccessToken = localStorage.getItem('kc_access_token');
          const storedRefreshToken = localStorage.getItem('kc_refresh_token');
          const storedIdToken = localStorage.getItem('kc_id_token');

          if (storedAccessToken && storedRefreshToken && storedIdToken) {
            console.log('[CLIENT] AuthProvider:initSessionAsync - Found stored tokens from Direct Access Grant.');
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
            
            // Clear tokens from localStorage after attempting to use them for init
            console.log('[CLIENT] AuthProvider:initSessionAsync - Clearing DAG tokens from localStorage after init attempt with them.');
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
          detailedMessage += "This could be due to network issues (Keycloak server unreachable), CORS problems (check Keycloak client's 'Web Origins'), or SSL certificate errors if you're using HTTPS with a self-signed certificate. Please check your browser's console (Network tab) for more details and ensure your Keycloak server is correctly configured and accessible.";
          console.error(detailedMessage, "Error Name:", error?.name);
          setIsAuthenticated(false);
          setUser(null);
        } finally {
          setIsLoading(false);
          console.log(`[CLIENT] AuthProvider:initSessionAsync - Initialization process finished. isLoading: false isAuthenticated (React state): ${isAuthenticated} kcInstance.authenticated: ${kcInstance?.authenticated}`);
        }
      };

      initSessionAsync(keycloak);
    } else if (keycloak && keycloakActualInitInvokedRef.current) {
      console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance available, init ALREADY INVOKED. Syncing state if needed. kc.auth: ${keycloak.authenticated}`);
      // If init was already invoked, ensure React state reflects Keycloak's current state.
      // This handles cases where event handlers might have changed kc.authenticated.
      const currentAuthStatus = !!keycloak.authenticated;
      if (isAuthenticated !== currentAuthStatus) {
        setIsAuthenticated(currentAuthStatus);
        if (currentAuthStatus && !user) {
          keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile)).catch(() => setUser(null));
        } else if (!currentAuthStatus) {
          setUser(null);
        }
        console.log(`[CLIENT] AuthProvider:useEffect[keycloak] - State synced with kc.auth: ${currentAuthStatus}`);
      }
      if (isLoading) setIsLoading(false); // Ensure loading is false if init was done
    }
  }, [keycloak]); // Only re-run if the keycloak instance itself changes (should be rare)

  useEffect(() => {
    // This effect runs when isAuthenticated or keycloak.token changes.
    // It's responsible for logging the token to the server if available.
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
  }, [isAuthenticated, keycloak, keycloak?.token]); // Re-run if auth state or token changes

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
      // Do not reset keycloakActualInitInvokedRef.current here, as init was attempted.
    };
    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered. Token (prefix):', keycloak.token ? keycloak.token.substring(0,20) + '...' : 'undefined');
       // Token logging for server is handled by the dedicated useEffect
    };
    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError - Failed to refresh token. Forcing logout actions.");
      setIsAuthenticated(false);
      setUser(null);
      if (keycloak.token) keycloak.clearToken(); 
      // Do not reset keycloakActualInitInvokedRef.current
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
      keycloakActualInitInvokedRef.current = false; // Allow re-init after logout
    };
    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting to update token...');
      keycloak.updateToken(30).catch(() => { 
        console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Failed to update token after expiry. Forcing logout actions.");
        setIsAuthenticated(false);
        setUser(null);
        if (keycloak.token) keycloak.clearToken();
        // Do not reset keycloakActualInitInvokedRef.current
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
  }, [keycloak, router]); // Re-register event handlers if keycloak instance or router changes

  // This useEffect watches pathname to potentially re-sync state if navigation happens
  // and Keycloak state might have changed outside of direct init (e.g., after a redirect flow if we used one)
  // BUT it MUST NOT call keycloak.init() again.
  useEffect(() => {
    if (keycloak && keycloakActualInitInvokedRef.current) {
      console.log(`[CLIENT] AuthProvider:useEffect[pathname] - Path changed to: ${pathname}. Init already invoked. Syncing React state with kc.auth: ${keycloak.authenticated}`);
      const currentAuthStatus = !!keycloak.authenticated;
      if (isAuthenticated !== currentAuthStatus) {
        setIsAuthenticated(currentAuthStatus);
      }
      if (currentAuthStatus && !user) {
        keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile)).catch(() => setUser(null));
      } else if (!currentAuthStatus && user) {
        setUser(null);
      }
    }
  }, [pathname, keycloak, isAuthenticated, user]);


  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:login - Login attempt initiated with standard Keycloak login (redirect flow).');
      setIsLoading(true);
      keycloakActualInitInvokedRef.current = false; // Reset init flag for a new login attempt via redirect
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
        // State clearing is also handled by onAuthLogout event
      } catch (error) {
        console.error("[CLIENT] AuthProvider:logout - Keycloak logout error:", error);
        // onAuthLogout should handle state, but ensure loading is false
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
      keycloakActualInitInvokedRef.current = false; 
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
      // onAuthRefreshError should handle state if token update fails and causes de-auth
      // If updateToken itself throws but doesn't de-authenticate, we might not need to push to login here
      // unless keycloak.authenticated becomes false.
      if (!keycloak.authenticated) {
        router.push('/login?sessionExpired=true&reason=getTokenUpdateFailed');
      }
      return undefined;
    }
    
    if (!keycloak.token) {
      console.warn("[CLIENT] AuthProvider:getToken - Token is still not available after potential refresh. kc.authenticated:", keycloak.authenticated);
      return undefined;
    }
    
    console.log(`[CLIENT] AuthProvider:getToken - Returning token (prefix): ${keycloak.token.substring(0, 20)}...`);
    return keycloak.token;
  }, [keycloak, router]);

  console.log(`[CLIENT] AuthProvider RENDER - isLoading: ${isLoading}, isAuthenticated: ${isAuthenticated}, user: ${user?.username}, keycloak set: ${!!keycloak}, kc.auth: ${keycloak?.authenticated}`);

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

    
