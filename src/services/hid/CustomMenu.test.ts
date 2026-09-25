import { describe, expect, test } from 'vitest';
import {
  collectValueControls,
  decodeLabelValue,
  decodeRangeValue,
  encodeRangeValue,
  encodeToggleValue,
  evaluateShowIf,
  getButtonValue,
  getDropdownOptions,
  ICustomMenuControl,
  isToggleOn,
  parseCustomMenus,
  resolveNumericValues,
} from './CustomMenu';
import {
  CustomMenuGetValueCommand,
  CustomMenuSaveCommand,
  CustomMenuSetValueCommand,
} from './Commands';

const touchpadMenus = [
  'qmk_rgblight',
  {
    label: 'Touchpad',
    content: [
      {
        label: 'Pointer',
        content: [
          {
            label: 'Enable',
            type: 'toggle',
            content: ['id_touchpad_enable', 0, 1],
          },
          {
            showIf: '{id_touchpad_enable} == 1',
            label: 'Sensitivity',
            type: 'range',
            options: [100, 1600],
            content: ['id_touchpad_cpi', 0, 2],
          },
          {
            label: 'Mode',
            type: 'dropdown',
            options: ['Cursor', 'Scroll', ['Tap only', 5]],
            content: ['id_touchpad_mode', 0, 3],
          },
        ],
      },
      {
        content: [
          {
            label: 'Version',
            type: 'label',
            content: ['v1.0'],
          },
          {
            label: 'Calibrate',
            type: 'button',
            content: ['id_touchpad_calibrate', 0, 4],
          },
          // Invalid: channel id and value id are missing.
          { label: 'Broken', type: 'range', content: ['id_broken'] },
          // Invalid: unknown type.
          { label: 'Unknown', type: 'foo', content: ['id_foo', 0, 9] },
        ],
      },
    ],
  },
  { label: 'Empty', content: [] },
];

const control = (
  type: ICustomMenuControl['type'],
  options?: unknown
): ICustomMenuControl => ({
  kind: 'control',
  label: 'test',
  type,
  options,
  valueKey: 'id_test',
  commandBytes: [0, 1],
});

describe('parseCustomMenus', () => {
  test('parses custom menus and skips built-in and invalid entries', () => {
    const menus = parseCustomMenus(touchpadMenus);
    expect(menus).toHaveLength(1);
    expect(menus[0].label).toEqual('Touchpad');
    expect(menus[0].content).toHaveLength(2);

    const pointer = menus[0].content[0];
    expect(pointer.kind).toEqual('group');
    if (pointer.kind !== 'group') return;
    expect(pointer.label).toEqual('Pointer');
    expect(pointer.content).toHaveLength(3);
    expect(pointer.content[1]).toEqual({
      kind: 'control',
      label: 'Sensitivity',
      type: 'range',
      options: [100, 1600],
      showIf: '{id_touchpad_enable} == 1',
      valueKey: 'id_touchpad_cpi',
      commandBytes: [0, 2],
    });

    const others = menus[0].content[1];
    if (others.kind !== 'group') throw new Error('group expected');
    expect(others.label).toBeUndefined();
    expect(others.content.map((c) => c.kind === 'control' && c.label)).toEqual([
      'Version',
      'Calibrate',
    ]);
  });

  test('returns an empty array for a missing or invalid property', () => {
    expect(parseCustomMenus(undefined)).toEqual([]);
    expect(parseCustomMenus('qmk_backlight')).toEqual([]);
    expect(parseCustomMenus([{ content: [] }])).toEqual([]);
  });

  test('collects controls which have a value', () => {
    const controls = collectValueControls(parseCustomMenus(touchpadMenus));
    expect(controls.map((c) => c.valueKey)).toEqual([
      'id_touchpad_enable',
      'id_touchpad_cpi',
      'id_touchpad_mode',
    ]);
  });
});

describe('value conversion', () => {
  test('range values up to 255 use one byte', () => {
    const range = control('range', [0, 255]);
    expect(encodeRangeValue(range, 200)).toEqual([200]);
    expect(decodeRangeValue(range, [200, 99])).toEqual(200);
    expect(encodeRangeValue(range, 300)).toEqual([255]);
  });

  test('range values over 255 use big-endian two bytes', () => {
    const range = control('range', [100, 1600]);
    expect(encodeRangeValue(range, 1600)).toEqual([0x06, 0x40]);
    expect(decodeRangeValue(range, [0x06, 0x40])).toEqual(1600);
    expect(encodeRangeValue(range, 10)).toEqual([0x00, 100]);
  });

  test('toggle uses [0, 1] by default and custom options', () => {
    const toggle = control('toggle');
    expect(encodeToggleValue(toggle, true)).toEqual([1]);
    expect(isToggleOn(toggle, [1])).toBe(true);
    expect(isToggleOn(toggle, [0])).toBe(false);

    const custom = control('toggle', [0, 255]);
    expect(encodeToggleValue(custom, true)).toEqual([255]);
    expect(encodeToggleValue(custom, false)).toEqual([0]);
    expect(isToggleOn(custom, [255])).toBe(true);

    const multiByte = control('toggle', [
      [0, 0],
      [1, 2],
    ]);
    expect(encodeToggleValue(multiByte, true)).toEqual([1, 2]);
    expect(isToggleOn(multiByte, [1, 2])).toBe(true);
    expect(isToggleOn(multiByte, [1, 0])).toBe(false);
  });

  test('dropdown options use an index or an explicit value', () => {
    expect(
      getDropdownOptions(control('dropdown', ['A', ['B', 7], 'C']))
    ).toEqual([
      { label: 'A', value: 0 },
      { label: 'B', value: 7 },
      { label: 'C', value: 2 },
    ]);
    expect(getDropdownOptions(control('dropdown'))).toEqual([]);
  });

  test('button sends the first option or 1', () => {
    expect(getButtonValue(control('button'))).toEqual([1]);
    expect(getButtonValue(control('button', [3]))).toEqual([3]);
  });

  test('label decodes a null-terminated UTF-8 string', () => {
    expect(decodeLabelValue([0x76, 0x31, 0x00, 0x41])).toEqual('v1');
    expect(decodeLabelValue([0x41, 0x42])).toEqual('AB');
  });

  test('resolves numeric values for showIf', () => {
    const controls = collectValueControls(parseCustomMenus(touchpadMenus));
    expect(
      resolveNumericValues(controls, {
        id_touchpad_enable: [1, 0],
        id_touchpad_cpi: [0x03, 0x20],
      })
    ).toEqual({ id_touchpad_enable: 1, id_touchpad_cpi: 800 });
  });
});

describe('evaluateShowIf', () => {
  const values = { id_a: 1, id_b: 5 };

  test.each([
    [undefined, true],
    ['', true],
    ['{id_a} == 1', true],
    ['{id_a} != 1', false],
    ['{id_b} > 4 && {id_b} <= 5', true],
    ['{id_b} < 5 || {id_a} >= 2', false],
    ['!({id_a} == 1)', false],
    ['{id_unknown} == 0', true],
    ['{id_b} == 0x05', true],
    ['{id_a}', true],
    ['({id_a} == 0 || {id_b} == 5) && !{id_unknown}', true],
  ])('%s => %s', (expr, expected) => {
    expect(evaluateShowIf(expr, values)).toBe(expected);
  });

  test('a malformed expression shows the item', () => {
    expect(evaluateShowIf('{id_a} ==', values)).toBe(true);
    expect(evaluateShowIf('{id_a} = 1', values)).toBe(true);
    expect(evaluateShowIf('({id_a} == 1', values)).toBe(true);
  });
});

describe('custom menu commands', () => {
  const handler = async () => {};

  test('get value', () => {
    const command = new CustomMenuGetValueCommand(
      { commandBytes: [0, 2] },
      handler
    );
    expect(Array.from(command.createReport())).toEqual([0x08, 0, 2]);
    const response = new Uint8Array(32);
    response.set([0x08, 0, 2, 0x06, 0x40]);
    expect(command.isSameRequest(response)).toBe(true);
    const result = command.createResponse(response);
    expect(result.unhandled).toBe(false);
    expect(result.value.slice(0, 2)).toEqual([0x06, 0x40]);

    const other = new Uint8Array(32);
    other.set([0x08, 0, 3]);
    expect(command.isSameRequest(other)).toBe(false);
  });

  test('get value handles an unhandled response', () => {
    const command = new CustomMenuGetValueCommand(
      { commandBytes: [0, 2] },
      handler
    );
    const response = new Uint8Array(32);
    response.set([0xff, 0, 2]);
    expect(command.isSameRequest(response)).toBe(true);
    expect(command.createResponse(response).unhandled).toBe(true);
  });

  test('set value', () => {
    const command = new CustomMenuSetValueCommand(
      { commandBytes: [0, 2], value: [0x06, 0x40] },
      handler
    );
    expect(Array.from(command.createReport())).toEqual([
      0x07, 0, 2, 0x06, 0x40,
    ]);
    const response = new Uint8Array(32);
    response.set([0x07, 0, 2, 0x06, 0x40]);
    expect(command.isSameRequest(response)).toBe(true);
    expect(command.createResponse(response).unhandled).toBe(false);
  });

  test('save', () => {
    const command = new CustomMenuSaveCommand({ channelId: 0 }, handler);
    expect(Array.from(command.createReport())).toEqual([0x09, 0]);
    const response = new Uint8Array(32);
    response.set([0x09, 0]);
    expect(command.isSameRequest(response)).toBe(true);
    const lighting = new Uint8Array(32);
    lighting.set([0x09, 2]);
    expect(command.isSameRequest(lighting)).toBe(false);
  });
});
