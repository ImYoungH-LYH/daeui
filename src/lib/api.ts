// Client for the DaeUI backend (server/). Absent when the UI is deployed as static files.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public output?: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // Non-JSON response.
  }
  if (!res.ok) throw new ApiError((data.error as string) || `HTTP ${res.status}`, res.status, data.output as string | undefined);
  return data as T;
}

export interface AuthState {
  setup: boolean;
  authed: boolean;
  version: string;
}

export interface GeoFile {
  size: number;
  modTime?: string;
}

export interface DaeStatus {
  installed: boolean;
  version: string;
  running: boolean;
  pid?: number;
  startedAt?: string;
  memRss?: number;
  enabled: boolean;
  kernel: string;
  btf: '' | 'builtin' | 'detached';
  configPath: string;
  configExists: boolean;
  geoip: GeoFile;
  geosite: GeoFile;
}

export type ServiceAction = 'start' | 'stop' | 'restart' | 'reload' | 'suspend' | 'enable' | 'disable';

/** Returns null when no backend answers (static deployment or the Vite dev server alone). */
export async function detectBackend(): Promise<AuthState | null> {
  try {
    const res = await fetch('/api/auth/state', { credentials: 'same-origin' });
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return null;
    return (await res.json()) as AuthState;
  } catch {
    return null;
  }
}

export const api = {
  setup: (password: string) => request('POST', '/api/auth/setup', { password }),
  login: (password: string) => request('POST', '/api/auth/login', { password }),
  logout: () => request('POST', '/api/auth/logout'),
  changePassword: (old: string, password: string) => request('POST', '/api/auth/password', { old, password }),
  status: () => request<DaeStatus>('GET', '/api/status'),
  getConfig: () => request<{ text: string; exists: boolean }>('GET', '/api/config'),
  validate: (text: string) => request('POST', '/api/config/validate', { text }),
  saveConfig: (text: string, apply: boolean) => request<{ applied: boolean; output?: string }>('PUT', '/api/config', { text, apply }),
  action: (a: ServiceAction) => request<{ output: string; status: DaeStatus }>('POST', `/api/service/${a}`),
  logs: (lines = 500) => request<{ lines: string[] }>('GET', `/api/logs?lines=${lines}`),
  geoUpdate: (mirror: string, reload: boolean) =>
    request<{ files: Record<string, { ok: boolean; size?: number; error?: string }> }>('POST', '/api/geo/update', { mirror, reload }),
};
