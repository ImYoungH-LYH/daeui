// Helpers for showing model pieces as dae text and editing them as text.

import type { AstDecl, AstRule } from './ast';
import { fmtFuncs, fmtNameOrFunc, fmtParam } from './format';
import type { Cond, Outbound, Rule } from './model';
import { uid } from './model';
import { parseDae } from './parser';
import type { FuncSpec } from './schema';

export const ruleText = (r: Pick<Rule, 'conds' | 'outbound'>) => `${fmtFuncs(r.conds)} -> ${fmtNameOrFunc(r.outbound)}`;
export const condsText = (c: Cond[]) => fmtFuncs(c);

/** Parse `cond && cond -> outbound`. Throws DaeSyntaxError. */
export function parseRuleText(text: string): Pick<Rule, 'conds' | 'outbound'> {
  const items = parseDae(`r {\n${text}\n}`)[0].items;
  if (items.length !== 1 || items[0].kind !== 'rule') throw new Error('请输入一条形如 domain(example.com) -> direct 的规则');
  const r = items[0] as AstRule;
  return { conds: r.funcs, outbound: { name: r.outbound.name, params: r.outbound.params } };
}

/** Parse a filter expression such as `subtag(my_sub) && !name(keyword: x) [add_latency: -500ms]`. */
export function parseFilterText(text: string) {
  const items = parseDae(`g {\nfilter: ${text}\n}`)[0].items;
  const d = items[0] as AstDecl | undefined;
  if (items.length !== 1 || !d?.funcs) throw new Error('请输入形如 name(keyword: HK) 的过滤表达式');
  return { id: uid(), conds: d.funcs as Cond[], annotation: d.annotation };
}

export function describeCond(c: Cond, specs: FuncSpec[]): string {
  const spec = specs.find((s) => s.name === c.name);
  const vals = c.params.map(fmtParam).join(', ');
  return `${c.not ? '非 ' : ''}${spec?.label ?? c.name}${vals ? `：${vals}` : ''}`;
}

export const outboundText = (o: Outbound) => fmtNameOrFunc(o);
