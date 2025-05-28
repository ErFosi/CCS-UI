
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
  const keycloakInitAttemptedRef = useRef(false); // Ref to track if init has been attempted

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
    console.log(`[CLIENT] AuthProvider:initSessionAsync - Starting session initialization for path: ${pathname}`);
    setIsLoading(true);

    try {
      const storedAccessToken = localStorage.getItem('kc_access_token');
      const storedRefreshToken = localStorage.getItem('kc_refresh_token');
      const storedIdToken = localStorage.getItem('kc_id_token');

      let authenticatedByInit = false;
      let initOptions: Keycloak.KeycloakInitOptions = {};

      if (storedAccessToken && storedRefreshToken && storedIdToken) {
        console.log('[CLIENT] AuthProvider:initSessionAsync - Found stored tokens from Direct Access Grant.');
        console.log('[CLIENT] AuthProvider:initSessionAsync - Stored Access Token (prefix):', storedAccessToken.substring(0, 20) + "...");
        initOptions = {
          token: storedAccessToken,
          refreshToken: storedRefreshToken,
          idToken: storedIdToken,
          pkceMethod: 'S256',
        };
        console.log('[CLIENT] AuthProvider:initSessionAsync - Calling keycloak.init() with PRE-OBTAINED TOKENS. Options:', JSON.stringify(initOptions, null, 2));
        
        try {
          authenticatedByInit = await kcInstance.init(initOptions);
          console.log(`[CLIENT] AuthProvider:initSessionAsync - keycloak.init() with PRE-OBTAINED TOKENS returned: ${authenticatedByInit}`);
          console.log(`[CLIENT] AuthProvider:initSessionAsync - AFTER init with tokens, kcInstance.authenticated is: ${kcInstance.authenticated}`);
        } catch (initError: any) {
            console.error("[CLIENT] AuthProvider:initSessionAsync - Error DURING keycloak.init() with pre-obtained tokens:", initError.error || initError.message || initError);
            authenticatedByInit = false; 
        }

        console.log('[CLIENT] AuthProvider:initSessionAsync - Clearing DAG tokens from localStorage after init attempt.');
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');

      } else if (kcInstance.authenticated) {
        console.log('[CLIENT] AuthProvider:initSessionAsync - Keycloak instance is ALREADY authenticated. Syncing state.');
        authenticatedByInit = true; 
      } else {
        console.log('[CLIENT] AuthProvider:initSessionAsync - No stored DAG tokens found and not already authenticated. Using default init options (check-sso).');
        initOptions = {
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
          pkceMethod: 'S256',
        };
        console.log('[CLIENT] AuthProvider:initSessionAsync - Calling keycloak.init() with standard options:', JSON.stringify(initOptions));
        authenticatedByInit = await kcInstance.init(initOptions);
        console.log('[CLIENT] AuthProvider:initSessionAsync - Keycloak init (standard) success. Authenticated flag from init:', authenticatedByInit);
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
          console.error("[CLIENT] AuthProvider:initSessionAsync - Error loading user profile despite KCAUTH true:", profileError);
          setIsAuthenticated(false); 
          setUser(null);
          kcInstance.clearToken(); // Clear token if profile load fails
        }
      } else {
        console.log('[CLIENT] AuthProvider:initSessionAsync - User IS NOT authenticated after all checks/init attempts.');
        setUser(null);
      }
    } catch (error: any) {
      console.error("[CLIENT] AuthProvider:initSessionAsync - Outer catch block error during Keycloak initialization. Raw error object:", error);
      let detailedMessage = "Keycloak initialization failed. ";
      if (error && error.message) {
        detailedMessage += `Details: ${error.message}. `;
      } else {
        detailedMessage += "No specific error message was provided by Keycloak. ";
      }
      detailedMessage += "This could be due to network issues (Keycloak server unreachable), CORS problems (check Keycloak client's 'Web Origins'), or SSL certificate errors if you're using HTTPS with a self-signed certificate (the browser will block this; you need to trust the certificate). Please check your browser's console (Network tab) for more details and ensure your Keycloak server is correctly configured and accessible.";
      console.error(detailedMessage, "Raw error object:", error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log(`[CLIENT] AuthProvider:initSessionAsync - Initialization process finished. isLoading: false isAuthenticated (React state): ${isAuthenticated} kcInstance.authenticated: ${kcInstance?.authenticated}`);
    }
  }, [pathname, router, isAuthenticated]); // Added isAuthenticated to deps of initSessionAsync

  useEffect(() => {
    console.log(`[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Keycloak ready: ${!!keycloak}, InitAttempted: ${keycloakInitAttemptedRef.current}, Path: ${pathname}`);
    
    if (keycloak) {
      if (!keycloakInitAttemptedRef.current) {
        console.log('[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Init not attempted. Setting ref and calling initSessionAsync.');
        keycloakInitAttemptedRef.current = true; // Mark that we are ATTEMPTING init
        initSessionAsync(keycloak);
      } else {
        // Init has been attempted. Sync state, especially if pathname changed.
        console.log(`[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Init already attempted. Current kc.auth: ${keycloak.authenticated}. Syncing React state.`);
        setIsAuthenticated(!!keycloak.authenticated);
        if (keycloak.authenticated) {
          if (!user && keycloak.token) { // Ensure token exists before trying to load profile
            keycloak.loadUserProfile()
              .then(profile => setUser(profile as UserProfile))
              .catch(() => {
                console.error("[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Error re-loading user profile.");
                setUser(null);
              });
          }
        } else {
          setUser(null);
        }
        // If already initialized, we are not in the initial loading phase anymore
        // unless a new init is somehow triggered (which this ref prevents for kc.init).
        // The isLoading state should primarily be managed by initSessionAsync itself.
        // We can set isLoading to false here if we are sure no async op is pending.
        if(isLoading && typeof keycloak.authenticated !== 'undefined') {
            setIsLoading(false);
        }
      }
    } else if (!isLoading && !keycloak) {
      console.log("[CLIENT] AuthProvider:useEffect[keycloak, pathname] - Keycloak instance not set and not loading. Auth will not proceed.");
      setIsLoading(false); 
    }
  // initSessionAsync is stable if its deps don't change unnecessarily.
  // keycloakInitAttemptedRef will prevent re-running the actual init part of initSessionAsync.
  }, [keycloak, pathname, initSessionAsync, user, isLoading]); 


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
      // Explicitly reset the init attempted ref on logout, so next app load can re-init
      keycloakInitAttemptedRef.current = false; 
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
  }, [keycloak, router, user]); // Added user to re-register handlers if user state changes relevantly

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
      keycloakInitAttemptedRef.current = false; // Reset for next login
      try {
        const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
        await keycloak.logout({ redirectUri });
        // onAuthLogout event handler should handle state clearing
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
