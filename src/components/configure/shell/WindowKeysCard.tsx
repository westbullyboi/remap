import React, { useEffect, useRef, useState } from 'react';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import { firmwareFlasherStore } from '../firmware/firmwareFlasherStore';

// Window keys (firmware r31): custom keys Win ◧ … Win ↺ (QK_KB_10..15) send
// the shortcut of the connected OS. Values 0xB0..0xBB: key n, PC = 0xB0 +
// n * 2, Mac = + 1 (QMK keycodes: modifiers << 8 | key).
const WINDOW_KEY_BASE = 0xb0;

const KEYS = [
  { short: 'Win ◧', label: 'Left half' },
  { short: 'Win ◨', label: 'Right half' },
  { short: 'Win ▣', label: 'Maximize' },
  { short: 'Win _', label: 'Minimize' },
  { short: 'Win ⇥', label: 'Next display' },
  { short: 'Win ↺', label: 'Restore' },
];

const CTL = 0x100;
const SFT = 0x200;
const ALT = 0x400;
const GUI = 0x800;
const LEFT = 0x50;
const RIGHT = 0x4f;
const UP = 0x52;
const DOWN = 0x51;
const ENTER = 0x28;
const BSPC = 0x2a;
const KEY_M = 0x10;
const KEY_F = 0x09;

// Shortcuts to choose from, per OS.
const PC_OPTIONS = [
  0,
  GUI | LEFT,
  GUI | RIGHT,
  GUI | UP,
  GUI | DOWN,
  GUI | SFT | RIGHT,
  GUI | SFT | LEFT,
];
const MAC_OPTIONS = [
  0,
  CTL | ALT | LEFT,
  CTL | ALT | RIGHT,
  CTL | ALT | ENTER,
  CTL | ALT | BSPC,
  CTL | ALT | GUI | RIGHT,
  CTL | ALT | GUI | LEFT,
  GUI | KEY_M,
  CTL | GUI | KEY_F,
];

const KEY_NAMES: { [code: number]: string } = {
  [LEFT]: '←',
  [RIGHT]: '→',
  [UP]: '↑',
  [DOWN]: '↓',
  [ENTER]: 'Return',
  [BSPC]: 'Delete',
  [KEY_M]: 'M',
  [KEY_F]: 'F',
};

export function shortcutLabel(code: number, mac: boolean): string {
  if (!code) return t('None');
  const mods = code >> 8;
  const parts: string[] = [];
  if (mac) {
    if (mods & 1) parts.push('⌃');
    if (mods & 4) parts.push('⌥');
    if (mods & 2) parts.push('⇧');
    if (mods & 8) parts.push('⌘');
  } else {
    if (mods & 8) parts.push('Win');
    if (mods & 1) parts.push('Ctrl');
    if (mods & 4) parts.push('Alt');
    if (mods & 2) parts.push('Shift');
  }
  const key =
    KEY_NAMES[code & 0xff] ?? `0x${(code & 0xff).toString(16).toUpperCase()}`;
  return mac ? parts.join('') + key : [...parts, key].join(' + ');
}

export function WindowKeysCard(props: { keyboard: IKeyboard | null }) {
  const { keyboard } = props;
  const [supported, setSupported] = useState<boolean | null>(null);
  const [codes, setCodes] = useState<number[][] | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSupported(null);
    setCodes(null);
    if (!keyboard) return;
    (async () => {
      const next: number[][] = [];
      for (let k = 0; k < KEYS.length; k++) {
        const pair: number[] = [];
        for (const os of [0, 1]) {
          const r = await keyboard.fetchCustomValue(
            WINDOW_KEY_BASE + k * 2 + os,
            2
          );
          if (!r.success || r.unhandled) {
            if (!cancelled) setSupported(false);
            return;
          }
          pair.push(r.value!);
        }
        next.push(pair);
      }
      if (cancelled) return;
      setCodes(next);
      setSupported(true);
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [keyboard]);

  if (!keyboard || supported === null) return null;
  if (!supported || !codes) {
    return (
      <div className="mx-osbar mx-osbar-off">
        <span>
          {t(
            'Window keys need newer firmware (Matrix r{{revision}} or later).',
            { revision: 31 }
          )}
        </span>
        <button
          type="button"
          className="mx-btn mx-press"
          onClick={() => firmwareFlasherStore.open(keyboard)}
        >
          {t('Write firmware')}
        </button>
      </div>
    );
  }

  const change = async (key: number, os: number, code: number) => {
    const next = codes.map((p) => p.slice());
    next[key][os] = code;
    setCodes(next);
    setSaving(true);
    await keyboard.updateCustomValue(WINDOW_KEY_BASE + key * 2 + os, code, 2);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await keyboard.saveCustomValues();
      setSaving(false);
    }, 400);
  };

  const select = (key: number, os: number) => {
    const mac = os === 1;
    const options = mac ? MAC_OPTIONS : PC_OPTIONS;
    const value = codes[key][os];
    return (
      <select
        className="pointing-select"
        value={value}
        aria-label={`${t(KEYS[key].label)} (${mac ? 'Mac' : 'PC'})`}
        onChange={(e) => change(key, os, Number(e.target.value))}
      >
        {!options.includes(value) && (
          <option value={value}>{shortcutLabel(value, mac)}</option>
        )}
        {options.map((code) => (
          <option key={code} value={code}>
            {shortcutLabel(code, mac)}
          </option>
        ))}
      </select>
    );
  };

  return (
    <section className="window-keys" aria-busy={saving}>
      <h3>{t('Window keys')}</h3>
      <p className="mx-sub">
        {t(
          'Put Win ◧, Win ◨, Win ▣, Win _, Win ⇥ and Win ↺ (Key Config > Custom) on the keymap: they send the shortcut of the connected OS. On a Mac the defaults are those of the free app Rectangle (install it, or set your own shortcuts): the shortcuts built into macOS use the Fn / Globe key, which this keyboard cannot send.'
        )}
      </p>
      <table className="window-keys-table">
        <thead>
          <tr>
            <th>{t('Key')}</th>
            <th>PC (Windows)</th>
            <th>Mac</th>
          </tr>
        </thead>
        <tbody>
          {KEYS.map((k, i) => (
            <tr key={k.short}>
              <td>
                <b>{k.short}</b> {t(k.label)}
              </td>
              <td>{select(i, 0)}</td>
              <td>{select(i, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
