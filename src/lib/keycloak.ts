
"use client"; // This module is client-side only

import Keycloak, { type KeycloakProfile } from 'keycloak-js';

let keycloakInstance: Keycloak | null = null;

const getKeycloakInstance = (): Keycloak => {
  if (typeof window !== 'undefined') { // Ensure it runs only on the client
    if (!keycloakInstance) {
      keycloakInstance = new Keycloak({
        url: process.env.NEXT_PUBLIC_KEYCLOAK_URL!,
        realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM!,
        clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID!,
      });
    }
    return keycloakInstance;
  }
  // This case should ideally not be hit if used correctly within client components
  // or after client-side hydration.
  return {
    init: () => Promise.reject(new Error("Keycloak can only be initialized on the client.")),
    login: () => Promise.reject(new Error("Keycloak can only be used on the client.")),
    logout: () => Promise.reject(new Error("Keycloak can only be used on the client.")),
    register: () => Promise.reject(new Error("Keycloak can only be used on the client.")),
    loadUserProfile: () => Promise.reject(new Error("Keycloak can only be used on the client.")),
    // Add other methods with similar dummy implementations if needed for SSR type-checking
  } as unknown as Keycloak;
};

export interface UserProfile extends KeycloakProfile {
  // Add any custom attributes you expect from Keycloak user profile
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
}

export default getKeycloakInstance;
