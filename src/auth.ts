import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';

const API_URL = (process.env.EXPO_PUBLIC_FASHION_CANVAS_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const AUTH_STORAGE_KEY = 'fashion-canvas-auth-v1';

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: { username: string; approved: boolean };
};

type ApiError = { error?: unknown };

export async function loadSession(): Promise<AuthSession | null> {
  const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  if (!stored) return null;
  try {
    const session = JSON.parse(stored) as Partial<AuthSession>;
    if (
      typeof session.token !== 'string' ||
      typeof session.expiresAt !== 'string' ||
      typeof session.user?.username !== 'string' ||
      typeof session.user.approved !== 'boolean' ||
      !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= Date.now()
    ) {
      await clearSession();
      return null;
    }
    return session as AuthSession;
  } catch {
    await clearSession();
    return null;
  }
}

export async function saveSession(session: AuthSession) {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export async function clearSession() {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const response = await request('/api/auth/login', { username, password });
  const value = response.value as Partial<AuthSession>;
  if (
    !response.ok ||
    typeof value.token !== 'string' ||
    typeof value.expiresAt !== 'string' ||
    typeof value.user?.username !== 'string' ||
    typeof value.user.approved !== 'boolean'
  ) {
    throw new Error(response.message ?? 'The login response was invalid.');
  }
  return value as AuthSession;
}

export async function register(username: string, password: string): Promise<string> {
  const response = await request('/api/auth/register', { username, password });
  if (!response.ok) throw new Error(response.message ?? 'Registration failed.');
  return 'Registration complete. Your account must be approved before uploads are enabled.';
}

async function request(path: string, body: Record<string, string>) {
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      'The Fashion Canvas server is unavailable. Check your connection and try again.',
    );
  }
  let payload: ApiError & Record<string, unknown> = {};
  try {
    payload = JSON.parse(await response.text()) as ApiError & Record<string, unknown>;
  } catch {
    // The status-based fallback below remains useful for non-JSON proxy errors.
  }
  return {
    ok: response.ok,
    value: payload,
    message:
      typeof payload.error === 'string'
        ? payload.error
        : response.ok
          ? undefined
          : `Authentication failed (HTTP ${response.status}).`,
  };
}
