// Line diff between two .dae texts, used to preview what "apply" will change on the router.

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

export interface DiffHunk {
  lines: DiffLine[];
}

export interface DiffResult {
  added: number;
  removed: number;
  /** Top-level config blocks (global, routing, …) that contain a change. */
  sections: string[];
  hunks: DiffHunk[];
}

/** LCS-based diff; config files are a few hundred lines, so O(n·m) is fine. */
function diffLines(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'del', text: a[i++] });
    } else {
      out.push({ kind: 'add', text: b[j++] });
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++] });
  while (j < m) out.push({ kind: 'add', text: b[j++] });
  return out;
}

const SECTION_RE = /^([A-Za-z_][\w]*)\s*\{/;

export function diffConfig(before: string, after: string, context = 2): DiffResult {
  const split = (s: string) => (s ? s.replace(/\n$/, '').split('\n') : []);
  const lines = diffLines(split(before), split(after));

  let added = 0;
  let removed = 0;
  const sections = new Set<string>();
  let current = '';
  const changed: boolean[] = [];
  for (const l of lines) {
    const m = SECTION_RE.exec(l.text);
    if (m) current = m[1];
    const isChange = l.kind !== 'same';
    changed.push(isChange);
    if (l.kind === 'add') added++;
    if (l.kind === 'del') removed++;
    if (isChange && current) sections.add(current);
  }

  // Group changes with a little surrounding context into hunks.
  const hunks: DiffHunk[] = [];
  let cur: DiffLine[] | null = null;
  let lastKept = -1;
  for (let k = 0; k < lines.length; k++) {
    let near = false;
    for (let d = -context; d <= context && !near; d++) near = changed[k + d] === true;
    if (!near) continue;
    if (!cur || k > lastKept + 1) {
      cur = [];
      hunks.push({ lines: cur });
    }
    cur.push(lines[k]);
    lastKept = k;
  }
  return { added, removed, sections: [...sections], hunks };
}
