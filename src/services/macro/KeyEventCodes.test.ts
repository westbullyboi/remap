import { describe, expect, test } from 'vitest';
import { hidUsageOf, isModifierUsage } from './KeyEventCodes';

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
});
