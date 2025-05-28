
'use server';

/**
 * Server Action to log a token to the server console.
 * @param token The token string to log.
 */
export async function logTokenOnServer(token: string | undefined): Promise<void> {
  if (token) {
    console.log('[SERVER LOG] Keycloak Access Token:', token);
  } else {
    console.log('[SERVER LOG] Attempted to log token, but token was undefined.');
  }
}
