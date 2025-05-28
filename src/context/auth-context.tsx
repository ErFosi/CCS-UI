
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

  const initSessionAsync = useCallback(async (kcInstance: Keycloak) => {
    console.log(`[CLIENT] AuthProvider:initSessionAsync - Called. kcInstance.authenticated (before init attempt): ${kcInstance.authenticated}, actualInitInvokedRef: ${keycloakActualInitInvokedRef.current}`);
    
    // If init has already been invoked, only sync state if kc is already authenticated (e.g. by redirect)
    if (keycloakActualInitInvokedRef.current) {
        console.log('[CLIENT] AuthProvider:initSessionAsync - keycloak.init() was already invoked. Current kc.authenticated:', kcInstance.authenticated);
        setIsAuthenticated(!!kcInstance.authenticated);
        if (kcInstance.authenticated && !user) {
            try {
                const profile = await kcInstance.loadUserProfile() as UserProfile;
                setUser(profile);
                console.log('[CLIENT] AuthProvider:initSessionAsync - User profile re-loaded for already init+auth session:', profile);
            } catch (profileError) {
                console.error("[CLIENT] AuthProvider:initSessionAsync - Error re-loading user profile for already init+auth session:", profileError);
                setUser(null);
            }
        } else if (!kcInstance.authenticated) {
            setUser(null);
        }
        setIsLoading(false); // Ensure loading is false if init was already done.
        return;
    }
    
    keycloakActualInitInvokedRef.current = true; // Mark that we are now attempting init
    console.log('[CLIENT] AuthProvider:initSessionAsync - Marked actualInitInvokedRef as true. Attempting keycloak.init().');

    let authenticatedByThisInitRun = false;
    let initOptions: Keycloak.KeycloakInitOptions = {};

    try {
      const storedAccessToken = localStorage.getItem('kc_access_token');
      const storedRefreshToken = localStorage.getItem('kc_refresh_token');
      const storedIdToken = localStorage.getItem('kc_id_token');

      if (storedAccessToken && storedRefreshToken && storedIdToken) {
        console.log('[CLIENT] AuthProvider:initSessionAsync - Found stored tokens from Direct Access Grant.');
        console.log(`[CLIENT] AuthProvider:initSessionAsync - Using Access Token (prefix): ${storedAccessToken.substring(0,20)}...`);
        
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
        
        console.log('[CLIENT] AuthProvider:initSessionAsync - Clearing DAG tokens from localStorage after init attempt.');
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
      
      const currentAuthStatus = !!kcInstance.authenticated; // Use the instance's state after init
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
          setIsAuthenticated(false); // Revert if profile load fails
          setUser(null);
          if (kcInstance.token) kcInstance.clearToken(); // Clear potentially problematic token
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
      console.error(detailedMessage, "Error Name:", error?.name);
      
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log(`[CLIENT] AuthProvider:initSessionAsync - Initialization process finished. isLoading: false isAuthenticated (React state): ${isAuthenticated} kcInstance.authenticated: ${kcInstance?.authenticated}`);
    }
  }, [isAuthenticated, user]); // Added user to dependency array to help re-sync profile on auth changes

  useEffect(() => {
    console.log(`[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Path: ${pathname}. kc.auth before initSessionAsync: ${keycloak?.authenticated}, actualInitInvokedRef: ${keycloakActualInitInvokedRef.current}`);
    if (keycloak) {
      // Only call initSessionAsync if not already initialized by this ref logic
      if (!keycloakActualInitInvokedRef.current) {
         initSessionAsync(keycloak);
      } else {
        // If init was already attempted, ensure loading state is correct and sync auth state
        console.log('[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Init already attempted. Syncing React state with kc.authenticated:', keycloak.authenticated);
        setIsAuthenticated(!!keycloak.authenticated);
        if (keycloak.authenticated && !user) {
             keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile)).catch(() => setUser(null));
        } else if (!keycloak.authenticated) {
            setUser(null);
        }
        setIsLoading(false); // Important: if init already done, we are not loading
      }
    }
  }, [keycloak, pathname, initSessionAsync, user]);


  useEffect(() => {
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
  }, [isAuthenticated, keycloak, keycloak?.token]); // Ensure keycloak.token is a dependency

  useEffect(() => {
    if (!keycloak) return;

    const onAuthSuccess = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthSuccess triggered. kc.authenticated:', keycloak.authenticated);
      setIsAuthenticated(!!keycloak.authenticated);
      if (keycloak.authenticated) {
        keycloak.loadUserProfile().then(profile => {
          setUser(profile as UserProfile);
          console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - User profile loaded:', profile);
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
       setIsAuthenticated(!!keycloak.authenticated); // Should be true
    };

    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError. User will be logged out.");
      setIsAuthenticated(false); 
      setUser(null); 
      if (keycloak.token) keycloak.clearToken();
      // Force redirect to login if refresh fails critically
      router.push('/login?sessionExpired=true&reason=onAuthRefreshError');
    };

    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered.');
      setIsAuthenticated(false); 
      setUser(null);
      // Clear DAG tokens from localStorage on Keycloak logout event as well
      localStorage.removeItem('kc_access_token');
      localStorage.removeItem('kc_refresh_token');
      localStorage.removeItem('kc_id_token');
      localStorage.removeItem('kc_expires_in');
      keycloakActualInitInvokedRef.current = false; // Allow re-init after logout
    };

    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting token refresh...');
      keycloak.updateToken(30) // Refresh if token expires in 30 seconds or less
        .then(refreshed => {
          if (refreshed) {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token was refreshed successfully.');
          } else {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token not refreshed, still valid or error during refresh.');
          }
        })
        .catch(() => { 
          console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Token refresh failed. Logging out.");
          setIsAuthenticated(false); 
          setUser(null); 
          if (keycloak.token) keycloak.clearToken();
          router.push('/login?sessionExpired=true&reason=tokenExpiredNoRefresh');
      });
    };

    // Register event handlers
    keycloak.onAuthSuccess = onAuthSuccess;
    keycloak.onAuthError = onAuthError;
    keycloak.onAuthRefreshSuccess = onAuthRefreshSuccess;
    keycloak.onAuthRefreshError = onAuthRefreshError;
    keycloak.onAuthLogout = onAuthLogout;
    keycloak.onTokenExpired = onTokenExpired;
    console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak event handlers registered.');

    // Cleanup function to remove event handlers
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
  }, [keycloak, router, user]); // Added user here to ensure profile re-sync if user identity changes

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:login - login function called. Clearing actualInitInvokedRef and setting isLoading.');
      setIsLoading(true);
      keycloakActualInitInvokedRef.current = false; // Allow re-init for login attempts
      try {
        await keycloak.login(options);
      } catch (e) {
        console.error('[CLIENT] AuthProvider:login - keycloak.login() threw an error', e);
        setIsLoading(false); // Reset loading state on error
      }
    } else {
      console.error('[CLIENT] AuthProvider:login - Keycloak instance not available.');
    }
  };

  const logout = async () => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:logout - logout function called.');
      setIsLoading(true);
      try {
        await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined });
        // onAuthLogout event should handle state reset
      } catch (e) {
        console.error('[CLIENT] AuthProvider:logout - keycloak.logout() threw an error. Manual state reset.', e);
        // Manual reset if logout fails
        setIsAuthenticated(false); 
        setUser(null);
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
        keycloakActualInitInvokedRef.current = false; 
        setIsLoading(false);
      }
    } else {
      console.error('[CLIENT] AuthProvider:logout - Keycloak instance not available.');
    }
  };

  const register = async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:register - register function called.');
      setIsLoading(true);
      keycloakActualInitInvokedRef.current = false; // Allow re-init for register attempts
      try {
        await keycloak.register(options);
      } catch (e) {
        console.error('[CLIENT] AuthProvider:register - keycloak.register() threw an error', e);
        setIsLoading(false);
      }
    } else {
      console.error('[CLIENT] AuthProvider:register - Keycloak instance not available.');
    }
  };

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!keycloak || !keycloak.authenticated) {
      console.log('[CLIENT] AuthProvider:getToken - Not authenticated or keycloak not available.');
      return undefined;
    }
    try {
      // Setting minValidity to 5 seconds for refresh attempts
      const refreshed = await keycloak.updateToken(5);
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed.');
      } else {
        console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (still valid).');
      }
    } catch (error) {
      console.error('[CLIENT] AuthProvider:getToken - Error updating token. Logging out.', error);
      setIsAuthenticated(false); 
      setUser(null);
      router.push('/login?sessionExpired=true&reason=getTokenUpdateFailed');
      return undefined;
    }
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
    
