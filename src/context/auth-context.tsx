
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname
import getKeycloakInstance, { type UserProfile } from '@/lib/keycloak';
import type Keycloak from 'keycloak-js';

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
  const pathname = usePathname(); // Get current pathname

  // Effect to set the Keycloak instance object once
  useEffect(() => {
    const kc = getKeycloakInstance();
    console.log('AuthProvider: Setting Keycloak instance:', kc);
    setKeycloak(kc);
  }, []);

  const initializeKeycloak = useCallback(async () => {
    if (!keycloak) {
      console.log('AuthProvider initializeKeycloak: Keycloak instance not yet available. Waiting...');
      // We need to ensure isLoading remains true until keycloak instance is set and init tried.
      // If keycloak is null, this function will be called again once it's set.
      return;
    }

    console.log('AuthProvider initializeKeycloak: Starting initialization/check for path:', pathname);
    setIsLoading(true);

    try {
      let initOptions: Keycloak.KeycloakInitOptions = {
        pkceMethod: 'S256',
      };

      const storedAccessToken = localStorage.getItem('kc_access_token');
      const storedRefreshToken = localStorage.getItem('kc_refresh_token');
      const storedIdToken = localStorage.getItem('kc_id_token');

      if (storedAccessToken && storedRefreshToken && storedIdToken) {
        console.log('AuthProvider: Found stored tokens from Direct Access Grant. Initializing Keycloak with these tokens.');
        initOptions = {
          ...initOptions,
          token: storedAccessToken,
          refreshToken: storedRefreshToken,
          idToken: storedIdToken,
          // onLoad: 'check-sso', // When tokens are provided, init itself checks their validity.
        };
        // Clear tokens from localStorage after they are passed to init, so they are used only once for this init
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in'); // Also remove this if set
      } else {
        console.log('AuthProvider: No stored DAG tokens found. Using default init options (check-sso).');
        initOptions = {
          ...initOptions,
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
        };
      }
      
      console.log('AuthProvider: Calling keycloak.init() with options:', initOptions);
      const authenticated = await keycloak.init(initOptions);
      console.log('AuthProvider: Keycloak init success. Authenticated:', authenticated);

      setIsAuthenticated(authenticated);
      if (authenticated) {
        const profile = await keycloak.loadUserProfile() as UserProfile;
        setUser(profile);
        console.log('AuthProvider: User profile loaded:', profile);
      } else {
        console.log('AuthProvider: Keycloak init determined user is not authenticated.');
      }
    } catch (error: any) {
      console.error("Keycloak init() caught an error. Raw error object:", error);
      let errorMessage = "Keycloak initialization failed.";
      let errorDetailsString = "Could not serialize error object.";

      if (error && typeof error === 'object') {
          try {
              errorDetailsString = JSON.stringify(error, Object.getOwnPropertyNames(error));
          } catch (e) { try { errorDetailsString = JSON.stringify(error); } catch (e2) { /* ignore */ } }
          console.error("Keycloak init error (raw object serialized to JSON):", errorDetailsString);

          if (error.message) { errorMessage += ` Details: ${error.message}`; }
          else if (error.error_description) { errorMessage += ` Details: ${error.error_description}`; }
          else if (error.error) { errorMessage += ` Error type: ${error.error}`; }
          else { errorMessage += " No standard 'message', 'error_description', or 'error' property found. This might be due to network issues (Keycloak server unreachable), CORS problems, or SSL certificate errors. Check browser Network tab.";}
      } else if (typeof error === 'string' && error) {
          errorMessage += ` Details: ${error}`;
      } else {
          errorMessage += " The error was not a standard object or string. Check network, CORS, SSL.";
      }
      
      console.error("Keycloak init error details (summary):", errorMessage);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log('AuthProvider: Keycloak initialization process finished. isLoading:', false, 'isAuthenticated (from state):', isAuthenticated, 'keycloak.authenticated:', keycloak?.authenticated);
    }
  }, [keycloak, router, pathname]); // Added pathname to dependencies, so this callback is re-created on path change

  // Effect to run initializeKeycloak when pathname changes or when the keycloak instance is first set
  useEffect(() => {
    if (keycloak) { // Only run if keycloak instance is available
        console.log("AuthProvider: Pathname or keycloak instance changed, triggering initializeKeycloak.");
        initializeKeycloak();
    } else {
        console.log("AuthProvider: Waiting for keycloak instance to be set before initializing.");
        // isLoading should remain true until keycloak is set and init attempted
    }
  }, [pathname, keycloak, initializeKeycloak]);

  // Effect to set up Keycloak event handlers
  useEffect(() => {
    if (keycloak) {
      keycloak.onAuthSuccess = () => {
        console.log('Keycloak onAuthSuccess triggered.');
        // initializeKeycloak will handle setting isAuthenticated and user profile on successful init
        // but we can re-verify here or trigger an update if needed.
        // For instance, if init was called with tokens, this might fire.
        if (!isAuthenticated && keycloak.authenticated) {
          setIsAuthenticated(true);
          keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile));
        }
      };
      keycloak.onAuthError = (errorData) => {
        console.error("Keycloak onAuthError triggered:", errorData);
        // This might indicate a problem during login or token refresh.
        // Potentially clear state if it's a critical error.
      };
      keycloak.onAuthRefreshSuccess = () => {
         console.log('Keycloak onAuthRefreshSuccess triggered.');
      };
      keycloak.onAuthRefreshError = () => {
        console.error("Keycloak onAuthRefreshError: Failed to refresh token. Forcing logout.");
        keycloak.clearToken(); // Clear stored tokens in keycloak-js
        setIsAuthenticated(false);
        setUser(null);
        router.push('/login?sessionExpired=true');
      };
      keycloak.onAuthLogout = () => {
        console.log('Keycloak onAuthLogout triggered.');
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('kc_access_token'); 
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
        // router.push('/login'); // Keycloak logout itself usually handles redirect via redirectUri
      };
      keycloak.onTokenExpired = () => {
        console.log('Keycloak onTokenExpired triggered. Attempting to update token.');
        keycloak.updateToken(30).catch(() => { 
          console.error("Keycloak Token Expired: Failed to update token. Forcing logout.");
          keycloak.logout(); 
        });
      };
    }
    // Cleanup function for event handlers if keycloak instance changes or component unmounts
    return () => {
        if (keycloak) {
            keycloak.onAuthSuccess = undefined;
            keycloak.onAuthError = undefined;
            keycloak.onAuthRefreshSuccess = undefined;
            keycloak.onAuthRefreshError = undefined;
            keycloak.onAuthLogout = undefined;
            keycloak.onTokenExpired = undefined;
        }
    }
  }, [keycloak, router, isAuthenticated]); // Added isAuthenticated to re-evaluate if needed

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    // This login function is for redirect-based login, not used by the current form.
    if (keycloak) {
      setIsLoading(true);
      try {
        await keycloak.login(options);
      } catch (error) {
        console.error("Keycloak login method error:", error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const logout = async () => {
    if (keycloak) {
      setIsLoading(true); 
      try {
        const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
        await keycloak.logout({ redirectUri });
      } catch (error) {
        console.error("Keycloak logout error:", error);
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
        setIsLoading(false); // Ensure loading is false on error too
      }
      // No finally setIsLoading(false) here as logout redirects. State will reset on new page context.
    }
  };

  const register = async (options?: Keycloak.KeycloakRegisterOptions) => {
    // This is for redirect-based registration.
    if (keycloak) {
      setIsLoading(true);
      try {
        await keycloak.register(options);
      } catch (error) {
        console.error("Keycloak register error:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const getToken = async (): Promise<string | undefined> => {
    if (keycloak && keycloak.token) {
      try {
        await keycloak.updateToken(5); 
        return keycloak.token;
      } catch (error) {
        console.warn("Failed to refresh token or token not available during getToken:", error);
        // Consider triggering logout if critical
        // For now, return undefined.
        return undefined;
      }
    }
    return undefined;
  };

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

    