// Generic syntax tree of a .dae file, mirroring dae's pkg/config_parser.

export interface AstParam {
  /** Empty when the parameter has no key. */
  key: string;
  val: string;
}

export interface AstFunction {
  name: string;
  not: boolean;
  params: AstParam[];
}

export interface AstRule {
  kind: 'rule';
  funcs: AstFunction[];
  outbound: AstFunction;
  disabled: boolean;
}

export interface AstDecl {
  kind: 'decl';
  /** Empty for a bare literal item such as `'https://example.com/sub'`. */
  key: string;
  /** Literal value; multiple comma separated literals are joined with ",". */
  val: string;
  /** Set when the declaration value is a function expression, e.g. `filter: name(a) && !subtag(b)`. */
  funcs?: AstFunction[];
  annotation: AstParam[];
  disabled: boolean;
}

export interface AstSection {
  kind: 'section';
  name: string;
  items: AstItem[];
  disabled: boolean;
}

export type AstItem = AstRule | AstDecl | AstSection;

/** Marker comment used by DaeUI to keep disabled items in the file. dae treats it as an ordinary comment. */
export const OFF_MARK = '#@off';
