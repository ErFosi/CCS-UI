
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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

  const initializeKeycloak = useCallback(async () => {
    const kcInstance = getKeycloakInstance();
    console.log('Keycloak instance from getKeycloakInstance:', kcInstance);

    if (kcInstance && (kcInstance as any)._config) {
      console.log('Attempting to initialize Keycloak with effective config:', {
        url: (kcInstance as any)._config.url,
        realm: (kcInstance as any)._config.realm,
        clientId: (kcInstance as any)._config.clientId,
      });
    } else if (kcInstance) {
      console.log('Attempting to initialize Keycloak, but _config is not directly accessible on the instance. Using env vars for logging:', {
        url: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
        realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
        clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID,
      });
    }

    if (kcInstance) {
      try {
        let initOptions: Keycloak.KeycloakInitOptions = {
          pkceMethod: 'S256',
          // checkLoginIframe: false, // Can be useful for debugging init issues
        };

        // Check localStorage for tokens from Direct Access Grant
        const storedAccessToken = localStorage.getItem('kc_access_token');
        const storedRefreshToken = localStorage.getItem('kc_refresh_token');
        const storedIdToken = localStorage.getItem('kc_id_token');
        // const storedExpiresIn = localStorage.getItem('kc_expires_in'); // Keycloak usually manages expiry from token itself

        if (storedAccessToken && storedRefreshToken && storedIdToken) {
          console.log('AuthProvider: Found stored tokens from DAG. Initializing Keycloak with these tokens.');
          initOptions = {
            ...initOptions,
            token: storedAccessToken,
            refreshToken: storedRefreshToken,
            idToken: storedIdToken,
            onLoad: 'check-sso', // With tokens provided, 'check-sso' verifies them and updates session
          };
          // Clear tokens from localStorage after they are passed to init
          localStorage.removeItem('kc_access_token');
          localStorage.removeItem('kc_refresh_token');
          localStorage.removeItem('kc_id_token');
          localStorage.removeItem('kc_expires_in');
        } else {
          console.log('AuthProvider: No stored DAG tokens found. Using default init options.');
          initOptions = {
            ...initOptions,
            onLoad: 'check-sso', // Standard check for existing SSO session
            silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : undefined,
          };
        }
        
        console.log('Calling kcInstance.init() with options:', initOptions);
        const authenticated = await kcInstance.init(initOptions);
        console.log('Keycloak init success. Authenticated:', authenticated);

        setIsAuthenticated(authenticated);
        if (authenticated) {
          const profile = await kcInstance.loadUserProfile() as UserProfile;
          setUser(profile);
          console.log('User profile loaded:', profile);
        } else {
          // If not authenticated and tokens were attempted from localStorage, it means they were invalid/expired.
           console.log('Keycloak init: Not authenticated.');
        }
      } catch (error) {
        console.error("Keycloak init() caught an error. Raw error object:", error);

        let errorMessage = "Keycloak initialization failed.";
        let errorDetailsString = "Could not serialize error object.";

        if (error && typeof error === 'object') {
            try {
                errorDetailsString = JSON.stringify(error, Object.getOwnPropertyNames(error));
            } catch (e) {
                 try {
                    errorDetailsString = JSON.stringify(error);
                 } catch (e2) { /* ignore */ }
            }
            console.error("Keycloak init error (raw object serialized to JSON):", errorDetailsString);

            if ('message' in error && typeof (error as any).message === 'string' && (error as any).message) {
                errorMessage += ` Details: ${(error as any).message}`;
            } else if ('error_description' in error && typeof (error as any).error_description === 'string' && (error as any).error_description) {
                errorMessage += ` Details: ${(error as any).error_description}`;
            } else if ('error' in error && typeof (error as any).error === 'string' && (error as any).error) {
                 errorMessage += ` Error type: ${(error as any).error}`;
            } else {
                 errorMessage += " No standard 'message', 'error_description', or 'error' property found on the error object.";
            }
        } else if (typeof error === 'string' && error) {
            errorMessage += ` Details: ${error}`;
        } else {
            errorMessage += " The error caught was not a standard object or string. This could be due to network issues (Keycloak server unreachable), CORS problems (check Keycloak client's 'Web Origins'), or SSL certificate errors if you're using HTTPS with a self-signed certificate (the browser will block this; you need to trust the certificate). Please check your browser's console (Network tab) for more details and ensure your Keycloak server is correctly configured and accessible.";
        }
        
        console.error("Keycloak init error details (summary):", errorMessage);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setKeycloak(kcInstance);
        setIsLoading(false);
        console.log('Keycloak initialization process finished. isLoading:', false);
      }
    } else {
      console.error("Keycloak init error: Failed to get Keycloak instance from getKeycloakInstance().");
      setIsLoading(false);
    }
  }, [router]); // Added router to dependency array if it's used inside (e.g. for redirects on error)

  useEffect(() => {
    initializeKeycloak();
  }, [initializeKeycloak]);


  useEffect(() => {
    if (keycloak) {
      keycloak.onAuthSuccess = () => {
        console.log('Keycloak onAuthSuccess triggered.');
        setIsAuthenticated(true);
        keycloak.loadUserProfile().then(profile => setUser(profile as UserProfile));
      };
      keycloak.onAuthError = (errorData) => {
        console.error("Keycloak onAuthError triggered:", errorData);
        // setIsAuthenticated(false); // This might be too aggressive if it's a recoverable error
        // setUser(null);
      };
      keycloak.onAuthRefreshSuccess = () => {
         console.log('Keycloak onAuthRefreshSuccess triggered.');
      };
      keycloak.onAuthRefreshError = () => {
        console.error("Keycloak onAuthRefreshError: Failed to refresh token. Forcing logout.");
        setIsAuthenticated(false);
        setUser(null);
        keycloak.clearToken();
        // Consider redirecting to login or showing a message
        router.push('/login?sessionExpired=true');
      };
      keycloak.onAuthLogout = () => {
        console.log('Keycloak onAuthLogout triggered.');
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('kc_access_token'); // Clean up DAG tokens on logout
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
        router.push('/login');
      };
      keycloak.onTokenExpired = () => {
        console.log('Keycloak onTokenExpired triggered. Attempting to update token.');
        keycloak.updateToken(30).catch(() => { // 30 seconds min validity
          console.error("Keycloak Token Expired: Failed to update token. Forcing logout.");
          keycloak.logout(); // This will trigger onAuthLogout
        });
      };
    }
  }, [keycloak, router]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
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
      setIsLoading(true); // To show loading state during logout process
      try {
        // Ensure redirectUri is absolute for Keycloak logout
        const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
        await keycloak.logout({ redirectUri });
        // onAuthLogout handler should manage state changes
      } catch (error) {
        console.error("Keycloak logout error:", error);
        // Fallback state cleanup if logout fails to trigger handler
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('kc_access_token');
        localStorage.removeItem('kc_refresh_token');
        localStorage.removeItem('kc_id_token');
        localStorage.removeItem('kc_expires_in');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const register = async (options?: Keycloak.KeycloakRegisterOptions) => {
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
        await keycloak.updateToken(5); // Update if less than 5 seconds validity
        return keycloak.token;
      } catch (error) {
        console.warn("Failed to refresh token or token not available during getToken:", error);
        // Potentially trigger logout or re-authentication if token refresh fails critically
        // For now, just return undefined, higher-level logic can decide action.
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
