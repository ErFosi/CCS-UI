
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import getKeycloakInstance, { type UserProfile } from '@/lib/keycloak';
import type Keycloak from 'keycloak-js';
import { logTokenOnServer } from '@/lib/server-actions/auth-actions'; // Import the server action

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
      setIsLoading(false); // Ensure loading is false if already initialized
      return;
    }

    console.log('[CLIENT] AuthProvider:initializeKeycloak - Starting initialization process for path:', pathname);
    setIsLoading(true);

    try {
      let initOptions: Keycloak.KeycloakInitOptions = {
        pkceMethod: 'S256',
      };

      const storedAccessToken = localStorage.getItem('kc_access_token');
      const storedRefreshToken = localStorage.getItem('kc_refresh_token');
      const storedIdToken = localStorage.getItem('kc_id_token');

      if (storedAccessToken && storedRefreshToken && storedIdToken) {
        console.log('[CLIENT] AuthProvider:initializeKeycloak - Found stored tokens from Direct Access Grant. Initializing Keycloak with these tokens.');
        initOptions = {
          ...initOptions,
          token: storedAccessToken,
          refreshToken: storedRefreshToken,
          idToken: storedIdToken,
        };
        // Clear tokens after use to prevent re-use on next full init
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
        console.log('[CLIENT] AuthProvider:initializeKeycloak - Stored DAG tokens cleared from localStorage.');
      } else {
        console.log('[CLIENT] AuthProvider:initializeKeycloak - No stored DAG tokens found. Using default init options (check-sso).');
        initOptions = {
          ...initOptions,
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
        };
      }
      
      console.log('[CLIENT] AuthProvider:initializeKeycloak - Calling keycloak.init() with options:', JSON.stringify(initOptions));
      const authenticated = await keycloak.init(initOptions);
      console.log('[CLIENT] AuthProvider:initializeKeycloak - Keycloak init success. Authenticated flag from init:', authenticated);
      setIsKeycloakInitialized(true); // Set initialized flag HERE
      setIsAuthenticated(authenticated);
      console.log('[CLIENT] AuthProvider:initializeKeycloak - isAuthenticated state set to:', authenticated);


      if (authenticated) {
        console.log('[CLIENT] AuthProvider:initializeKeycloak - User is authenticated. Loading profile...');
        const profile = await keycloak.loadUserProfile() as UserProfile;
        setUser(profile);
        console.log('[CLIENT] AuthProvider:initializeKeycloak - User profile loaded:', profile);
      } else {
        console.log('[CLIENT] AuthProvider:initializeKeycloak - Keycloak init determined user is NOT authenticated.');
        setUser(null);
      }
    } catch (error: any) {
      console.error("[CLIENT] AuthProvider:initializeKeycloak - Keycloak init() caught an error. Raw error object:", error);
      let errorMessage = "Keycloak initialization failed.";
      let errorDetailsString = "Could not serialize error object.";

      if (error && typeof error === 'object') {
          try { errorDetailsString = JSON.stringify(error, Object.getOwnPropertyNames(error)); }
          catch (e) { try { errorDetailsString = JSON.stringify(error); } catch (e2) { /* ignore */ } }
          console.error("[CLIENT] AuthProvider:initializeKeycloak - Keycloak init error (raw object serialized to JSON):", errorDetailsString);

          if (error.message) { errorMessage += ` Details: ${error.message}`; }
          else if (error.error_description) { errorMessage += ` Details: ${error.error_description}`; }
          else if (error.error) { errorMessage += ` Error type: ${error.error}`; }
          else { errorMessage += " No standard 'message', 'error_description', or 'error' property found. Check browser Network tab and Keycloak server logs.";}
      } else if (typeof error === 'string' && error) {
          errorMessage += ` Details: ${error}`;
      } else {
          errorMessage += " The error was not a standard object or string. Check network, CORS, SSL, and Keycloak server logs.";
      }
      
      console.error("[CLIENT] AuthProvider:initializeKeycloak - Keycloak init error details (summary):", errorMessage);
      setIsKeycloakInitialized(true); // Still mark as initialized to prevent loops, but with error
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log('[CLIENT] AuthProvider:initializeKeycloak - Initialization process finished. isLoading:', false, 'isAuthenticated (state):', isAuthenticated, 'keycloak.authenticated (instance):', keycloak?.authenticated, 'isKeycloakInitialized (flag):', isKeycloakInitialized);
    }
  }, [keycloak, pathname, isKeycloakInitialized, isAuthenticated]); // Added isAuthenticated to ensure it re-evaluates if that changes from outside

  useEffect(() => {
    console.log(`[CLIENT] AuthProvider:useEffect[pathname, keycloak, isKeycloakInitialized] - Pathname: ${pathname}, Keycloak ready: ${!!keycloak}, Initialized: ${isKeycloakInitialized}`);
    if (keycloak && !isKeycloakInitialized) {
        console.log("[CLIENT] AuthProvider:useEffect[pathname, keycloak, isKeycloakInitialized] - Keycloak instance available and not yet initialized. Triggering initializeKeycloak.");
        initializeKeycloak();
    } else if (!keycloak && !isKeycloakInitialized) {
        console.log("[CLIENT] AuthProvider:useEffect[pathname, keycloak, isKeycloakInitialized] - Waiting for keycloak instance to be set before initializing. Setting isLoading to true.");
        setIsLoading(true); // Ensure loading is true if keycloak not yet set
    } else if (keycloak && isKeycloakInitialized) {
        console.log("[CLIENT] AuthProvider:useEffect[pathname, keycloak, isKeycloakInitialized] - Keycloak instance available and already initialized. Setting isLoading to false.");
        setIsLoading(false); // Ensure loading is false if already initialized
    }
  }, [pathname, keycloak, initializeKeycloak, isKeycloakInitialized]);

  // Dedicated useEffect for logging token once authenticated and token is available
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
    } else if (!isAuthenticated) {
        console.log(`[CLIENT] AuthProvider:useEffect[isAuthenticated, keycloak.token] - User is NOT authenticated. No token to log.`);
    }
  }, [isAuthenticated, keycloak?.token, keycloak]); // Watch keycloak instance itself too, in case token becomes available on it

  useEffect(() => {
    if (!keycloak) return;

    const onAuthSuccess = () => {
      console.log('[CLIENT] Keycloak EVENT: onAuthSuccess triggered.');
      setIsAuthenticated(!!keycloak.authenticated);
      console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - isAuthenticated state set to:', !!keycloak.authenticated);
      if (keycloak.authenticated) {
        keycloak.loadUserProfile().then(profile => {
          setUser(profile as UserProfile);
          console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - User profile loaded:', profile as UserProfile);
        });
      } else {
        setUser(null);
        console.log('[CLIENT] Keycloak EVENT: onAuthSuccess - User not authenticated, profile set to null.');
      }
    };
    const onAuthError = (errorData: Keycloak.KeycloakError) => {
      console.error("[CLIENT] Keycloak EVENT: onAuthError triggered. Error data:", errorData);
      setIsAuthenticated(false);
      setUser(null);
    };
    const onAuthRefreshSuccess = () => {
       console.log('[CLIENT] Keycloak EVENT: onAuthRefreshSuccess triggered.');
       // Token logging for refresh will be handled by the dedicated useEffect watching keycloak.token
    };
    const onAuthRefreshError = () => {
      console.error("[CLIENT] Keycloak EVENT: onAuthRefreshError - Failed to refresh token. Forcing logout.");
      keycloak.clearToken(); // Clear token explicitly
      setIsAuthenticated(false);
      setUser(null);
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
      setIsKeycloakInitialized(false); // Allow re-init
      console.log('[CLIENT] Keycloak EVENT: onAuthLogout - States reset, DAG tokens cleared from localStorage, isKeycloakInitialized set to false.');
    };
    const onTokenExpired = () => {
      console.log('[CLIENT] Keycloak EVENT: onTokenExpired triggered. Attempting to update token...');
      keycloak.updateToken(30).catch(() => { 
        console.error("[CLIENT] Keycloak EVENT: onTokenExpired - Failed to update token after expiry. Forcing logout.");
        keycloak.logout(); 
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
        if(keycloak) {
            // It's good practice to nullify handlers on cleanup, though keycloak-js might handle this.
            keycloak.onAuthSuccess = null;
            keycloak.onAuthError = null;
            keycloak.onAuthRefreshSuccess = null;
            keycloak.onAuthRefreshError = null;
            keycloak.onAuthLogout = null;
            keycloak.onTokenExpired = null;
        }
    }

  }, [keycloak, router]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      console.log('[CLIENT] AuthProvider:login - Login attempt initiated.');
      setIsLoading(true);
      try {
        setIsKeycloakInitialized(false); // Allow re-init after redirect
        await keycloak.login(options);
        // login usually redirects, so code after this might not run if successful.
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
        // onAuthLogout handler should manage state changes.
      } catch (error) {
        console.error("[CLIENT] AuthProvider:logout - Keycloak logout error:", error);
        setIsLoading(false); // Ensure loading is false if logout fails to redirect
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
        setIsKeycloakInitialized(false); // Allow re-init after redirect
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
    console.log('[CLIENT] AuthProvider:getToken - getToken called.');
    if (!keycloak) {
      console.warn("[CLIENT] AuthProvider:getToken - Keycloak instance not available.");
      return undefined;
    }
    if (!keycloak.authenticated) {
      console.warn("[CLIENT] AuthProvider:getToken - User not authenticated, token not requested.");
      return undefined;
    }
    if (!keycloak.token) {
      console.warn("[CLIENT] AuthProvider:getToken - Keycloak is authenticated but token is not immediately available. This might be transient.");
      // Attempt to update if token is missing, as a fallback.
      // Minimum validity 5 seconds, or refresh if missing.
      try {
        console.log("[CLIENT] AuthProvider:getToken - Attempting token update because keycloak.token is falsy.");
        const refreshed = await keycloak.updateToken(5);
        if (refreshed) {
          console.log('[CLIENT] AuthProvider:getToken - Token was refreshed successfully.');
        } else {
          console.log('[CLIENT] AuthProvider:getToken - Token not refreshed (either still valid or refresh failed).');
        }
      } catch (error) {
        console.warn("[CLIENT] AuthProvider:getToken - Failed to refresh token:", error);
        return undefined; // Or handle error more actively, e.g., logout
      }
    }
    
    // If token is still not available after potential refresh, log and return.
    if (!keycloak.token) {
      console.warn("[CLIENT] AuthProvider:getToken - Token is still not available after potential refresh.");
      return undefined;
    }
    
    console.log(`[CLIENT] AuthProvider:getToken - Returning token (prefix): ${keycloak.token.substring(0, 20)}...`);
    return keycloak.token;
  }, [keycloak]);


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
