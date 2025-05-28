
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
        console.log('Calling kcInstance.init() with simplified options (pkceMethod only)...');
        // Simplified init call for debugging:
        const authenticated = await kcInstance.init({ 
          pkceMethod: 'S256'
        });
        console.log('Keycloak init success. Authenticated:', authenticated);
        
        setIsAuthenticated(authenticated);
        if (authenticated) {
          const profile = await kcInstance.loadUserProfile() as UserProfile;
          setUser(profile);
          console.log('User profile loaded:', profile);
        }
      } catch (error) {
        console.error("Keycloak init() caught an error. Raw error object:", error);

        let errorMessage = "Keycloak initialization failed.";
        let errorDetailsString = "Could not serialize error object.";

        if (error && typeof error === 'object') {
            try {
                // Attempt to serialize all properties of the error object
                errorDetailsString = JSON.stringify(error, Object.getOwnPropertyNames(error));
                console.error("Keycloak init error (raw object serialized to JSON):", errorDetailsString);
            } catch (e) {
                console.error("Could not fully serialize error object with getOwnPropertyNames. Attempting basic JSON.stringify.");
                 try {
                    errorDetailsString = JSON.stringify(error);
                    console.error("Keycloak init error (raw object basic JSON.stringify):", errorDetailsString);
                 } catch (e2) {
                    console.error("Basic JSON.stringify of error object also failed.");
                 }
            }

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
        
        console.error("Keycloak init error details (summary):", errorMessage, "Full error object shown above.");
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
  }, []);

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
        setIsAuthenticated(false);
        setUser(null);
      };
      keycloak.onAuthRefreshSuccess = () => {
         console.log('Keycloak onAuthRefreshSuccess triggered.');
      };
      keycloak.onAuthRefreshError = () => {
        console.error("Keycloak onAuthRefreshError: Failed to refresh token. Logging out.");
        setIsAuthenticated(false);
        setUser(null);
        keycloak.clearToken(); 
      };
      keycloak.onAuthLogout = () => {
        console.log('Keycloak onAuthLogout triggered.');
        setIsAuthenticated(false);
        setUser(null);
        router.push('/login'); 
      };
      keycloak.onTokenExpired = () => {
        console.log('Keycloak onTokenExpired triggered. Attempting to update token.');
        keycloak.updateToken(30).catch(() => {
          console.error("Keycloak Token Expired: Failed to update token. Logging out.");
          keycloak.logout();
        });
      };
    }
  }, [keycloak, router]);

  const login = async (options?: Keycloak.KeycloakLoginOptions) => {
    if (keycloak) {
      setIsLoading(true);
      try {
        // For Direct Access Grant flow in login-form.tsx, this .login() might not be directly used
        // but it's here if you switch to Keycloak's login page.
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
        await keycloak.logout({ redirectUri: typeof window !== 'undefined' ? window.location.origin + '/login' : undefined });
      } catch (error) {
        console.error("Keycloak logout error:", error);
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
        await keycloak.updateToken(5); 
        return keycloak.token;
      } catch (error) {
        console.error("Failed to refresh token or token not available", error);
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
