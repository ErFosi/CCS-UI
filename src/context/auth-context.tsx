
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

  const keycloakActualInitInvokedRef = useRef(false);

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

  useEffect(() => {
    const kcInstance = keycloak;

    if (kcInstance && !keycloakActualInitInvokedRef.current) {
      console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance available. Attempting ONE-TIME initialization.');
      keycloakActualInitInvokedRef.current = true; 

      const performInitialization = async () => {
        console.log(`[CLIENT] AuthProvider:performInitialization - Starting for path: ${pathname}`);
        setIsLoading(true);
        let initOptions: Keycloak.KeycloakInitOptions;

        try {
          console.log('[CLIENT] AuthProvider:performInitialization - Using standard init options (check-sso with redirect flow).');
          initOptions = {
            onLoad: 'check-sso', 
            silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
            pkceMethod: 'S256',
          };
          console.log('[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with standard options:', JSON.stringify(initOptions));
          
          const authenticatedByInit = await kcInstance.init(initOptions);
          console.log(`[CLIENT] AuthProvider:performInitialization - Keycloak init (standard) success. Authenticated flag from init: ${authenticatedByInit}`);
          
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
                 console.log(`[CLIENT] AuthProvider:performInitialization - Token available after profile load. Attempting to log on server.`);
                 logTokenOnServer(kcInstance.token).catch(e => console.error("[CLIENT] AuthProvider:performInitialization - Error calling logTokenOnServer (after profile load):", e));
              }
            } catch (profileError) {
              console.error("[CLIENT] AuthProvider:performInitialization - Error loading user profile despite kc.authenticated true:", profileError);
              setIsAuthenticated(false);
              setUser(null);
              if (kcInstance.token) kcInstance.clearToken(); 
            }
          } else {
            console.log('[CLIENT] AuthProvider:performInitialization - User IS NOT effectively authenticated after this run.');
            setUser(null);
          }

        } catch (error: any) {
          console.error("[CLIENT] AuthProvider:performInitialization - Error during Keycloak initialization. Raw error object:", error);
          setIsAuthenticated(false);
          setUser(null);
        } finally {
          setIsLoading(false);
          console.log(`[CLIENT] AuthProvider:performInitialization - Finished. isLoading: ${isLoading}, isAuthenticated (React state): ${isAuthenticated} kcInstance.authenticated: ${kcInstance?.authenticated}`);
        }
      };

      performInitialization();

    } else if (kcInstance && keycloakActualInitInvokedRef.current) {
      // Subsequent renders/route changes AFTER initial init attempt.
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
       if (isLoading && !currentAuthStatus && keycloakActualInitInvokedRef.current) {
         // Ensure isLoading becomes false if init was tried and user is not auth
         setIsLoading(false);
         console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Set isLoading to false as init was attempted and user is not authenticated.');
       }
    }
  }, [keycloak]); // Only re-run if the keycloak instance itself changes

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
             console.log(`[CLIENT] Keycloak EVENT: onAuthSuccess - Token available. Attempting to log on server.`);
             logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error calling logTokenOnServer:", e));
           }
        }).catch(err => { 
          console.error("[CLIENT] Keycloak EVENT: onAuthSuccess - Error loading profile:", err); 
          setUser(null); 
        });
      } else {
        setUser(null);
      }
      // Ensure isLoading is false after a successful auth event
      setIsLoading(false); 
    };

    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered.", errorData);
      setIsAuthenticated(false); 
      setUser(null);
      // Ensure isLoading is false after an auth error
      setIsLoading(false);
    };

    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered.');
       setIsAuthenticated(!!keycloak.authenticated); 
       if (keycloak.token && keycloak.authenticated) {
           console.log(`[CLIENT] Keycloak EVENT: onAuthRefreshSuccess - Token available. Attempting to log on server.`);
           logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] Keycloak EVENT: onAuthRefreshSuccess - Error calling logTokenOnServer:", e));
       }
    };

    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError. User session might be invalid.");
      setIsAuthenticated(false); 
      setUser(null); 
      if (keycloak.token) keycloak.clearToken();
      setIsLoading(false);
    };

    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered. Stack trace:', new Error().stack);
      setIsAuthenticated(false); 
      setUser(null);
      setIsLoading(false);
    };

    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting token refresh...');
      keycloak.updateToken(30) 
        .then(refreshed => {
          if (refreshed) {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token was refreshed successfully.');
          } else {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token not refreshed. kc.authenticated:', keycloak.authenticated);
             if (!keycloak.authenticated) {
                setIsAuthenticated(false);
                setUser(null);
             }
          }
        })
        .catch(() => { 
          console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Token refresh failed.");
          setIsAuthenticated(false);
          setUser(null);
          if (keycloak.token) keycloak.clearToken();
          setIsLoading(false);
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
      setIsLoading(true); // Set loading true before redirect
      try {
        // Keycloak handles redirect, so this promise might not resolve in the current page context
        await keycloak.login(options);
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
      try {
        // Clear any manually stored tokens as a precaution, though not used in redirect flow
        localStorage.removeItem('kc_access_token'); 
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
        
        await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined });
        // After logout, Keycloak redirects, so React state might not update here immediately.
        // onAuthLogout event handler will update the state.
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
      setIsLoading(false);
    }
  }, [keycloak]);

  const register = useCallback(async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:register - Standard Keycloak registration initiated (redirect flow). Options:', options);
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
      console.log('[CLIENT] AuthProvider:getToken - Not authenticated or keycloak not available.');
      return undefined;
    }
    try {
      // Minimum validity 5 seconds, will refresh if less.
      const refreshed = await keycloak.updateToken(5); 
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed.');
        if (keycloak.token) {
           console.log(`[CLIENT] AuthProvider:getToken - Refreshed token available. Attempting to log on server.`);
           logTokenOnServer(keycloak.token).catch(e => console.error("[CLIENT] AuthProvider:getToken - Error calling logTokenOnServer (after refresh):", e));
        }
      } else {
        // console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (still valid or error).');
      }
    } catch (error) {
      console.error('[CLIENT] AuthProvider:getToken - Error updating token. Session might be invalid.', error);
      // Potentially trigger logout or error state if token update fails critically
      setIsAuthenticated(false); 
      setUser(null);
      setIsLoading(false); 
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
