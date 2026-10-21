# DaeUI

[dae](https://github.com/daeuniverse/dae) v2.1.1 的 Web 配置编辑器。两种用法：

- **纯前端**：部署 `npm run build` 的静态文件，编辑并导出 `config.dae`，配置只存在浏览器里。
- **路由器模式**（OpenWrt 25.12 x86_64）：后端 `daeui` 与 dae 装在同一台路由器上，网页需密码登录，可直接校验、保存、无损热重载 dae，查看运行状态和实时日志、更新规则数据库。

## 功能

- 可视化编辑 `global`、`subscription`、`node`、`group`、`routing`、`dns` 六个配置块
- 规则、节点组、订阅等卡片支持拖动排序、启用 / 停用；规则可在可视化和 dae 文本语法之间切换
- 导入已有 `.dae` 文件：解析为可编辑的表单，未识别的配置块（如 `include`）原样保留
- 实时预览并下载 `config.dae`，内置静态检查（引用不存在的出站、名称重复、必填项等）
- 撤销 / 重做、深色模式、手机布局

停用的条目会以 `#@off` 开头的注释写入文件：dae 视其为注释，DaeUI 重新导入时能恢复为“已停用”。导入时普通注释不会保留。

## 部署到 OpenWrt 25.12（x86_64）

推送 `v*` 标签后，`.github/workflows/openwrt.yml` 用官方 SDK 镜像（`openwrt/sdk:x86-64-v25.12.x`）编出三个 apk 并发布到 Release：

| 包 | 内容 |
|---|---|
| `dae` | dae v2.1.1 官方静态二进制、geoip/geosite、procd 服务（`/etc/init.d/dae`，`reload` 为无损热重载） |
| `daeui` | 面板后端（内嵌前端），默认监听 `:2027`，密码 bcrypt 哈希存于 `/etc/daeui/auth.json` |
| `vmlinux-btf` | 官方固件内核没有 BTF。此包用 SDK 自带的内核源码和配置重编 vmlinux 再提取 BTF，只改调试信息相关选项，其余内核选项一旦变化就中止构建；安装时校验 `uname -r` |

在路由器上：

```sh
wget -O /tmp/install-openwrt.sh https://github.com/ImYoungH-LYH/daeui/releases/latest/download/install-openwrt.sh
```

```sh
sh /tmp/install-openwrt.sh
```

脚本只支持 25.12.x / x86_64；内核没有 BTF 时安装与当前内核版本完全一致的 vmlinux-btf，找不到就停止。访问 GitHub 困难时加 `GH_PROXY=https://ghfast.top/`。

## 开发

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` 输出到 `dist/`，可直接部署为静态站点。

后端需要 Go 1.26+。下面的命令以模拟模式在 `127.0.0.1:2027` 运行后端（不需要真的 dae，状态和日志由 `server/internal/dae/mock.go` 模拟，数据在 `.daeui-dev/`）；再运行 `npm run dev`，Vite 会把 `/api` 转发给它：

```bash
npm run dev:server
```

`node scripts/build-server.mjs` 构建内嵌前端的 Linux 二进制到 `build/`。后端测试：`cd server && go test ./...`。

解析器按 dae 的 ANTLR 语法（[dae-config-dist](https://github.com/daeuniverse/dae-config-dist)）实现，见 `src/lib/dae/`。设置环境变量 `DAE_EXAMPLE` 指向 dae 仓库的 `example.dae`，测试会额外校验它的往返解析。
