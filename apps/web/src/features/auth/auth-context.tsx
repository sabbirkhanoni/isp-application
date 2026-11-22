import type {
  AuthUserDto,
  ChangePasswordInput,
  Language,
  LoginInput,
  Permission,
} from '@isp/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useI18n } from '@/i18n/i18n-context';
import { api } from '@/lib/api-client';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthValue {
  status: AuthStatus;
  user: AuthUserDto | null;
  login(input: LoginInput): Promise<void>;
  logout(): Promise<void>;
  changePassword(input: ChangePasswordInput): Promise<void>;
  savePreferredLanguage(language: Language): Promise<void>;
  can(permission: Permission): boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLanguage } = useI18n();
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const adopt = useCallback(
    (next: AuthUserDto | null) => {
      setUser(next);
      setStatus(next ? 'authenticated' : 'anonymous');
      if (next) setLanguage(next.language);
    },
    [setLanguage],
  );

  useEffect(() => {
    api
      .get<AuthUserDto>('/auth/me')
      .then((res) => adopt(res.data))
      .catch(() => adopt(null));
  }, [adopt]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      async login(input) {
        const res = await api.post<AuthUserDto>('/auth/login', input);
        adopt(res.data);
      },
      async logout() {
        await api.post('/auth/logout').catch(() => undefined);
        adopt(null);
      },
      async changePassword(input) {
        await api.post('/auth/change-password', input);
        const res = await api.get<AuthUserDto>('/auth/me');
        adopt(res.data);
      },
      async savePreferredLanguage(language) {
        try {
          const res = await api.patch<AuthUserDto>('/auth/me/preferences', { language });
          setUser(res.data);
        } catch {
          // The UI already switched; failing to persist the preference is not worth interrupting the user.
        }
      },
      can: (permission) => user?.permissions.includes(permission) ?? false,
    }),
    [status, user, adopt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
