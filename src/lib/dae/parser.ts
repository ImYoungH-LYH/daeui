// Recursive-descent parser for the dae config language.
// Grammar reference: https://github.com/daeuniverse/dae-config-dist (dae_config.g4).

import { OFF_MARK, type AstDecl, type AstFunction, type AstItem, type AstParam, type AstRule, type AstSection } from './ast';

type TokType = 'id' | 'nonid' | 'quote' | 'punct' | 'off' | 'eof';

interface Token {
  type: TokType;
  text: string;
  line: number;
  col: number;
}

export class DaeSyntaxError extends Error {
  constructor(
    message: string,
    public line: number,
    public col: number,
  ) {
    super(`第 ${line} 行第 ${col} 列：${message}`);
  }
}

const ID_RE = /[a-zA-Z_][a-zA-Z0-9_/\\^*.+\-=@$!#%]*/y;
const NON_ID_RE = /[/\\^*.+0-9-][a-zA-Z0-9_/\\^*.+\-=@$!#%]*/y;
const PUNCTS = ['->', '&&', '{', '}', ':', ',', '(', ')', '[', ']', '!'];

export function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const advance = (to: number) => {
    for (let k = i; k < to; k++) {
      if (src[k] === '\n') {
        line++;
        lineStart = k + 1;
      }
    }
    i = to;
  };

  while (i < src.length) {
    const c = src[i];
    const col = i - lineStart + 1;
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance(i + 1);
      continue;
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new DaeSyntaxError('块注释未闭合', line, col);
      advance(end + 2);
      continue;
    }
    if (c === '#') {
      if (src.startsWith(OFF_MARK, i)) {
        toks.push({ type: 'off', text: OFF_MARK, line, col });
        advance(i + OFF_MARK.length);
        continue;
      }
      let end = src.indexOf('\n', i);
      if (end < 0) end = src.length;
      advance(end);
      continue;
    }
    if (c === '"' || c === "'") {
      // Non-greedy match that tolerates backslash-escaped quotes, like the ANTLR rule.
      let k = i + 1;
      while (k < src.length) {
        if (src[k] === '\\' && src[k + 1] === c) {
          k += 2;
          continue;
        }
        if (src[k] === c) break;
        k++;
      }
      if (k >= src.length) throw new DaeSyntaxError('引号未闭合', line, col);
      toks.push({ type: 'quote', text: src.slice(i, k + 1), line, col });
      advance(k + 1);
      continue;
    }

    // Longest match among punctuation and ID / NON_ID; punctuation wins ties (ANTLR implicit tokens come first).
    let best: { type: TokType; len: number } | null = null;
    for (const p of PUNCTS) {
      if (src.startsWith(p, i) && (!best || p.length > best.len)) best = { type: 'punct', len: p.length };
    }
    for (const [re, type] of [
      [ID_RE, 'id'],
      [NON_ID_RE, 'nonid'],
    ] as const) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && (!best || m[0].length > best.len)) best = { type, len: m[0].length };
    }
    if (!best) throw new DaeSyntaxError(`无法识别的字符 "${c}"`, line, col);
    toks.push({ type: best.type, text: src.slice(i, i + best.len), line, col });
    advance(i + best.len);
  }
  toks.push({ type: 'eof', text: '', line, col: i - lineStart + 1 });
  return toks;
}

class Parser {
  private pos = 0;
  constructor(private toks: Token[]) {}

  /** Peek skipping `#@off` markers. */
  private peek(offset = 0): Token {
    let p = this.pos;
    let n = offset;
    for (;;) {
      while (this.toks[p].type === 'off') p++;
      if (n === 0 || this.toks[p].type === 'eof') return this.toks[p];
      p++;
      n--;
    }
  }

  private next(): Token {
    while (this.toks[this.pos].type === 'off') this.pos++;
    const t = this.toks[this.pos];
    if (t.type !== 'eof') this.pos++;
    return t;
  }

  /** Consume `#@off` markers in front of an item; returns whether any were present. */
  private takeOff(): boolean {
    let off = false;
    while (this.toks[this.pos].type === 'off') {
      off = true;
      this.pos++;
    }
    return off;
  }

  private isPunct(t: Token, p: string) {
    return t.type === 'punct' && t.text === p;
  }

  private expect(p: string): Token {
    const t = this.next();
    if (!this.isPunct(t, p)) this.fail(t, `期望 "${p}"，实际是 ${describe(t)}`);
    return t;
  }

  private fail(t: Token, msg: string): never {
    throw new DaeSyntaxError(msg, t.line, t.col);
  }

  parseFile(): AstSection[] {
    const sections: AstSection[] = [];
    for (;;) {
      const disabled = this.takeOff();
      const t = this.peek();
      if (t.type === 'eof') break;
      if (t.type !== 'id' || !this.isPunct(this.peek(1), '{')) this.fail(t, `期望配置块（如 global {），实际是 ${describe(t)}`);
      sections.push(this.parseSection(disabled));
    }
    return sections;
  }

  private parseSection(disabled: boolean): AstSection {
    const name = this.next().text;
    this.expect('{');
    const items: AstItem[] = [];
    for (;;) {
      const off = this.takeOff();
      const t = this.peek();
      if (this.isPunct(t, '}')) {
        this.next();
        break;
      }
      if (t.type === 'eof') this.fail(t, `配置块 "${name}" 缺少 "}"`);
      items.push(this.parseItem(off));
    }
    return { kind: 'section', name, items, disabled };
  }

  private parseItem(disabled: boolean): AstItem {
    const t = this.peek();
    const t1 = this.peek(1);
    if (t.type === 'id' && this.isPunct(t1, '{')) return this.parseSection(disabled);
    if (t.type === 'id' && this.isPunct(t1, ':')) return this.parseDecl(disabled);
    if (this.isPunct(t, '!') || (t.type === 'id' && this.isPunct(t1, '('))) return this.parseRule(disabled);
    if (t.type === 'id' || t.type === 'nonid' || t.type === 'quote') {
      return { kind: 'decl', key: '', val: this.parseLiteral(), annotation: [], disabled };
    }
    this.fail(t, `无法解析的内容 ${describe(t)}`);
  }

  private parseDecl(disabled: boolean): AstDecl {
    const key = this.next().text;
    this.expect(':');
    const t = this.peek();
    const decl: AstDecl = { kind: 'decl', key, val: '', annotation: [], disabled };
    if (this.isPunct(t, '!') || (t.type === 'id' && this.isPunct(this.peek(1), '('))) {
      decl.funcs = this.parseFuncExpr();
    } else {
      const vals = [this.parseLiteral()];
      while (this.isPunct(this.peek(), ',')) {
        this.next();
        vals.push(this.parseLiteral());
      }
      decl.val = vals.join(',');
    }
    if (this.isPunct(this.peek(), '[')) {
      this.next();
      decl.annotation = this.parseParams(']');
      this.expect(']');
    }
    return decl;
  }

  private parseRule(disabled: boolean): AstRule {
    const funcs = this.parseFuncExpr();
    const arrow = this.next();
    if (!this.isPunct(arrow, '->')) this.fail(arrow, `规则缺少 "->"，实际是 ${describe(arrow)}`);
    const t = this.peek();
    let outbound: AstFunction;
    if ((t.type === 'id' && this.isPunct(this.peek(1), '(')) || this.isPunct(t, '!')) {
      outbound = this.parseFunc();
    } else if (t.type === 'id' || t.type === 'nonid') {
      outbound = { name: this.next().text, not: false, params: [] };
    } else {
      this.fail(t, `规则缺少出站，实际是 ${describe(t)}`);
    }
    return { kind: 'rule', funcs, outbound, disabled };
  }

  private parseFuncExpr(): AstFunction[] {
    const funcs = [this.parseFunc()];
    while (this.isPunct(this.peek(), '&&')) {
      this.next();
      funcs.push(this.parseFunc());
    }
    return funcs;
  }

  private parseFunc(): AstFunction {
    let not = false;
    if (this.isPunct(this.peek(), '!')) {
      this.next();
      not = true;
    }
    const nameTok = this.next();
    if (nameTok.type !== 'id') this.fail(nameTok, `期望函数名，实际是 ${describe(nameTok)}`);
    this.expect('(');
    const params = this.parseParams(')');
    this.expect(')');
    return { name: nameTok.text, not, params };
  }

  private parseParams(close: string): AstParam[] {
    const params: AstParam[] = [];
    if (this.isPunct(this.peek(), close)) return params;
    for (;;) {
      const t = this.peek();
      if (t.type === 'id' && this.isPunct(this.peek(1), ':')) {
        this.next();
        this.next();
        params.push({ key: t.text, val: this.parseLiteral() });
      } else {
        params.push({ key: '', val: this.parseLiteral() });
      }
      if (!this.isPunct(this.peek(), ',')) break;
      this.next();
    }
    return params;
  }

  private parseLiteral(): string {
    const t = this.next();
    if (t.type === 'quote') return t.text.slice(1, -1);
    if (t.type === 'id' || t.type === 'nonid') return t.text;
    this.fail(t, `期望一个值，实际是 ${describe(t)}`);
  }
}

function describe(t: Token): string {
  if (t.type === 'eof') return '文件结尾';
  return `"${t.text}"`;
}

export function parseDae(src: string): AstSection[] {
  return new Parser(tokenize(src)).parseFile();
}
