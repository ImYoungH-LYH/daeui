// Best-effort decoding of proxy share links for display only.

export interface LinkInfo {
  scheme: string;
  name?: string;
  host?: string;
}

function b64(s: string): string | undefined {
  try {
    const norm = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

export function linkInfo(link: string): LinkInfo {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/.exec(link.trim());
  if (!m) return { scheme: '?' };
  const scheme = m[1].toLowerCase();
  const rest = m[2];
  if (scheme === 'vmess') {
    const json = b64(rest.split('#')[0]);
    if (json) {
      try {
        const o = JSON.parse(json) as { ps?: string; add?: string; port?: string | number };
        return { scheme, name: o.ps, host: o.add ? `${o.add}:${o.port ?? ''}` : undefined };
      } catch {
        // fall through to generic parsing
      }
    }
  }
  const hash = rest.indexOf('#');
  let name: string | undefined;
  if (hash >= 0) {
    try {
      name = decodeURIComponent(rest.slice(hash + 1));
    } catch {
      name = rest.slice(hash + 1);
    }
  }
  const body = hash >= 0 ? rest.slice(0, hash) : rest;
  const authority = body.split(/[/?]/)[0];
  const host = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  return { scheme, name, host: host && host !== 'LINK' ? host : undefined };
}

// In dae a chain is written `exit -> ... -> first_hop`: the first link is the endpoint and traffic
// enters the last one first (https://github.com/daeuniverse/dae/discussions/236).
// These helpers use traffic order instead: index 0 is the first hop, the last item is the exit.
export const splitChain = (v: string) => v.split(/\s*->\s*/).filter(Boolean).reverse();
export const joinChain = (hops: string[]) =>
  hops
    .map((h) => h.trim())
    .filter(Boolean)
    .reverse()
    .join(' -> ');
