import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDae } from './parser';
import { parseConfig, starterConfig, toDae } from './model';

const SAMPLE = `
# comment
global {
    tproxy_port: 12345
    log_level: info
    wan_interface: auto
    tcp_check_url: 'http://cp.cloudflare.com,1.1.1.1,2606:4700:4700::1111'
    check_tolerance: 50ms
    bandwidth_max_tx: '200 mbps' # trailing comment
}
subscription {
    my_sub: 'https://www.example.com/subscription/link'
    'https://example.com/no_tag_link'
}
node {
    'socks5://localhost:1080'
    chains: 'tuic://LINK -> vmess://LINK'
}
dns {
    ipversion_prefer: 4
    fixed_domain_ttl {
        ddns.example.org: 10
    }
    upstream {
        alidns: 'udp://dns.alidns.com:53'
        googledns: 'tcp+udp://dns.google:53'
    }
    routing {
        request {
            qname(geosite:cn) -> alidns
            subnode(subtag: my_sub, name_keyword: hk) -> alidns
            fallback: googledns
        }
        response {
            upstream(googledns) -> accept
            ip(geoip:private) && !qname(geosite:cn) -> googledns
            fallback: accept
        }
    }
}
group {
    group2 {
        filter: subtag(regex: '^my_', another_sub) && !name(keyword: 'ExpireAt:')
        filter: name(US_node) [add_latency: -500ms]
        policy: fixed(0)
        check_interval: 30s
    }
}
routing {
    dip(224.0.0.0/3, 'ff00::/8') -> direct
    domain(keyword: google, suffix: www.twitter.com) -> group2
    !domain(geosite:google-scholar,
            geosite:category-scholar-!cn) -> group2
    domain(ext:"yourdatfile.dat:yourtag")->direct
    domain(geosite:disney) -> direct(mark: 0x800)
    dport(10080-30000) && l4proto(udp) -> block
    fallback: group2
}
`;

describe('parser', () => {
  it('parses the sample into a model', () => {
    const c = parseConfig(SAMPLE);
    expect(c.global.tcp_check_url).toBe('http://cp.cloudflare.com,1.1.1.1,2606:4700:4700::1111');
    expect(c.global.bandwidth_max_tx).toBe('200 mbps');
    expect(c.subscriptions).toMatchObject([{ tag: 'my_sub' }, { tag: '', value: 'https://example.com/no_tag_link' }]);
    expect(c.nodes[1].value).toBe('tuic://LINK -> vmess://LINK');
    expect(c.dns.params.ipversion_prefer).toBe('4');
    expect(c.dns.fixedTtl[0]).toMatchObject({ domain: 'ddns.example.org', ttl: '10' });
    expect(c.dns.response.enabled).toBe(true);
    expect(c.dns.request.rules[1].conds[0].params).toEqual([
      { key: 'subtag', val: 'my_sub' },
      { key: 'name_keyword', val: 'hk' },
    ]);
    const g = c.groups[0];
    expect(g.policy).toEqual({ name: 'fixed', params: [{ key: '', val: '0' }] });
    expect(g.filters[0].conds[1]).toEqual({ name: 'name', not: true, params: [{ key: 'keyword', val: 'ExpireAt:' }] });
    expect(g.filters[1].annotation).toEqual([{ key: 'add_latency', val: '-500ms' }]);
    expect(g.overrides.check_interval).toBe('30s');
    const r = c.routing.rules;
    expect(r[2].conds[0].params[1]).toEqual({ key: 'geosite', val: 'category-scholar-!cn' });
    expect(r[3].conds[0].params[0]).toEqual({ key: 'ext', val: 'yourdatfile.dat:yourtag' });
    expect(r[4].outbound).toEqual({ name: 'direct', params: [{ key: 'mark', val: '0x800' }] });
    expect(c.routing.fallback.name).toBe('group2');
  });

  it('round-trips through toDae', () => {
    const once = toDae(parseConfig(SAMPLE));
    const twice = toDae(parseConfig(once));
    expect(twice).toBe(once);
  });

  it('keeps disabled items as #@off comments', () => {
    const c = parseConfig(SAMPLE);
    c.groups[0].disabled = true;
    c.routing.rules[0].disabled = true;
    c.subscriptions[0].disabled = true;
    const text = toDae(c);
    // Every line of a disabled group is commented out.
    expect(text).toMatch(/#@off group2 \{\n\s+#@off filter:/);
    const back = parseConfig(text);
    expect(back.groups[0].disabled).toBe(true);
    expect(back.groups[0].filters.length).toBe(2);
    expect(back.routing.rules[0].disabled).toBe(true);
    expect(back.subscriptions[0].disabled).toBe(true);
    expect(toDae(back)).toBe(text);
  });

  it('reports syntax errors with position', () => {
    expect(() => parseDae('global {\n  log_level: \n}')).toThrow(/第 3 行/);
    expect(() => parseDae('routing {\n  domain(a) direct\n}')).toThrow(/->/);
  });

  it('serializes the starter config to parseable text', () => {
    const text = toDae(starterConfig());
    expect(() => parseDae(text)).not.toThrow();
  });

  // Optional: run against dae's own example.dae when DAE_EXAMPLE points to it.
  const example = process.env.DAE_EXAMPLE;
  it.runIf(!!example && existsSync(example!))('round-trips dae example.dae', () => {
    const src = readFileSync(example!, 'utf8');
    const c = parseConfig(src);
    expect(c.groups.map((g) => g.name)).toEqual(['my_group', 'group2', 'steam']);
    expect(c.routing.rules.length).toBe(6);
    const once = toDae(c);
    expect(toDae(parseConfig(once))).toBe(once);
  });
});
