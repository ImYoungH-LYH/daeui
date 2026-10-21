// Builds the frontend into server/web/dist and cross-compiles the daeui binary.
// Usage: node scripts/build-server.mjs [goarch ...]   (default: amd64)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const version = process.env.DAEUI_VERSION || JSON.parse(execFileSync('node', ['-p', 'JSON.stringify(require("./package.json").version)'], { cwd: root }).toString());
const arches = process.argv.slice(2).length ? process.argv.slice(2) : ['amd64'];
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx', ...opts });

run('npx', ['tsc', '-b']);
run('npx', ['vite', 'build', '--outDir', 'server/web/dist', '--emptyOutDir']);
writeFileSync(resolve(root, 'server/web/dist/.gitkeep'), '');

mkdirSync(resolve(root, 'build'), { recursive: true });
for (const arch of arches) {
  const out = resolve(root, `build/daeui-linux-${arch}`);
  run('go', ['build', '-trimpath', '-ldflags', `-s -w -X main.version=${version}`, '-o', out, '.'], {
    cwd: resolve(root, 'server'),
    env: { ...process.env, CGO_ENABLED: '0', GOOS: 'linux', GOARCH: arch },
  });
  console.log(`built ${out}`);
}
