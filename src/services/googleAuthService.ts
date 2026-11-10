/**
 * Google Authentication & Unified OAuth 2.0 Service for Memory Hub
 *
 * Provides Google Sign-In with scopes covering:
 * - Google Drive (dedicated folder /MemoryHub for file & audio sync across devices)
 * - Google Calendar (view events & sync two-way tasks - FR-8.1 - FR-8.4)
 * - Gmail (read-only allowed labels/senders - FR-9.1 - FR-9.4)
 * - User Profile & Email
 */

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const;

export interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string;
  sub: string;
}

export interface GoogleSignInResult {
  success: boolean;
  accessToken?: string;
  tokenExpiresAt?: number;
  user?: GoogleUserProfile;
  error?: string;
  scopes?: string[];
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              expires_in?: number;
              scope?: string;
            }) => void;
            error_callback?: (err: unknown) => void;
            prompt?: string;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let gisScriptLoadingPromise: Promise<void> | null = null;

/**
 * Dynamically loads the official Google Identity Services client script
 */
export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisScriptLoadingPromise) {
    return gisScriptLoadingPromise;
  }

  gisScriptLoadingPromise = new Promise((resolve, reject) => {
    // Check if script element already exists
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (err) => reject(err));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(new Error(`Failed to load Google Identity Services: ${String(err)}`));
    document.head.appendChild(script);
  });

  return gisScriptLoadingPromise;
}

/**
 * Fetches Google User Profile information using an active OAuth access token
 */
export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Google user profile (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    email: data.email || '',
    name: data.name || data.given_name || data.email || 'Google User',
    picture: data.picture,
    sub: data.sub || '',
  };
}

/**
 * Triggers Google Sign-In using Google Identity Services Token Client
 */
export async function signInWithGoogleOAuth(
  clientId: string,
  customScopes?: string[]
): Promise<GoogleSignInResult> {
  if (!clientId || clientId.trim() === '') {
    return {
      success: false,
      error: 'Google Client ID is missing. Please enter your OAuth 2.0 Web Client ID in Settings.',
    };
  }

  try {
    await loadGoogleIdentityServices();

    if (!window.google?.accounts?.oauth2) {
      return {
        success: false,
        error: 'Google Identity Services could not be initialized.',
      };
    }

    const scopeList = (customScopes && customScopes.length > 0 ? customScopes : GOOGLE_SCOPES).join(' ');

    return new Promise((resolve) => {
      try {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: scopeList,
          prompt: 'consent',
          callback: async (response) => {
            if (response.error) {
              resolve({
                success: false,
                error: `Google authorization failed: ${response.error}`,
              });
              return;
            }

            if (!response.access_token) {
              resolve({
                success: false,
                error: 'No access token received from Google.',
              });
              return;
            }

            const accessToken = response.access_token;
            const expiresInSec = response.expires_in || 3600;
            const tokenExpiresAt = Date.now() + expiresInSec * 1000;
            const grantedScopes = response.scope ? response.scope.split(' ') : [...GOOGLE_SCOPES];

            try {
              const user = await fetchGoogleUserProfile(accessToken);
              resolve({
                success: true,
                accessToken,
                tokenExpiresAt,
                user,
                scopes: grantedScopes,
              });
            } catch (userErr: any) {
              // Token succeeded, fallback user profile if endpoint fails
              resolve({
                success: true,
                accessToken,
                tokenExpiresAt,
                user: {
                  email: 'google-user@memoryhub.app',
                  name: 'Google Account User',
                  sub: 'google-authenticated',
                },
                scopes: grantedScopes,
              });
            }
          },
          error_callback: (err) => {
            resolve({
              success: false,
              error: typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err),
            });
          },
        });

        client.requestAccessToken();
      } catch (err: any) {
        resolve({
          success: false,
          error: err?.message || 'Failed to request Google access token.',
        });
      }
    });
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to load Google authentication.',
    };
  }
}

/**
 * Validates a manually supplied access token by retrieving the user's profile
 */
export async function validateGoogleAccessToken(accessToken: string): Promise<GoogleSignInResult> {
  if (!accessToken || !accessToken.trim()) {
    return { success: false, error: 'No access token provided.' };
  }

  try {
    const user = await fetchGoogleUserProfile(accessToken.trim());
    return {
      success: true,
      accessToken: accessToken.trim(),
      tokenExpiresAt: Date.now() + 3600 * 1000,
      user,
      scopes: [...GOOGLE_SCOPES],
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Invalid or expired Google access token.',
    };
  }
}

/**
 * Revokes the Google OAuth access token
 */
export function revokeGoogleAccessToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2 && token) {
      try {
        window.google.accounts.oauth2.revoke(token, () => resolve());
        return;
      } catch {
        // Ignore
      }
    }
    resolve();
  });
}
