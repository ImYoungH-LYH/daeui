import { create } from 'zustand';
import { type DaeConfig, starterConfig } from './lib/dae/model';

const STORAGE_KEY = 'daeui.config.v1';
const HISTORY_LIMIT = 100;

function load(): DaeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DaeConfig;
  } catch {
    // Ignore unreadable storage and start fresh.
  }
  return starterConfig();
}

function save(c: DaeConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    // Storage may be unavailable (private mode); editing still works in memory.
  }
}

export type Page = 'overview' | 'editor' | 'preview' | 'service';
export type Tab = 'global' | 'subscription' | 'node' | 'group' | 'routing' | 'dns';

interface State {
  config: DaeConfig;
  past: DaeConfig[];
  future: DaeConfig[];
  page: Page;
  tab: Tab;
  /** Bumped when the green "+" button is pressed; the active tab opens its add dialog. */
  addSignal: number;
  update: (fn: (draft: DaeConfig) => void) => void;
  replace: (c: DaeConfig) => void;
  undo: () => void;
  redo: () => void;
  go: (page: Page, tab?: Tab) => void;
  requestAdd: () => void;
}

export const useStore = create<State>((set, get) => ({
  config: load(),
  past: [],
  future: [],
  page: 'editor',
  tab: 'global',
  addSignal: 0,
  update: (fn) => {
    const prev = get().config;
    const next = structuredClone(prev);
    fn(next);
    save(next);
    set({ config: next, past: [...get().past, prev].slice(-HISTORY_LIMIT), future: [] });
  },
  replace: (c) => {
    save(c);
    set({ config: c, past: [...get().past, get().config].slice(-HISTORY_LIMIT), future: [] });
  },
  undo: () => {
    const { past, config, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    save(prev);
    set({ config: prev, past: past.slice(0, -1), future: [config, ...future] });
  },
  redo: () => {
    const { past, config, future } = get();
    if (!future.length) return;
    const [next, ...rest] = future;
    save(next);
    set({ config: next, past: [...past, config], future: rest });
  },
  go: (page, tab) => set(tab ? { page, tab } : { page }),
  requestAdd: () => set({ addSignal: get().addSignal + 1 }),
}));
