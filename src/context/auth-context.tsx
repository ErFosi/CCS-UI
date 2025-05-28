
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
    console.log('[CLIENT] AuthProvider:useEffect[] - Setting Keycloak instance.');
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
      keycloakActualInitInvokedRef.current = true; // Mark that we are now attempting init, ONCE.

      const performInitialization = async () => {
        console.log(`[CLIENT] AuthProvider:performInitialization - Starting for path: ${pathname}`);
        setIsLoading(true);
        let authenticatedByThisInitRun = false;
        let initOptions: Keycloak.KeycloakInitOptions = {};

        try {
          const storedAccessToken = localStorage.getItem('kc_access_token');
          const storedRefreshToken = localStorage.getItem('kc_refresh_token');
          const storedIdToken = localStorage.getItem('kc_id_token');

          if (storedAccessToken && storedRefreshToken) {
            console.log('[CLIENT] AuthProvider:performInitialization - Found stored tokens from Direct Access Grant.');
            console.log(`[CLIENT] AuthProvider:performInitialization - Using Access Token (prefix): ${storedAccessToken.substring(0,20)}...`);
            
            // Minimal options for init with pre-obtained tokens
            initOptions = {
              token: storedAccessToken,
              refreshToken: storedRefreshToken,
              idToken: storedIdToken ?? undefined,
              // No onLoad, no silentCheckSsoRedirectUri, no pkceMethod for this path
            };
            console.log('[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:', JSON.stringify(initOptions, null, 2));
            authenticatedByThisInitRun = await kcInstance.init(initOptions);
            console.log(`[CLIENT] AuthProvider:performInitialization - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByThisInitRun}`);
            console.log(`[CLIENT] AuthProvider:performInitialization - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
            
            console.log('[CLIENT] AuthProvider:performInitialization - Clearing DAG tokens from localStorage after init attempt.');
            localStorage.removeItem('kc_access_token');
            localStorage.removeItem('kc_refresh_token');
            localStorage.removeItem('kc_id_token');
            localStorage.removeItem('kc_expires_in');

          } else {
            console.log('[CLIENT] AuthProvider:performInitialization - No stored DAG tokens found. Using default init options (check-sso).');
            initOptions = {
              onLoad: 'check-sso',
              silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
              pkceMethod: 'S256',
            };
            console.log('[CLIENT] AuthProvider:performInitialization - Calling keycloak.init() with standard options:', JSON.stringify(initOptions));
            authenticatedByThisInitRun = await kcInstance.init(initOptions);
            console.log(`[CLIENT] AuthProvider:performInitialization - Keycloak init (standard) success. Authenticated flag from init: ${authenticatedByThisInitRun}`);
          }
          
          // Use kcInstance.authenticated directly after init attempt
          const currentAuthStatus = !!kcInstance.authenticated; 
          setIsAuthenticated(currentAuthStatus);
          console.log('[CLIENT] AuthProvider:performInitialization - isAuthenticated state set to:', currentAuthStatus);

          if (currentAuthStatus) {
            console.log('[CLIENT] AuthProvider:performInitialization - User IS authenticated. Attempting to load user profile...');
            try {
              const profile = await kcInstance.loadUserProfile() as UserProfile;
              setUser(profile);
              console.log('[CLIENT] AuthProvider:performInitialization - User profile loaded successfully:', profile);
            } catch (profileError) {
              console.error("[CLIENT] AuthProvider:performInitialization - Error loading user profile despite kc.authenticated true:", profileError);
              setIsAuthenticated(false); // Revert if profile load fails
              setUser(null);
              if (kcInstance.token) kcInstance.clearToken(); // Clear potentially problematic token
            }
          } else {
            console.log('[CLIENT] AuthProvider:performInitialization - User IS NOT effectively authenticated after this run.');
            setUser(null);
          }

        } catch (error: any) {
          console.error("[CLIENT] AuthProvider:performInitialization - Error during Keycloak initialization. Raw error object:", error);
          let detailedMessage = "Keycloak initialization failed. ";
          if (error && error.message) { detailedMessage += `Details: ${error.message}. `; }
          else { detailedMessage += "No specific error message was provided. "; }
          
          if (error?.message?.includes("initialized once")) {
            console.warn("[CLIENT] AuthProvider:performInitialization - Caught 'already initialized' error. This should have been prevented by keycloakActualInitInvokedRef. Current kc.authenticated:", kcInstance.authenticated);
            setIsAuthenticated(!!kcInstance.authenticated);
            if(kcInstance.authenticated && !user) {
                kcInstance.loadUserProfile().then(p => setUser(p as UserProfile)).catch(() => setUser(null));
            } else if (!kcInstance.authenticated) {
                setUser(null);
            }
          } else {
            console.error(detailedMessage, "Error Name:", error?.name);
            setIsAuthenticated(false);
            setUser(null);
          }
        } finally {
          setIsLoading(false);
          // Log final state after initialization attempt
          console.log(`[CLIENT] AuthProvider:performInitialization - Finished. isLoading: ${isLoading}, isAuthenticated (React state): ${isAuthenticated} kcInstance.authenticated: ${kcInstance?.authenticated}`);
        }
      };

      performInitialization();

    } else if (kcInstance && keycloakActualInitInvokedRef.current) {
      console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Keycloak instance available AND actual init already invoked. Syncing React state if necessary.');
      const currentAuthStatus = !!kcInstance.authenticated;
      if (isAuthenticated !== currentAuthStatus) {
        setIsAuthenticated(currentAuthStatus);
        console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Synced isAuthenticated state to:', currentAuthStatus);
      }
      if (currentAuthStatus && !user) {
        kcInstance.loadUserProfile().then(profile => {
          setUser(profile as UserProfile);
          console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Synced user profile:', profile);
        }).catch(() => setUser(null));
      } else if (!currentAuthStatus && user) {
        setUser(null);
        console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Cleared user profile as no longer authenticated.');
      }
      if (isLoading) {
        setIsLoading(false);
        console.log('[CLIENT] AuthProvider:useEffect[keycloak] - Ensured isLoading is false post-init.');
      }
    }
  }, [keycloak]); // This effect ONLY depends on the keycloak instance.

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
       setIsAuthenticated(!!keycloak.authenticated); 
    };

    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError. User will be logged out.");
      setIsAuthenticated(false); 
      setUser(null); 
      if (keycloak.token) keycloak.clearToken();
    };

    const onAuthLogout = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout triggered. Stack trace:', new Error().stack);
      setIsAuthenticated(false); 
      setUser(null);
      localStorage.removeItem('kc_access_token');
      localStorage.removeItem('kc_refresh_token');
      localStorage.removeItem('kc_id_token');
      localStorage.removeItem('kc_expires_in');
      // Consider if keycloakActualInitInvokedRef should be reset here.
      // If a full logout means the app should re-init from scratch on next load, then yes.
      // keycloakActualInitInvokedRef.current = false; 
      // However, if Keycloak itself handles this (e.g. redirect to login page),
      // then the ref might not need resetting until a new Keycloak instance is formed.
    };

    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting token refresh...');
      keycloak.updateToken(30) 
        .then(refreshed => {
          if (refreshed) {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token was refreshed successfully.');
          } else {
            console.log('[CLIENT] Keycloak EVENT: onTokenExpired - Token not refreshed (e.g. still valid or error during refresh).');
          }
        })
        .catch(() => { 
          console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Token refresh failed. User session might be invalid.");
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
        // Prevent memory leaks by nullifying handlers
        keycloak.onAuthSuccess = undefined;
        keycloak.onAuthError = undefined;
        keycloak.onAuthRefreshSuccess = undefined;
        keycloak.onAuthRefreshError = undefined;
        keycloak.onAuthLogout = undefined;
        keycloak.onTokenExpired = undefined;
      }
    };
  }, [keycloak]); // Dependencies: keycloak only, as handlers don't close over other changing state.

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
  }, [isAuthenticated, keycloak, keycloak?.token]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:login - Standard Keycloak login initiated (redirect flow).');
      setIsLoading(true);
      // keycloakActualInitInvokedRef.current = false; // Reset for a redirect-based login attempt
      try {
        await keycloak.login(options);
        // After login redirect, performInitialization will handle the new state.
      } catch (e) {
        console.error('[CLIENT] AuthProvider:login - keycloak.login() threw an error', e);
        setIsLoading(false);
      }
    } else {
      console.error('[CLIENT] AuthProvider:login - Keycloak instance not available.');
    }
  };

  const logout = async () => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:logout - Logout initiated.');
      setIsLoading(true); // Set loading true during logout process
      try {
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
        console.log('[CLIENT] AuthProvider:logout - Cleared DAG tokens from localStorage.');
        
        // Forcing Keycloak state to unauthenticated before redirect
        // This might not be strictly necessary if onAuthLogout event is reliable,
        // but can help ensure UI reacts faster if redirect is slow.
        // setIsAuthenticated(false);
        // setUser(null);
        // if (keycloak.token) keycloak.clearToken(); // This is handled by onAuthLogout

        await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined });
        // keycloak.logout() itself might trigger onAuthLogout which handles state.
        // If not, we might need to reset state here if the redirect is slow.
        // keycloakActualInitInvokedRef.current = false; // Allow re-init after a full logout
      } catch (e) {
        console.error('[CLIENT] AuthProvider:logout - keycloak.logout() threw an error. Manual state reset.', e);
        setIsAuthenticated(false);
        setUser(null);
        keycloakActualInitInvokedRef.current = false; // Allow re-init
        setIsLoading(false);
        if (typeof window !== 'undefined') {
          // Fallback redirect if keycloak.logout() fails to redirect
          window.location.href = '/login?logoutFailed=true';
        }
      }
      // Note: setIsLoading(false) might be called by onAuthLogout or after redirect.
      // If logout only redirects, isLoading will resolve on the new page's init.
    } else {
      console.error('[CLIENT] AuthProvider:logout - Keycloak instance not available.');
    }
  };

  const register = async (options?: Keycloak.KeycloakRegisterOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:register - Standard Keycloak registration initiated (redirect flow).');
      setIsLoading(true);
      // keycloakActualInitInvokedRef.current = false; 
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
      // Minimum validity of 5 seconds, can be adjusted.
      // updateToken will resolve with true if token was refreshed, false otherwise.
      const refreshed = await keycloak.updateToken(5); 
      if (refreshed) {
        console.log('[CLIENT] AuthProvider:getToken - Token was refreshed.');
      } else {
        console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (still valid or error during refresh).');
      }
    } catch (error) {
      // This catch block might be hit if updateToken itself throws an error,
      // e.g., if refresh token is invalid or network issue.
      // Keycloak's onAuthRefreshError event should also handle this.
      console.error('[CLIENT] AuthProvider:getToken - Error updating token. Current session might be invalid.', error);
      // Consider if state should be reset here, or rely on onAuthRefreshError.
      // setIsAuthenticated(false);
      // setUser(null);
      // router.push('/login?sessionExpired=true&reason=getTokenUpdateFailed');
      // return undefined; // Return undefined if token update fails critically
    }
    return keycloak.token;
  }, [keycloak]);

  // Final log for rendering, helps track state changes
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

