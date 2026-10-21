// Editor-side model of a dae config, plus conversion from / to .dae text.

import { type AstDecl, type AstFunction, type AstItem, type AstParam, type AstRule, type AstSection, OFF_MARK } from './ast';
import { fmtAnnotation, fmtFuncs, fmtNameOrFunc, lit } from './format';
import { parseDae } from './parser';

export type Param = AstParam;

export interface Cond {
  name: string;
  not: boolean;
  params: Param[];
}

export interface Outbound {
  name: string;
  params: Param[];
}

export interface Rule {
  id: string;
  conds: Cond[];
  outbound: Outbound;
  disabled: boolean;
}

export interface Link {
  id: string;
  tag: string;
  value: string;
  disabled: boolean;
}

export interface Filter {
  id: string;
  conds: Cond[];
  annotation: Param[];
}

export interface Group {
  id: string;
  name: string;
  filters: Filter[];
  policy: Outbound;
  overrides: Record<string, string>;
  disabled: boolean;
}

export interface TtlEntry {
  id: string;
  domain: string;
  ttl: string;
}

export interface DnsConfig {
  params: Record<string, string>;
  upstreams: Link[];
  fixedTtl: TtlEntry[];
  request: { rules: Rule[]; fallback: string };
  response: { enabled: boolean; rules: Rule[]; fallback: string };
}

export interface DaeConfig {
  global: Record<string, string>;
  subscriptions: Link[];
  nodes: Link[];
  groups: Group[];
  routing: { rules: Rule[]; fallback: Outbound };
  dns: DnsConfig;
  /** Sections DaeUI does not model (e.g. include), kept verbatim. */
  extra: AstSection[];
}

let seq = 0;
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function emptyConfig(): DaeConfig {
  return {
    global: {},
    subscriptions: [],
    nodes: [],
    groups: [],
    routing: { rules: [], fallback: { name: 'direct', params: [] } },
    dns: {
      params: {},
      upstreams: [],
      fixedTtl: [],
      request: { rules: [], fallback: 'asis' },
      response: { enabled: false, rules: [], fallback: 'accept' },
    },
    extra: [],
  };
}

const rule = (src: string): Rule => {
  const [r] = (parseDae(`x { ${src} }`)[0].items as AstRule[]).map(toRule);
  return r;
};

/** A sensible starting point for new users. */
export function starterConfig(): DaeConfig {
  const c = emptyConfig();
  c.global = {
    log_level: 'info',
    wan_interface: 'auto',
    auto_config_kernel_parameter: 'true',
    tcp_check_url: 'http://cp.cloudflare.com,1.1.1.1,2606:4700:4700::1111',
    udp_check_dns: 'dns.google:53,8.8.8.8,2001:4860:4860::8888',
    check_interval: '30s',
    check_tolerance: '50ms',
    dial_mode: 'domain',
  };
  c.subscriptions = [{ id: uid(), tag: 'my_sub', value: 'https://www.example.com/subscription/link', disabled: false }];
  c.groups = [{ id: uid(), name: 'proxy', filters: [], policy: { name: 'min_moving_avg', params: [] }, overrides: {}, disabled: false }];
  c.dns.upstreams = [
    { id: uid(), tag: 'alidns', value: 'udp://dns.alidns.com:53', disabled: false },
    { id: uid(), tag: 'googledns', value: 'tcp+udp://dns.google:53', disabled: false },
  ];
  c.dns.request = { rules: [rule('qname(geosite:cn) -> alidns')], fallback: 'googledns' };
  c.routing = {
    rules: [
      rule('pname(NetworkManager) -> direct'),
      rule("dip(224.0.0.0/3, 'ff00::/8') -> direct"),
      rule('dip(geoip:private) -> direct'),
      rule('dip(geoip:cn) -> direct'),
      rule('domain(geosite:cn) -> direct'),
    ],
    fallback: { name: 'proxy', params: [] },
  };
  return c;
}

// ---------- AST -> model ----------

const toCond = (f: AstFunction): Cond => ({ name: f.name, not: f.not, params: f.params.map((p) => ({ ...p })) });
const toRule = (r: AstRule): Rule => ({
  id: uid(),
  conds: r.funcs.map(toCond),
  outbound: { name: r.outbound.name, params: r.outbound.params },
  disabled: r.disabled,
});

function declOutbound(d: AstDecl): Outbound {
  if (d.funcs?.length) return { name: d.funcs[0].name, params: d.funcs[0].params };
  return { name: d.val, params: [] };
}

function toLinks(items: AstItem[]): Link[] {
  return items
    .filter((i): i is AstDecl => i.kind === 'decl')
    .map((d) => ({ id: uid(), tag: d.key, value: d.val, disabled: d.disabled }));
}

function toRouting(items: AstItem[]) {
  const rules: Rule[] = [];
  let fallback: AstDecl | undefined;
  for (const it of items) {
    if (it.kind === 'rule') rules.push(toRule(it));
    else if (it.kind === 'decl' && (it.key === 'fallback' || it.key === 'default')) fallback = it;
  }
  return { rules, fallback };
}

function toGroup(s: AstSection): Group {
  const g: Group = { id: uid(), name: s.name, filters: [], policy: { name: '', params: [] }, overrides: {}, disabled: s.disabled };
  for (const it of s.items) {
    if (it.kind !== 'decl') continue;
    if (it.key === 'filter') {
      g.filters.push({ id: uid(), conds: (it.funcs ?? []).map(toCond), annotation: it.annotation });
    } else if (it.key === 'policy') {
      g.policy = declOutbound(it);
    } else {
      g.overrides[it.key] = it.val;
    }
  }
  return g;
}

function declMap(items: AstItem[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const it of items) if (it.kind === 'decl' && it.key && !it.disabled) m[it.key] = it.val;
  return m;
}

export function fromAst(sections: AstSection[]): DaeConfig {
  const c = emptyConfig();
  const seen = new Set<string>();
  for (const s of sections) {
    if (s.disabled) continue;
    seen.add(s.name);
    switch (s.name) {
      case 'global':
        Object.assign(c.global, declMap(s.items));
        break;
      case 'subscription':
        c.subscriptions.push(...toLinks(s.items));
        break;
      case 'node':
        c.nodes.push(...toLinks(s.items));
        break;
      case 'group':
        for (const it of s.items) if (it.kind === 'section') c.groups.push(toGroup(it));
        break;
      case 'routing': {
        const r = toRouting(s.items);
        c.routing.rules.push(...r.rules);
        if (r.fallback) c.routing.fallback = declOutbound(r.fallback);
        break;
      }
      case 'dns':
        for (const it of s.items) {
          if (it.kind === 'decl' && it.key && !it.disabled) c.dns.params[it.key] = it.val;
          if (it.kind !== 'section') continue;
          if (it.name === 'upstream') c.dns.upstreams.push(...toLinks(it.items));
          else if (it.name === 'fixed_domain_ttl') {
            for (const d of it.items) if (d.kind === 'decl') c.dns.fixedTtl.push({ id: uid(), domain: d.key, ttl: d.val });
          } else if (it.name === 'routing') {
            for (const sub of it.items) {
              if (sub.kind !== 'section') continue;
              const r = toRouting(sub.items);
              const fb = r.fallback ? fmtNameOrFunc(declOutbound(r.fallback)) : undefined;
              if (sub.name === 'request') c.dns.request = { rules: r.rules, fallback: fb ?? 'asis' };
              if (sub.name === 'response') c.dns.response = { enabled: true, rules: r.rules, fallback: fb ?? 'accept' };
            }
          }
        }
        break;
      default:
        c.extra.push(s);
    }
  }
  if (!seen.has('routing')) c.routing.fallback = { name: 'direct', params: [] };
  return c;
}

export function parseConfig(src: string): DaeConfig {
  return fromAst(parseDae(src));
}

// ---------- model -> text ----------

const IND = '    ';

/** Prefix a (possibly multi-line) item with the disabled marker so dae ignores it. */
function maybeOff(text: string, disabled: boolean): string {
  if (!disabled) return text;
  return text
    .split('\n')
    .map((l) => {
      const m = /^(\s*)(.*)$/.exec(l)!;
      return `${m[1]}${OFF_MARK} ${m[2]}`;
    })
    .join('\n');
}

function fmtKV(key: string, val: string): string {
  return `${key}: ${lit(val)}`;
}

function fmtLink(l: Link): string {
  const v = lit(l.value, true);
  return maybeOff(l.tag ? `${l.tag}: ${v}` : v, l.disabled);
}

function fmtRule(r: Rule): string {
  return maybeOff(`${fmtFuncs(r.conds)} -> ${fmtNameOrFunc(r.outbound)}`, r.disabled);
}

const indent = (text: string) =>
  text
    .split('\n')
    .map((l) => IND + l)
    .join('\n');

function block(name: string, body: string[]): string {
  const inner = body.filter((b) => b !== '');
  if (!inner.length) return `${name} {\n}`;
  return `${name} {\n${inner.map(indent).join('\n')}\n}`;
}

const KEYED_VALUE = new Set(['tcp_check_url', 'udp_check_dns', 'bandwidth_max_tx', 'bandwidth_max_rx', 'bootstrap_resolver', 'fallback_resolver', 'tls_fragment_length', 'tls_fragment_interval', 'bind']);

function fmtParamKV(key: string, val: string): string {
  return KEYED_VALUE.has(key) ? `${key}: ${lit(val, true)}` : fmtKV(key, val);
}

function fmtAstItem(it: AstItem): string {
  if (it.kind === 'rule') return maybeOff(`${fmtFuncs(it.funcs)} -> ${fmtNameOrFunc(it.outbound)}`, it.disabled);
  if (it.kind === 'section') return maybeOff(block(it.name, it.items.map(fmtAstItem)), it.disabled);
  const val = it.funcs ? fmtFuncs(it.funcs) : lit(it.val);
  return maybeOff(`${it.key ? `${it.key}: ` : ''}${val}${fmtAnnotation(it.annotation)}`, it.disabled);
}

export function toDae(c: DaeConfig, opts: { header?: boolean } = {}): string {
  const out: string[] = [];
  if (opts.header !== false) out.push('# Generated by DaeUI for dae v2.1.1', `# Lines starting with "${OFF_MARK}" are items disabled in DaeUI.`, '');

  for (const s of c.extra.filter((s) => s.name === 'include')) out.push(fmtAstItem(s), '');

  out.push(block('global', Object.entries(c.global).map(([k, v]) => fmtParamKV(k, v))), '');

  out.push(block('subscription', c.subscriptions.map(fmtLink)), '');
  out.push(block('node', c.nodes.map(fmtLink)), '');

  const d = c.dns;
  const dnsBody: string[] = Object.entries(d.params).map(([k, v]) => fmtParamKV(k, v));
  if (d.fixedTtl.length) dnsBody.push(block('fixed_domain_ttl', d.fixedTtl.map((t) => `${t.domain}: ${lit(t.ttl)}`)));
  dnsBody.push(block('upstream', d.upstreams.map(fmtLink)));
  const routingBody = [block('request', [...d.request.rules.map(fmtRule), `fallback: ${d.request.fallback || 'asis'}`])];
  if (d.response.enabled) routingBody.push(block('response', [...d.response.rules.map(fmtRule), `fallback: ${d.response.fallback || 'accept'}`]));
  dnsBody.push(block('routing', routingBody));
  out.push(block('dns', dnsBody), '');

  out.push(
    block(
      'group',
      c.groups.map((g) => {
        const body: string[] = g.filters.map((f) => `filter: ${fmtFuncs(f.conds)}${fmtAnnotation(f.annotation)}`);
        if (g.policy.name) body.push(`policy: ${fmtNameOrFunc(g.policy)}`);
        for (const [k, v] of Object.entries(g.overrides)) if (v !== '') body.push(fmtParamKV(k, v));
        return maybeOff(block(g.name, body), g.disabled);
      }),
    ),
    '',
  );

  out.push(block('routing', [...c.routing.rules.map(fmtRule), `fallback: ${fmtNameOrFunc(c.routing.fallback)}`]));

  for (const s of c.extra.filter((s) => s.name !== 'include')) out.push('', fmtAstItem(s));

  return out.join('\n') + '\n';
}
