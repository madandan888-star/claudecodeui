import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { IS_PLATFORM } from '../../../constants/config';
import { api } from '../../../utils/api';
import { AUTH_ERROR_MESSAGES, AUTH_TOKEN_STORAGE_KEY } from '../constants';
import type {
  AuthContextValue,
  AuthProviderProps,
  AuthSessionPayload,
  AuthStatusPayload,
  AuthUser,
  AuthUserPayload,
  OnboardingStatusPayload,
} from '../types';
import { parseJsonSafely, resolveApiErrorMessage } from '../utils';
import { setToken as setInMemoryToken, clearToken as clearInMemoryToken } from '../../../utils/tokenStore';

const AuthContext = createContext<AuthContextValue | null>(null);
const ALLOWED_PROJECTS_STORAGE_KEY = 'allowed-projects';

const readStoredToken = (): string | null => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

const persistToken = (token: string) => {
  setInMemoryToken(token);
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
};

const persistAllowedProjects = (allowedProjects: unknown) => {
  if (allowedProjects === undefined) {
    return;
  }

  localStorage.setItem(ALLOWED_PROJECTS_STORAGE_KEY, JSON.stringify(allowedProjects ?? []));
};

const clearStoredToken = () => {
  clearInMemoryToken();
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(ALLOWED_PROJECTS_STORAGE_KEY);
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setSession = useCallback((nextUser: AuthUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    persistToken(nextToken);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStoredToken();
  }, []);

  const applyPlatformFallbackUser = useCallback(() => {
    setUser({ username: 'platform-user' });
    setNeedsSetup(false);
  }, []);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      const response = await api.user.onboardingStatus();
      if (!response.ok) {
        return;
      }

      const payload = await parseJsonSafely<OnboardingStatusPayload>(response);
      setHasCompletedOnboarding(Boolean(payload?.hasCompletedOnboarding));
    } catch (caughtError) {
      console.error('Error checking onboarding status:', caughtError);
      // Fail open to avoid blocking access on transient onboarding status errors.
      setHasCompletedOnboarding(true);
    }
  }, []);

  const refreshOnboardingStatus = useCallback(async () => {
    await checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  const handleYpbotLogin = useCallback(
    async (ypbotToken: string): Promise<boolean> => {
      try {
        const response = await fetch('/api/auth/ypbot-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: ypbotToken }),
        });
        const payload = await parseJsonSafely<
          AuthSessionPayload & {
            allowedProjects?: unknown;
          }
        >(response);

        if (!response.ok || !payload?.token || !payload.user) {
          console.error('[Auth] ypbot token exchange failed:', response.status);
          return false;
        }

        setSession(payload.user, payload.token);
        persistAllowedProjects(payload.allowedProjects);
        setNeedsSetup(false);
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
        await checkOnboardingStatus();
        return true;
      } catch (caughtError) {
        console.error('[Auth] ypbot login error:', caughtError);
        return false;
      }
    },
    [checkOnboardingStatus, setSession],
  );

  const checkAuthStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const statusResponse = await api.auth.status();
      const statusPayload = await parseJsonSafely<AuthStatusPayload>(statusResponse);

      if (statusPayload?.needsSetup) {
        setNeedsSetup(true);
        return;
      }

      setNeedsSetup(false);

      if (!token) {
        return;
      }

      const userResponse = await api.auth.user();
      if (!userResponse.ok) {
        clearSession();
        return;
      }

      const userPayload = await parseJsonSafely<AuthUserPayload>(userResponse);
      if (!userPayload?.user) {
        clearSession();
        return;
      }

      setUser(userPayload.user);
      await checkOnboardingStatus();
    } catch (caughtError) {
      console.error('[Auth] Auth status check failed:', caughtError);
      setError(AUTH_ERROR_MESSAGES.authStatusCheckFailed);
    } finally {
      setIsLoading(false);
    }
  }, [checkOnboardingStatus, clearSession, token]);

  useEffect(() => {
    const ypbotToken = new URLSearchParams(window.location.search).get('ypbot_token');

    const initializeAuth = async () => {
      if (ypbotToken) {
        const loggedIn = await handleYpbotLogin(ypbotToken);
        if (loggedIn) {
          setIsLoading(false);
          return;
        }
        // ypbot token was present but login failed (expired/invalid).
        // Clear any stale stored session to prevent falling through to
        // checkAuthStatus with an old unrestricted token.
        clearSession();
      }

      if (IS_PLATFORM) {
        try {
          const existingToken = readStoredToken();
          if (existingToken) {
            const userResponse = await api.auth.user();
            if (userResponse.ok) {
              const userPayload = await parseJsonSafely<AuthUserPayload>(userResponse);
              if (userPayload?.user) {
                setUser(userPayload.user);
                setNeedsSetup(false);
                await checkOnboardingStatus();
                return;
              }
            }
            clearSession();
          }

          applyPlatformFallbackUser();
          await checkOnboardingStatus();
        } catch (caughtError) {
          console.error('[Auth] Platform init error:', caughtError);
          applyPlatformFallbackUser();
        } finally {
          setIsLoading(false);
        }
        return;
      }

      await checkAuthStatus();
    };

    void initializeAuth();
  }, [applyPlatformFallbackUser, checkAuthStatus, checkOnboardingStatus, clearSession, handleYpbotLogin]);

  const login = useCallback<AuthContextValue['login']>(
    async (username, password) => {
      try {
        setError(null);
        const response = await api.auth.login(username, password);
        const payload = await parseJsonSafely<AuthSessionPayload>(response);

        if (!response.ok || !payload?.token || !payload.user) {
          const message = resolveApiErrorMessage(payload, AUTH_ERROR_MESSAGES.loginFailed);
          setError(message);
          return { success: false, error: message };
        }

        setSession(payload.user, payload.token);
        setNeedsSetup(false);
        await checkOnboardingStatus();
        return { success: true };
      } catch (caughtError) {
        console.error('Login error:', caughtError);
        setError(AUTH_ERROR_MESSAGES.networkError);
        return { success: false, error: AUTH_ERROR_MESSAGES.networkError };
      }
    },
    [checkOnboardingStatus, setSession],
  );

  const register = useCallback<AuthContextValue['register']>(
    async (username, password) => {
      try {
        setError(null);
        const response = await api.auth.register(username, password);
        const payload = await parseJsonSafely<AuthSessionPayload>(response);

        if (!response.ok || !payload?.token || !payload.user) {
          const message = resolveApiErrorMessage(payload, AUTH_ERROR_MESSAGES.registrationFailed);
          setError(message);
          return { success: false, error: message };
        }

        setSession(payload.user, payload.token);
        setNeedsSetup(false);
        await checkOnboardingStatus();
        return { success: true };
      } catch (caughtError) {
        console.error('Registration error:', caughtError);
        setError(AUTH_ERROR_MESSAGES.networkError);
        return { success: false, error: AUTH_ERROR_MESSAGES.networkError };
      }
    },
    [checkOnboardingStatus, setSession],
  );

  const logout = useCallback(() => {
    const tokenToInvalidate = token;
    clearSession();

    if (tokenToInvalidate) {
      void api.auth.logout().catch((caughtError: unknown) => {
        console.error('Logout endpoint error:', caughtError);
      });
    }
  }, [clearSession, token]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      needsSetup,
      hasCompletedOnboarding,
      error,
      login,
      register,
      logout,
      refreshOnboardingStatus,
    }),
    [
      error,
      hasCompletedOnboarding,
      isLoading,
      login,
      logout,
      needsSetup,
      refreshOnboardingStatus,
      register,
      token,
      user,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
