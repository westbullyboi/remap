/**
 * Model of the VIA custom menus ("menus" property of a VIA v3 keyboard
 * definition). Each control is bound to a value on the keyboard through the
 * id_custom_get_value / id_custom_set_value / id_custom_save commands:
 *
 *   "content": ["id_touchpad_sensitivity", <channel id>, <value id>, ...]
 *
 * Firmware implements them in via_custom_value_command_kb(). This allows
 * keyboard specific settings such as touchpad sensitivity or scroll direction
 * to be changed without rebuilding the firmware.
 */

export const CUSTOM_MENU_CONTROL_TYPES = [
  'range',
  'dropdown',
  'toggle',
  'color',
  'keycode',
  'button',
  'label',
] as const;
export type ICustomMenuControlType = (typeof CUSTOM_MENU_CONTROL_TYPES)[number];

export interface ICustomMenuControl {
  kind: 'control';
  label: string;
  type: ICustomMenuControlType;
  options?: unknown;
  showIf?: string;
  // The first element of "content". Undefined for a static label.
  valueKey?: string;
  // Text of a static label ("content": ["Some text"]).
  text?: string;
  // [channel id, value id, ...]. Empty for a static label.
  commandBytes: number[];
}

export interface ICustomMenuGroup {
  kind: 'group';
  label?: string;
  showIf?: string;
  content: ICustomMenuNode[];
}

export type ICustomMenuNode = ICustomMenuControl | ICustomMenuGroup;

export interface ICustomMenu {
  label: string;
  showIf?: string;
  content: ICustomMenuNode[];
}

// Raw bytes read from the keyboard, keyed by ICustomMenuControl.valueKey.
export type ICustomMenuValues = { [valueKey: string]: number[] };

export interface IDropdownOption {
  label: string;
  value: number;
}

const isByte = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  0 <= value &&
  value <= 0xff;

const isObject = (value: unknown): value is { [k: string]: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function parseNode(elem: unknown): ICustomMenuNode | null {
  if (!isObject(elem) || !Array.isArray(elem.content)) return null;
  const showIf = optionalString(elem.showIf);

  if (typeof elem.type === 'string') {
    const type = elem.type as ICustomMenuControlType;
    if (!CUSTOM_MENU_CONTROL_TYPES.includes(type)) return null;
    const label = optionalString(elem.label) ?? '';
    const [valueKey, ...commandBytes] = elem.content;
    if (typeof valueKey !== 'string') return null;
    if (type === 'label' && commandBytes.length === 0) {
      // Static text: "content": ["Some text"]
      return {
        kind: 'control',
        label,
        type,
        showIf,
        text: valueKey,
        commandBytes: [],
      };
    }
    // At least a channel id and a value id are required.
    if (commandBytes.length < 2 || !commandBytes.every(isByte)) return null;
    return {
      kind: 'control',
      label,
      type,
      options: elem.options,
      showIf,
      valueKey,
      commandBytes: commandBytes as number[],
    };
  }

  const content = elem.content
    .map(parseNode)
    .filter((node): node is ICustomMenuNode => node !== null);
  return {
    kind: 'group',
    label: optionalString(elem.label),
    showIf,
    content,
  };
}

/**
 * Parse the "menus" property of a keyboard definition. Built-in menus
 * specified by a string (e.g. "qmk_rgblight") are skipped because they are
 * handled by the Lighting dialog, and malformed entries are ignored.
 */
export function parseCustomMenus(menus: unknown): ICustomMenu[] {
  if (!Array.isArray(menus)) return [];
  const result: ICustomMenu[] = [];
  menus.forEach((menu) => {
    if (!isObject(menu) || typeof menu.label !== 'string') return;
    if (!Array.isArray(menu.content)) return;
    const content = menu.content
      .map(parseNode)
      .filter((node): node is ICustomMenuNode => node !== null);
    if (collectControlsFromNodes(content).length === 0) return;
    result.push({
      label: menu.label,
      showIf: optionalString(menu.showIf),
      content,
    });
  });
  return result;
}

function collectControlsFromNodes(
  nodes: ICustomMenuNode[]
): ICustomMenuControl[] {
  return nodes.flatMap((node) =>
    node.kind === 'control' ? [node] : collectControlsFromNodes(node.content)
  );
}

/**
 * Collect all controls which have a value stored in the keyboard.
 * Controls sharing the same value key are returned only once.
 */
export function collectValueControls(
  menus: ICustomMenu[]
): ICustomMenuControl[] {
  const seen = new Set<string>();
  return menus
    .flatMap((menu) => collectControlsFromNodes(menu.content))
    .filter((control) => {
      if (control.valueKey === undefined || control.type === 'button') {
        return false;
      }
      if (control.commandBytes.length === 0) return false;
      if (seen.has(control.valueKey)) return false;
      seen.add(control.valueKey);
      return true;
    });
}

export const shiftTo16Bit = (hi: number, lo: number): number =>
  ((hi & 0xff) << 8) | (lo & 0xff);

export const shiftFrom16Bit = (value: number): [number, number] => [
  (value >> 8) & 0xff,
  value & 0xff,
];

export function getRangeBounds(control: ICustomMenuControl): {
  min: number;
  max: number;
} {
  const options = control.options;
  if (
    Array.isArray(options) &&
    typeof options[0] === 'number' &&
    typeof options[1] === 'number'
  ) {
    return { min: options[0], max: options[1] };
  }
  return { min: 0, max: 255 };
}

// Ranges whose maximum exceeds 255 are sent as a big-endian 16-bit value.
const isWideRange = (control: ICustomMenuControl): boolean =>
  getRangeBounds(control).max > 0xff;

export function decodeRangeValue(
  control: ICustomMenuControl,
  bytes: number[]
): number {
  if (isWideRange(control)) {
    return shiftTo16Bit(bytes[0] ?? 0, bytes[1] ?? 0);
  }
  return bytes[0] ?? 0;
}

export function encodeRangeValue(
  control: ICustomMenuControl,
  value: number
): number[] {
  const { min, max } = getRangeBounds(control);
  const clamped = Math.min(max, Math.max(min, Math.round(value)));
  return isWideRange(control) ? shiftFrom16Bit(clamped) : [clamped & 0xff];
}

const boxOrArr = (value: unknown): number[] =>
  (Array.isArray(value) ? value : [value]).filter(isByte);

function getToggleOptions(control: ICustomMenuControl): [number[], number[]] {
  const options = control.options;
  if (Array.isArray(options) && options.length >= 2) {
    const off = boxOrArr(options[0]);
    const on = boxOrArr(options[1]);
    if (off.length > 0 && on.length > 0) return [off, on];
  }
  return [[0], [1]];
}

export function isToggleOn(
  control: ICustomMenuControl,
  bytes: number[]
): boolean {
  const on = getToggleOptions(control)[1];
  return on.every((b, i) => bytes[i] === b);
}

export function encodeToggleValue(
  control: ICustomMenuControl,
  on: boolean
): number[] {
  return getToggleOptions(control)[on ? 1 : 0];
}

/**
 * Options are either labels (the value is its index) or [label, value] pairs.
 */
export function getDropdownOptions(
  control: ICustomMenuControl
): IDropdownOption[] {
  if (!Array.isArray(control.options)) return [];
  return control.options.flatMap((option, index): IDropdownOption[] => {
    if (typeof option === 'string') {
      return [{ label: option, value: index }];
    }
    if (
      Array.isArray(option) &&
      typeof option[0] === 'string' &&
      isByte(option[1])
    ) {
      return [{ label: option[0], value: option[1] }];
    }
    return [];
  });
}

export function getButtonValue(control: ICustomMenuControl): number[] {
  const options = boxOrArr(control.options);
  return options.length > 0 ? [options[0]] : [1];
}

export function decodeLabelValue(bytes: number[]): string {
  const terminator = bytes.indexOf(0);
  const body = terminator === -1 ? bytes : bytes.slice(0, terminator);
  return new TextDecoder().decode(new Uint8Array(body));
}

/**
 * Numeric value of each control, used to evaluate "showIf" expressions.
 */
export function resolveNumericValues(
  controls: ICustomMenuControl[],
  values: ICustomMenuValues
): { [valueKey: string]: number } {
  const result: { [valueKey: string]: number } = {};
  controls.forEach((control) => {
    const bytes = values[control.valueKey!];
    if (bytes === undefined) return;
    switch (control.type) {
      case 'range':
        result[control.valueKey!] = decodeRangeValue(control, bytes);
        break;
      case 'keycode':
        result[control.valueKey!] = shiftTo16Bit(bytes[0] ?? 0, bytes[1] ?? 0);
        break;
      default:
        result[control.valueKey!] = bytes[0] ?? 0;
    }
  });
  return result;
}

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ref'; name: string }
  | { kind: 'op'; op: string };

const OPERATORS = ['||', '&&', '==', '!=', '<=', '>=', '<', '>', '!', '(', ')'];

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '{') {
      const end = expr.indexOf('}', i);
      if (end === -1) throw new Error('Unterminated reference');
      tokens.push({ kind: 'ref', name: expr.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    const numberMatch = /^(0x[0-9a-fA-F]+|\d+)/.exec(expr.slice(i));
    if (numberMatch) {
      tokens.push({ kind: 'number', value: Number(numberMatch[1]) });
      i += numberMatch[1].length;
      continue;
    }
    const op = OPERATORS.find((o) => expr.startsWith(o, i));
    if (op === undefined) throw new Error(`Unexpected character: ${c}`);
    tokens.push({ kind: 'op', op });
    i += op.length;
  }
  return tokens;
}

/**
 * Evaluate a VIA "showIf" expression such as
 * "{id_touchpad_mode} == 1 && {id_touchpad_speed} > 0".
 * Supported: numbers, {references}, ( ), !, ==, !=, <, <=, >, >=, &&, ||.
 * An unknown reference evaluates to 0. A malformed expression is treated as
 * true so that a definition error never hides a setting.
 */
export function evaluateShowIf(
  expr: string | undefined,
  values: { [valueKey: string]: number }
): boolean {
  if (expr === undefined || expr.trim() === '') return true;
  try {
    const tokens = tokenize(expr);
    let pos = 0;
    const peekOp = (...ops: string[]): string | undefined => {
      const token = tokens[pos];
      return token && token.kind === 'op' && ops.includes(token.op)
        ? token.op
        : undefined;
    };
    const parseOr = (): number => {
      let left = parseAnd();
      while (peekOp('||')) {
        pos++;
        const right = parseAnd();
        left = left || right ? 1 : 0;
      }
      return left;
    };
    const parseAnd = (): number => {
      let left = parseEquality();
      while (peekOp('&&')) {
        pos++;
        const right = parseEquality();
        left = left && right ? 1 : 0;
      }
      return left;
    };
    const parseEquality = (): number => {
      let left = parseRelational();
      let op: string | undefined;
      while ((op = peekOp('==', '!='))) {
        pos++;
        const right = parseRelational();
        left = (op === '==' ? left === right : left !== right) ? 1 : 0;
      }
      return left;
    };
    const parseRelational = (): number => {
      let left = parseUnary();
      let op: string | undefined;
      while ((op = peekOp('<', '<=', '>', '>='))) {
        pos++;
        const right = parseUnary();
        switch (op) {
          case '<':
            left = left < right ? 1 : 0;
            break;
          case '<=':
            left = left <= right ? 1 : 0;
            break;
          case '>':
            left = left > right ? 1 : 0;
            break;
          default:
            left = left >= right ? 1 : 0;
        }
      }
      return left;
    };
    const parseUnary = (): number => {
      if (peekOp('!')) {
        pos++;
        return parseUnary() ? 0 : 1;
      }
      return parsePrimary();
    };
    const parsePrimary = (): number => {
      const token = tokens[pos++];
      if (token === undefined) throw new Error('Unexpected end');
      if (token.kind === 'number') return token.value;
      if (token.kind === 'ref') return values[token.name] ?? 0;
      if (token.op === '(') {
        const value = parseOr();
        if (!peekOp(')')) throw new Error('Missing )');
        pos++;
        return value;
      }
      throw new Error(`Unexpected operator: ${token.op}`);
    };
    const result = parseOr();
    if (pos !== tokens.length) throw new Error('Unexpected token');
    return result !== 0;
  } catch (error) {
    console.warn(`Invalid showIf expression: ${expr}`, error);
    return true;
  }
}
