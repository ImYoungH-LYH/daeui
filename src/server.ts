// State for "router mode": the UI talks to the DaeUI backend running next to dae.

import { create } from 'zustand';
import { type AuthState, type DaeStatus, api, detectBackend } from './lib/api';
import { parseConfig, toDae } from './lib/dae/model';
import { useStore } from './store';

type Phase = 'detecting' | 'standalone' | 'setup' | 'login' | 'ready';

interface ServerState {
  phase: Phase;
  version: string;
  status: DaeStatus | null;
  /** Normalised text of the config last loaded from / saved to the router; used to detect unsaved edits. */
  baseline: string | null;
  /** Set when the router's config could not be parsed by the editor. */
  loadError: string | null;
  boot: () => Promise<void>;
  afterAuth: () => Promise<void>;
  loadRemoteConfig: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  markSaved: (text: string) => void;
  setStatus: (s: DaeStatus) => void;
  logout: () => Promise<void>;
}

const normalise = (text: string) => toDae(parseConfig(text), { header: false });

export const useServer = create<ServerState>((set, get) => ({
  phase: 'detecting',
  version: '',
  status: null,
  baseline: null,
  loadError: null,

  boot: async () => {
    const st: AuthState | null = await detectBackend();
    if (!st) return set({ phase: 'standalone' });
    set({ version: st.version });
    if (!st.setup) return set({ phase: 'setup' });
    if (!st.authed) return set({ phase: 'login' });
    await get().afterAuth();
  },

  afterAuth: async () => {
    set({ phase: 'ready' });
    await Promise.all([get().loadRemoteConfig(), get().refreshStatus()]);
  },

  loadRemoteConfig: async () => {
    const { text, exists } = await api.getConfig();
    if (!exists) {
      // Nothing on the router yet: keep the local draft and treat it as unsaved.
      set({ baseline: '', loadError: null });
      return;
    }
    try {
      const cfg = parseConfig(text);
      useStore.getState().replace(cfg);
      set({ baseline: normalise(text), loadError: null });
    } catch (e) {
      set({ baseline: null, loadError: (e as Error).message });
    }
  },

  refreshStatus: async () => {
    try {
      set({ status: await api.status() });
    } catch {
      // Session may have expired; the next user action will surface it.
    }
  },

  markSaved: (text) => set({ baseline: normalise(text), loadError: null }),
  setStatus: (s) => set({ status: s }),

  logout: async () => {
    await api.logout().catch(() => undefined);
    set({ phase: 'login', status: null });
  },
}));

/** Whether the editor holds changes that are not on the router yet. */
export function useDirty(): boolean {
  const config = useStore((s) => s.config);
  const { phase, baseline } = useServer();
  if (phase !== 'ready' || baseline === null) return false;
  return toDae(config, { header: false }) !== baseline;
}
