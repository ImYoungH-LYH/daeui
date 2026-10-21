// Static checks that catch the mistakes dae would reject at startup.

import type { DaeConfig, Outbound } from './model';

export interface Issue {
  level: 'error' | 'warn';
  where: string;
  page: string;
  message: string;
}

const BUILTIN = new Set(['direct', 'block', 'must_direct', 'must_rules']);

export function outboundExists(c: DaeConfig, o: Outbound): boolean {
  const groups = new Set(c.groups.filter((g) => !g.disabled).map((g) => g.name));
  if (BUILTIN.has(o.name) || groups.has(o.name)) return true;
  if (o.name.startsWith('must_') && groups.has(o.name.slice(5))) return true;
  return false;
}

export function validate(c: DaeConfig): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue['level'], page: string, where: string, message: string) => issues.push({ level, page, where, message });

  const dup = (names: string[], page: string, what: string) => {
    const seen = new Set<string>();
    for (const n of names) {
      if (!n) continue;
      if (seen.has(n)) add('error', page, what, `名称 "${n}" 重复`);
      seen.add(n);
    }
  };

  const subs = c.subscriptions.filter((s) => !s.disabled);
  const nodes = c.nodes.filter((s) => !s.disabled);
  dup(subs.map((s) => s.tag), 'subscription', '订阅');
  dup(nodes.map((s) => s.tag), 'node', '节点');
  dup(c.groups.map((g) => g.name), 'group', '节点组');
  dup(c.dns.upstreams.filter((u) => !u.disabled).map((u) => u.tag), 'dns', 'DNS 上游');

  for (const l of [...subs, ...nodes]) {
    if (!l.value.trim()) add('error', subs.includes(l) ? 'subscription' : 'node', l.tag || '未命名', '链接为空');
  }

  if (!subs.length && !nodes.length) add('warn', 'node', '节点', '没有任何订阅或节点，代理出站将不可用');

  const subTags = new Set(subs.map((s) => s.tag).filter(Boolean));
  for (const g of c.groups) {
    if (g.disabled) continue;
    if (!/^[a-zA-Z_][a-zA-Z0-9_\-.]*$/.test(g.name)) add('error', 'group', g.name || '未命名组', '组名只能以字母或下划线开头，由字母、数字、_ - . 组成');
    if (!g.policy.name) add('error', 'group', g.name, '缺少选择策略 policy');
    if (g.policy.name === 'fixed' && !g.policy.params.length) add('error', 'group', g.name, 'fixed 策略需要指定节点序号，如 fixed(0)');
    for (const f of g.filters) {
      if (!f.conds.length) add('error', 'group', g.name, '存在空的过滤条件');
      for (const cond of f.conds) {
        if (cond.name === 'subtag') {
          for (const p of cond.params) if (!p.key && !subTags.has(p.val)) add('warn', 'group', g.name, `过滤条件引用的订阅标签 "${p.val}" 不存在`);
        }
      }
    }
  }

  const checkRules = (page: string, where: string, rules: DaeConfig['routing']['rules'], ok: (o: Outbound) => boolean, outLabel: string) => {
    rules.forEach((r, i) => {
      if (r.disabled) return;
      if (!r.conds.length) add('error', page, `${where} 第 ${i + 1} 条`, '规则没有匹配条件');
      for (const cond of r.conds) {
        if (!cond.params.length && !['sub', 'node', 'subnode'].includes(cond.name)) add('error', page, `${where} 第 ${i + 1} 条`, `${cond.name}() 缺少参数`);
      }
      if (!ok(r.outbound)) add('error', page, `${where} 第 ${i + 1} 条`, `${outLabel} "${r.outbound.name}" 不存在或已停用`);
    });
  };

  checkRules('routing', '分流规则', c.routing.rules, (o) => outboundExists(c, o), '出站');
  if (!outboundExists(c, c.routing.fallback)) add('error', 'routing', '兜底出站', `出站 "${c.routing.fallback.name}" 不存在或已停用`);

  const ups = new Set(c.dns.upstreams.filter((u) => !u.disabled).map((u) => u.tag));
  for (const u of c.dns.upstreams) {
    if (u.disabled) continue;
    if (!u.tag) add('error', 'dns', 'DNS 上游', '上游必须有名称');
    if (!/^(tcp|udp|tcp\+udp|https|tls|quic|h3|http3):\/\//.test(u.value)) add('warn', 'dns', u.tag || 'DNS 上游', '地址应以 udp:// tcp:// tcp+udp:// https:// tls:// quic:// h3:// 开头');
  }
  checkRules('dns', 'DNS 请求', c.dns.request.rules, (o) => ups.has(o.name) || o.name === 'asis' || o.name === 'reject', '上游');
  if (!ups.has(c.dns.request.fallback) && !['asis', 'reject'].includes(c.dns.request.fallback)) add('error', 'dns', 'DNS 请求兜底', `上游 "${c.dns.request.fallback}" 不存在`);
  for (const r of c.dns.request.rules) {
    const internal = r.conds.filter((x) => ['sub', 'node', 'subnode'].includes(x.name));
    if (internal.length && internal.length !== r.conds.length) add('error', 'dns', 'DNS 请求', 'sub/node/subnode 不能与 qname/qtype 混用在同一条规则中');
    if (internal.length && !ups.has(r.outbound.name)) add('error', 'dns', 'DNS 请求', 'sub/node/subnode 规则只能指向 upstream 中定义的上游');
  }
  if (c.dns.response.enabled) {
    checkRules('dns', 'DNS 应答', c.dns.response.rules, (o) => ups.has(o.name) || o.name === 'accept' || o.name === 'reject', '上游');
    if (!ups.has(c.dns.response.fallback) && !['accept', 'reject'].includes(c.dns.response.fallback)) add('error', 'dns', 'DNS 应答兜底', `上游 "${c.dns.response.fallback}" 不存在`);
  }
  if (!ups.size) add('warn', 'dns', 'DNS', '未配置 DNS 上游；按域名分流需要 dae 接管 DNS');

  const dm = c.global.dial_mode;
  if (dm === 'ip' && c.global.auto_sniff_punt === 'true') add('warn', 'global', '自动嗅探补偿', 'dial_mode 为 ip 时嗅探被禁用，auto_sniff_punt 不会生效');
  if (!c.global.lan_interface && !c.global.wan_interface) add('warn', 'global', '网卡', '未设置 LAN 或 WAN 网卡，dae 不会代理任何流量');

  return issues;
}
