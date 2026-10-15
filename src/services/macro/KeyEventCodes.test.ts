import { describe, expect, test } from 'vitest';
import {
  hidUsageOf,
  isModifierUsage,
  SHORTCUT_KEY_USAGES,
  shortcutFromEvent,
  usageName,
} from './KeyEventCodes';

describe('KeyEventCodes', () => {
  test('HID usages of KeyboardEvent.code', () => {
    expect(hidUsageOf('KeyA')).toBe(0x04);
    expect(hidUsageOf('KeyZ')).toBe(0x1d);
    expect(hidUsageOf('Digit1')).toBe(0x1e);
    expect(hidUsageOf('Digit0')).toBe(0x27);
    expect(hidUsageOf('F1')).toBe(0x3a);
    expect(hidUsageOf('F12')).toBe(0x45);
    expect(hidUsageOf('F13')).toBe(0x68);
    expect(hidUsageOf('MetaLeft')).toBe(0xe3);
    expect(hidUsageOf('ArrowUp')).toBe(0x52);
    expect(hidUsageOf('Unknown')).toBeNull();
    expect(isModifierUsage(0xe3)).toBe(true);
    expect(isModifierUsage(0x04)).toBe(false);
  });

  test('names usages', () => {
    expect(usageName(0x04)).toBe('A');
    expect(usageName(0x1e)).toBe('1');
    expect(usageName(0x27)).toBe('0');
    expect(usageName(0x45)).toBe('F12');
    expect(usageName(0x73)).toBe('F24');
    expect(usageName(0x50)).toBe('←');
    expect(usageName(0xa5)).toBe('0xA5');
  });

  test('shortcut keys are unique and not modifiers', () => {
    expect(new Set(SHORTCUT_KEY_USAGES).size).toBe(SHORTCUT_KEY_USAGES.length);
    expect(SHORTCUT_KEY_USAGES.some(isModifierUsage)).toBe(false);
  });

  test('shortcut from a key press', () => {
    const base = {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    };
    expect(
      shortcutFromEvent({ ...base, code: 'ArrowLeft', metaKey: true })
    ).toBe(0x800 | 0x50);
    expect(
      shortcutFromEvent({
        ...base,
        code: 'KeyZ',
        ctrlKey: true,
        shiftKey: true,
      })
    ).toBe(0x300 | 0x1d);
    expect(
      shortcutFromEvent({ ...base, code: 'ControlLeft', ctrlKey: true })
    ).toBe(null);
    expect(shortcutFromEvent({ ...base, code: 'Unknown' })).toBe(null);
  });
});
