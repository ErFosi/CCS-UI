
'use server';

/**
 * Server Action to log a token to the server console.
 * @param token The token string to log.
 */
export async function logTokenOnServer(token: string | undefined): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`<<<<<< [SERVER ACTION LOG - ${timestamp}] Entered logTokenOnServer >>>>>>`);
  if (token) {
    // WARNING: Logging full tokens, even on the server, can be a security risk if logs are not properly secured.
    // For production, consider logging only a part of the token or metadata.
    console.log(`<<<<<< [SERVER ACTION LOG - ${timestamp}] Keycloak Access Token (prefix): ${token.substring(0, 20)}... >>>>>>`);
    // console.log(`<<<<<< [SERVER ACTION LOG - ${timestamp}] Full Token (FOR DEBUGGING ONLY): ${token} >>>>>>`); // Uncomment for extreme debugging
  } else {
    console.log(`<<<<<< [SERVER ACTION LOG - ${timestamp}] Attempted to log token, but token was UNDEFINED. >>>>>>`);
  }
  console.log(`<<<<<< [SERVER ACTION LOG - ${timestamp}] Exiting logTokenOnServer >>>>>>`);
}
