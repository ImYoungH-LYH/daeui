// Field metadata for dae v2.1.1, taken from config/config.go and config/desc.go.

export type FieldType = 'bool' | 'int' | 'duration' | 'string' | 'enum' | 'list';

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  default?: string;
  options?: string[];
  placeholder?: string;
  desc: string;
}

export interface FieldGroup {
  title: string;
  fields: FieldSpec[];
}

export const GLOBAL_GROUPS: FieldGroup[] = [
  {
    title: '软件选项',
    fields: [
      { key: 'tproxy_port', label: 'tproxy 端口', type: 'int', default: '12345', desc: 'eBPF 程序使用的 tproxy 端口，不是 HTTP/SOCKS 端口，一般不用改。' },
      { key: 'tproxy_port_protect', label: '保护 tproxy 端口', type: 'bool', default: 'true', desc: '阻止外部主动访问 tproxy 端口。若要自行管理 iptables tproxy 规则则关闭。' },
      { key: 'pprof_port', label: 'pprof 端口', type: 'int', default: '0', desc: '非 0 时在 localhost 开启 pprof 调试服务。' },
      { key: 'bpf_conn_state_map_size', label: 'eBPF 连接表大小', type: 'int', default: '262144', desc: 'TCP/UDP 连接状态表的最大条目数，调小可节省锁定内存，但会降低可跟踪的并发连接数。' },
      { key: 'so_mark_from_dae', label: 'dae 出站 socket mark', type: 'int', placeholder: '不填则自动选择', desc: '不填时 dae 自动选择内部 mark 以防止 UDP 自捕获；填非 0 值覆盖；显式填 0 保留内部 mark 且不再警告。' },
      { key: 'log_level', label: '日志级别', type: 'enum', default: 'info', options: ['error', 'warn', 'info', 'debug', 'trace'], desc: '日志输出级别。' },
      { key: 'disable_waiting_network', label: '不等待网络就绪', type: 'bool', default: 'false', desc: '拉取订阅前不等待网络就绪。' },
      { key: 'disable_thp', label: '禁用透明大页', type: 'bool', default: 'false', desc: '让 dae 进程退出透明大页（THP），用于排查 RSS 膨胀，不影响系统全局设置。' },
    ],
  },
  {
    title: '网卡与内核',
    fields: [
      { key: 'lan_interface', label: 'LAN 网卡', type: 'list', placeholder: '如 br-lan,docker0', desc: '代理局域网时绑定的网卡，多个用逗号分隔。' },
      { key: 'wan_interface', label: 'WAN 网卡', type: 'list', placeholder: 'auto', desc: '代理本机时绑定的网卡，多个用逗号分隔，auto 为自动检测。' },
      { key: 'auto_config_kernel_parameter', label: '自动配置内核参数', type: 'bool', default: 'false', desc: '自动设置 ip_forward、send_redirects 等内核参数。' },
    ],
  },
  {
    title: '节点连通性检测',
    fields: [
      { key: 'tcp_check_url', label: 'TCP 检测地址', type: 'list', default: 'http://cp.cloudflare.com,1.1.1.1,2606:4700:4700::1111', desc: '第一个是 URL，其后可附带该域名的 IP。双栈环境下域名需同时有 IPv4/IPv6 记录。' },
      { key: 'tcp_check_http_method', label: 'TCP 检测方法', type: 'enum', default: 'HEAD', options: ['HEAD', 'GET'], desc: '请求 TCP 检测地址的 HTTP 方法，默认 HEAD 以减少流量。' },
      { key: 'udp_check_dns', label: 'UDP 检测 DNS', type: 'list', default: 'dns.google:53,8.8.8.8,2001:4860:4860::8888', desc: '用于检测节点 UDP 连通性的 DNS，第一个是地址，其后可附带 IP。' },
      { key: 'check_interval', label: '检测间隔', type: 'duration', default: '30s', desc: 'TCP 与 UDP 连通性检测的间隔。' },
      { key: 'check_tolerance', label: '切换容差', type: 'duration', default: '0', desc: '只有新延迟 ≤ 旧延迟 − 容差时节点组才切换节点。' },
    ],
  },
  {
    title: '连接选项',
    fields: [
      { key: 'dial_mode', label: '拨号模式', type: 'enum', default: 'domain', options: ['ip', 'domain', 'domain+', 'domain++'], desc: 'ip：直接用 DNS 解析出的 IP 拨号，不嗅探；domain：用嗅探到的域名拨号，缓解 DNS 污染；domain+：不校验嗅探域名的真实性；domain++：在 domain+ 基础上用嗅探域名重新分流。' },
      { key: 'allow_insecure', label: '允许不安全证书', type: 'bool', default: 'false', desc: '允许不安全的 TLS 证书，不建议开启。' },
      { key: 'sniffing_timeout', label: '嗅探超时', type: 'duration', default: '30ms', desc: '等待首个数据包用于嗅探的超时。dial_mode 为 ip 时恒为 0。高延迟网络可调到 100–300ms。' },
      { key: 'auto_sniff_punt', label: '自动嗅探补偿', type: 'bool', default: 'true', desc: '为“设备 + 域名白名单”规则注入内核态嗅探规则，使终端自带 DNS 时域名条件仍生效。需要开启嗅探。' },
      { key: 'tls_implementation', label: 'TLS 实现', type: 'enum', default: 'tls', options: ['tls', 'utls'], desc: 'tls 使用 Go 标准库；utls 可模拟浏览器 Client Hello。' },
      { key: 'utls_imitate', label: 'uTLS 模拟', type: 'string', default: 'chrome_auto', desc: 'uTLS 模拟的 Client Hello ID，仅在 TLS 实现为 utls 时生效。' },
      { key: 'tls_fragment', label: 'TLS 分片', type: 'bool', default: 'false', desc: '分片发送 Client Hello 以绕过 SNI 阻断。' },
      { key: 'tls_fragment_length', label: '分片长度', type: 'string', default: '50-100', desc: '每个分片的长度范围（字节）。' },
      { key: 'tls_fragment_interval', label: '分片间隔', type: 'string', default: '10-20', desc: '分片之间的间隔范围（毫秒）。' },
      { key: 'mptcp', label: 'MPTCP', type: 'bool', default: 'false', desc: '尝试用多路径 TCP 连接节点（节点需支持）。' },
      { key: 'bootstrap_resolver', label: '引导 DNS', type: 'string', placeholder: '119.29.29.29:53, 223.5.5.5:53', desc: 'DNS 分流就绪前用于引导解析的 DNS。设置后不再使用默认值。IPv6 写成 [ipv6]:port。' },
      { key: 'fallback_resolver', label: '后备 DNS', type: 'string', default: '8.8.8.8:53', desc: '系统 DNS 解析失败时用于解析 DoH/DoT 域名和订阅链接的 DNS。' },
      { key: 'bandwidth_max_tx', label: '上行带宽', type: 'string', default: '0', placeholder: '如 200 mbps', desc: '供 Hysteria2 等协议使用的上行带宽，单位可为 b/kb/mb/gb/tb 或字节每秒。' },
      { key: 'bandwidth_max_rx', label: '下行带宽', type: 'string', default: '0', placeholder: '如 1 gbps', desc: '供 Hysteria2 等协议使用的下行带宽。' },
      { key: 'udphop_interval', label: 'UDP 端口跳跃间隔', type: 'duration', default: '30s', desc: 'Hysteria2 端口跳跃的间隔。' },
    ],
  },
];

export const GLOBAL_FIELDS: FieldSpec[] = GLOBAL_GROUPS.flatMap((g) => g.fields);

export const DNS_FIELDS: FieldSpec[] = [
  { key: 'ipversion_prefer', label: 'IP 版本偏好', type: 'enum', options: ['4', '6'], placeholder: '不限', desc: '例如设为 4 时，域名同时有 A 和 AAAA 记录则只回应 A 记录，AAAA 查询返回空。' },
  { key: 'bind', label: '本地监听', type: 'string', placeholder: "如 127.0.0.1:5353 或 tcp+udp://127.0.0.1:5353", desc: '在本地地址上监听 DNS 查询。' },
  { key: 'optimistic_cache', label: '乐观缓存', type: 'bool', default: 'true', desc: 'RFC 8767：过期但仍在窗口内的缓存先返回，同时后台刷新。' },
  { key: 'optimistic_cache_ttl', label: '乐观缓存窗口（秒）', type: 'int', default: '60', desc: '过期缓存仍可返回的时长，0 表示永不过期（依赖 LRU 淘汰）。' },
  { key: 'optimistic_stale_reply_ttl', label: '过期应答 TTL（秒）', type: 'int', default: '30', desc: '返回过期缓存时告知客户端的 TTL，0 表示沿用原 TTL。' },
  { key: 'max_cache_size', label: '最大缓存条目', type: 'int', default: '65536', desc: '超过后按 LRU 淘汰，0 为不限。' },
];

export const GROUP_OVERRIDE_FIELDS: FieldSpec[] = [
  { key: 'tcp_check_url', label: 'TCP 检测地址', type: 'list', placeholder: '沿用全局', desc: '覆盖全局设置。' },
  { key: 'tcp_check_http_method', label: 'TCP 检测方法', type: 'enum', options: ['HEAD', 'GET'], placeholder: '沿用全局', desc: '覆盖全局设置。' },
  { key: 'udp_check_dns', label: 'UDP 检测 DNS', type: 'list', placeholder: '沿用全局', desc: '覆盖全局设置。' },
  { key: 'check_interval', label: '检测间隔', type: 'duration', placeholder: '沿用全局', desc: '覆盖全局设置。' },
  { key: 'check_tolerance', label: '切换容差', type: 'duration', placeholder: '沿用全局', desc: '覆盖全局设置。' },
];

export interface PolicySpec {
  name: string;
  label: string;
  desc: string;
}

export const POLICIES: PolicySpec[] = [
  { name: 'min_moving_avg', label: '最低滑动平均延迟', desc: '按延迟的滑动平均选择，越近的检测权重越高。' },
  { name: 'min_avg10', label: '最低 10 次平均延迟', desc: '按最近 10 次检测的平均延迟选择。' },
  { name: 'min', label: '最低延迟', desc: '按最近一次检测的延迟选择。' },
  { name: 'random', label: '随机', desc: '每个连接随机选择节点。' },
  { name: 'fixed', label: '固定', desc: '固定使用第 N 个节点（从 0 开始），不做连通性检测。' },
];

export interface FuncSpec {
  name: string;
  label: string;
  /** Suggested parameter keys; '' means no key. */
  keys: { key: string; label: string }[];
  placeholder: string;
  hint?: string;
}

export const ROUTING_FUNCS: FuncSpec[] = [
  {
    name: 'domain',
    label: '域名',
    keys: [
      { key: '', label: '后缀' },
      { key: 'suffix', label: '后缀 suffix' },
      { key: 'full', label: '完整 full' },
      { key: 'keyword', label: '关键词 keyword' },
      { key: 'regex', label: '正则 regex' },
      { key: 'geosite', label: '域名集 geosite' },
      { key: 'ext', label: '外部 dat ext' },
    ],
    placeholder: 'example.com',
  },
  { name: 'dip', label: '目标 IP', keys: [{ key: '', label: 'IP/CIDR' }, { key: 'geoip', label: 'geoip' }, { key: 'ext', label: '外部 dat ext' }], placeholder: '8.8.8.8 或 10.0.0.0/8' },
  { name: 'sip', label: '来源 IP', keys: [{ key: '', label: 'IP/CIDR' }, { key: 'geoip', label: 'geoip' }, { key: 'ext', label: '外部 dat ext' }], placeholder: '192.168.1.0/24' },
  { name: 'dport', label: '目标端口', keys: [{ key: '', label: '端口' }], placeholder: '443 或 8000-9000' },
  { name: 'sport', label: '来源端口', keys: [{ key: '', label: '端口' }], placeholder: '443 或 8000-9000' },
  { name: 'l4proto', label: '传输协议', keys: [{ key: '', label: '协议' }], placeholder: 'tcp / udp' },
  { name: 'ipversion', label: 'IP 版本', keys: [{ key: '', label: '版本' }], placeholder: '4 / 6' },
  { name: 'pname', label: '进程名', keys: [{ key: '', label: '进程名' }], placeholder: 'curl', hint: '仅对绑定 WAN 时的本机进程有效' },
  { name: 'mac', label: '来源 MAC', keys: [{ key: '', label: 'MAC' }], placeholder: '02:42:ac:11:00:02', hint: '在 LAN 模式下生效' },
  { name: 'dscp', label: 'DSCP', keys: [{ key: '', label: 'DSCP' }], placeholder: '0x4' },
];

export const DNS_REQUEST_FUNCS: FuncSpec[] = [
  { name: 'qname', label: '查询域名', keys: ROUTING_FUNCS[0].keys, placeholder: 'example.com' },
  { name: 'qtype', label: '查询类型', keys: [{ key: '', label: '类型' }], placeholder: 'a / aaaa / https' },
  { name: 'sub', label: '订阅拉取', keys: [{ key: '', label: '订阅标签' }], placeholder: '留空匹配全部订阅', hint: 'dae 自身拉取订阅的请求' },
  { name: 'node', label: '节点解析', keys: [{ key: '', label: '节点名' }, { key: 'name_keyword', label: '名称关键词' }, { key: 'name_regex', label: '名称正则' }], placeholder: '留空匹配全部节点', hint: 'dae 解析节点域名的请求' },
  {
    name: 'subnode',
    label: '订阅节点解析',
    keys: [{ key: 'subtag', label: '订阅标签' }, { key: 'name_keyword', label: '名称关键词' }, { key: 'name_regex', label: '名称正则' }],
    placeholder: '留空匹配全部',
    hint: '来自订阅的节点，先于 node 匹配',
  },
];

export const DNS_RESPONSE_FUNCS: FuncSpec[] = [
  { name: 'qname', label: '查询域名', keys: ROUTING_FUNCS[0].keys, placeholder: 'example.com' },
  { name: 'qtype', label: '查询类型', keys: [{ key: '', label: '类型' }], placeholder: 'a / aaaa' },
  { name: 'ip', label: '应答 IP', keys: [{ key: '', label: 'IP/CIDR' }, { key: 'geoip', label: 'geoip' }], placeholder: '10.0.0.0/8' },
  { name: 'upstream', label: '上游', keys: [{ key: '', label: '上游名' }], placeholder: 'googledns' },
];

export const GROUP_FILTER_FUNCS: FuncSpec[] = [
  { name: 'name', label: '节点名', keys: [{ key: '', label: '完整匹配' }, { key: 'keyword', label: '关键词 keyword' }, { key: 'regex', label: '正则 regex' }], placeholder: 'HK' },
  { name: 'subtag', label: '订阅标签', keys: [{ key: '', label: '完整匹配' }, { key: 'regex', label: '正则 regex' }], placeholder: 'my_sub' },
];

export const BUILTIN_OUTBOUNDS = [
  { name: 'direct', label: '直连' },
  { name: 'block', label: '拦截' },
  { name: 'must_direct', label: '强制直连（不劫持 DNS）' },
  { name: 'must_rules', label: '不劫持 DNS 并继续匹配' },
];

export const NODE_PROTOCOLS = ['socks5', 'http', 'https', 'ss', 'ssr', 'vmess', 'vless', 'trojan', 'trojan-go', 'tuic', 'juicity', 'hysteria2', 'anytls'];
