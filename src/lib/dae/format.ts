// Turning values back into dae config syntax.

import type { AstFunction, AstParam } from './ast';

const BARE_RE = /^(?:[a-zA-Z_]|[/\\^*.+0-9-])[a-zA-Z0-9_/\\^*.+\-=@$!#%]*$/;
const PUNCT_LITERALS = new Set(['->']);

/** Whether a value can be written without quotes. */
export function isBare(v: string): boolean {
  return v !== '' && BARE_RE.test(v) && !PUNCT_LITERALS.has(v);
}

/** dae strips the surrounding quotes without unescaping, so pick a quote char the value does not contain. */
export function quote(v: string): string {
  if (!v.includes("'")) return `'${v}'`;
  return `"${v}"`;
}

export function lit(v: string, forceQuote = false): string {
  return !forceQuote && isBare(v) ? v : quote(v);
}

// dae's docs write these as one token, e.g. `geosite:cn`, `geoip:private`.
const TIGHT_KEYS = new Set(['geosite', 'geoip', 'ext']);

export function fmtParam(p: AstParam): string {
  if (!p.key) return lit(p.val);
  return TIGHT_KEYS.has(p.key) ? `${p.key}:${lit(p.val)}` : `${p.key}: ${lit(p.val)}`;
}

export function fmtParams(ps: AstParam[]): string {
  return ps.map(fmtParam).join(', ');
}

export function fmtFunc(f: AstFunction): string {
  return `${f.not ? '!' : ''}${f.name}(${fmtParams(f.params)})`;
}

export function fmtFuncs(fs: AstFunction[]): string {
  return fs.map(fmtFunc).join(' && ');
}

/** Outbound or policy: bare name when there are no params. */
export function fmtNameOrFunc(f: { name: string; params: AstParam[] }): string {
  return f.params.length ? `${f.name}(${fmtParams(f.params)})` : f.name;
}

export function fmtAnnotation(ps: AstParam[]): string {
  return ps.length ? ` [${fmtParams(ps)}]` : '';
}
