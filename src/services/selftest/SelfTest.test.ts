import { describe, expect, test } from 'vitest';
import { IKeyboard, IKeymap } from '../hid/Hid';
import {
  buildReport,
  describeKey,
  describeWheel,
  findCustomKeys,
  pushEntry,
  QK_KB_0,
  runFirmwareChecks,
} from './SelfTest';

const mods = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };

// A keyboard answering the given custom values (others: id_unhandled).
function fakeKeyboard(values: { [id: number]: number[] }): IKeyboard {
  return {
    fetchCustomValue: async (id: number, size: number) => {
      const bytes = values[id];
      if (!bytes) return { success: true, unhandled: true };
      let value = 0;
      for (let i = 0; i < size; i++) value = value * 256 + (bytes[i] ?? 0);
      return { success: true, value, bytes: Uint8Array.from(bytes) };
    },
  } as unknown as IKeyboard;
}

describe('SelfTest', () => {
  test('latest firmware: every check read', async () => {
    const values: { [id: number]: number[] } = {
      0x00: [0x4d, 0x58],
      0x7c: [0, 33],
      0x7d: [1, 0, 33, 0x12, 0x34, 0x12, 0x34],
      0xbc: [1],
      0xbd: [2],
      0xbe: [0],
      0xbf: [0],
      0xc0: [2],
      0xc1: [0],
      0xcb: [0x00, 0xaa],
      0xcc: [0x00, 0xa9],
      0xcd: [15],
      0xa1: [1],
      0xa4: [3],
      0xa5: [1],
      0xa7: [3, 0],
      0xa9: [0, 0, 0, 0],
      0xaa: [1],
      0xab: [3],
      0xac: [4],
      0xae: [1],
    };
    for (let k = 0; k < 12; k++) values[0xb0 + k] = [0x08, 0x50];
    const r = await runFirmwareChecks(fakeKeyboard(values));
    expect(r.revision).toBe(33);
    expect(r.detectedOs).toBe(3);
    expect(r.touchpadModes).toEqual([1, 3, 4]);
    expect(r.windowKeys![0]).toEqual([0x850, 0x850]);
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ['revision', 'ok'],
      ['split', 'ok'],
      ['os', 'ok'],
      ['mirror', 'ok'],
      ['motion', 'ok'],
      ['tpModes', 'ok'],
      ['windowKeys', 'ok'],
      ['knobs', 'ok'],
      ['rotation', 'ok'],
    ]);
  });

  test('older firmware: newer features marked as not there', async () => {
    const r = await runFirmwareChecks(
      fakeKeyboard({
        0x00: [0x4d, 0x58],
        0x7c: [0, 29],
        0x7d: [1, 0, 29, 1, 1, 1, 1],
        0xa1: [0],
        0xa4: [2],
        0xa5: [0],
        0xa7: [3, 1],
        0xa9: [10, 0, 0, 50],
      })
    );
    const status = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
    expect(status.revision).toBe('old');
    expect(status.tpModes).toBe('old');
    expect(status.windowKeys).toBe('old');
    expect(status.knobs).toBe('old');
    expect(status.rotation).toBe('old');
    expect(status.motion).toBe('ok');
    expect(r.windowKeys).toBe(null);
  });

  test('not a Matrix keyboard', async () => {
    const r = await runFirmwareChecks(fakeKeyboard({}));
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].id).toBe('protocol');
  });

  test('finds the custom keys on the keymap', () => {
    const km = (code: number) => ({ code }) as IKeymap;
    const found = findCustomKeys([
      { '0,0': km(0x04), '0,1': km(QK_KB_0 + 6) },
      { '0,0': km(QK_KB_0 + 6), '1,1': km(QK_KB_0 + 10) },
    ]);
    expect(found.get(6)).toEqual([0, 1]);
    expect(found.get(10)).toEqual([1]);
    expect(found.has(7)).toBe(false);
  });

  test('describes input', () => {
    expect(describeKey({ ...mods, key: 'z', ctrlKey: true })).toBe('Ctrl + Z');
    expect(describeKey({ ...mods, key: 'Shift', shiftKey: true })).toBe(null);
    expect(describeKey({ ...mods, key: 'ArrowLeft' })).toBe('ArrowLeft');
    expect(describeWheel({ ...mods, deltaX: 0, deltaY: 100 })).toBe('↓');
    expect(
      describeWheel({ ...mods, deltaX: 0, deltaY: -3, ctrlKey: true })
    ).toBe('Ctrl + ↑');
    expect(describeWheel({ ...mods, deltaX: -8, deltaY: 1 })).toBe('←');
    expect(describeWheel({ ...mods, deltaX: 0, deltaY: 0 })).toBe(null);
  });

  test('merges repeated input', () => {
    let log = pushEntry([], 'wheel', '↓');
    log = pushEntry(log, 'wheel', '↓');
    log = pushEntry(log, 'key', 'A');
    expect(log).toEqual([
      { kind: 'key', text: 'A', count: 1 },
      { kind: 'wheel', text: '↓', count: 2 },
    ]);
    for (let i = 0; i < 20; i++) log = pushEntry(log, 'key', String(i));
    expect(log).toHaveLength(8);
  });

  test('report text', () => {
    const text = buildReport({
      app: 'matrix',
      userAgent: 'UA',
      firmware: {
        checks: [
          {
            id: 'revision',
            label: 'Firmware revision',
            revision: 0,
            status: 'ok',
            detail: 'r{{revision}}',
            values: { revision: 31 },
          },
        ],
        revision: 31,
        touchpadModes: null,
        detectedOs: 2,
        windowKeys: null,
      },
      translate: (s, v) => s.replace('{{revision}}', String(v?.revision)),
      manual: [
        { label: 'TP1', result: 'ok' },
        { label: 'Win ◧', result: 'ng', note: 'missing' },
        { label: 'bar', result: '' },
      ],
    });
    expect(text).toContain('OK Firmware revision: r31');
    expect(text).toContain('OK TP1');
    expect(text).toContain('NG Win ◧ — missing');
    expect(text).toContain('   bar');
  });
});
