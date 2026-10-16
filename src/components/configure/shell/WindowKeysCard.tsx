import React, { useEffect, useRef, useState } from 'react';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import { firmwareFlasherStore } from '../firmware/firmwareFlasherStore';
import {
  MOD_ALT,
  MOD_CTRL,
  MOD_GUI,
  MOD_SHIFT,
  SHORTCUT_KEY_USAGES,
  shortcutFromEvent,
  usageName,
} from '../../../services/macro/KeyEventCodes';

// Window keys (firmware r31): custom keys Win ◧ … Win ↺ (QK_KB_10..15) send
// the shortcut of the connected OS. Values 0xB0..0xBB: key n, PC = 0xB0 +
// n * 2, Mac = + 1 (QMK keycodes: modifiers << 8 | key).
export const WINDOW_KEY_BASE = 0xb0;

export const WINDOW_KEYS = [
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
const KEY_Z = 0x1d;
const KEY_D = 0x07;
const KEY_C = 0x06;
const KEY_U = 0x18;
const KEY_I = 0x0c;
const KEY_J = 0x0d;
const KEY_K = 0x0e;
const TAB = 0x2b;
const HOME = 0x4a;
// The "Custom..." choice of the lists.
const CUSTOM = -1;

// Shortcuts to choose from, per OS.
export const PC_OPTIONS = [
  0,
  GUI | LEFT,
  GUI | RIGHT,
  GUI | UP,
  GUI | DOWN,
  GUI | SFT | RIGHT,
  GUI | SFT | LEFT,
  GUI | SFT | UP,
  GUI | KEY_Z,
  GUI | TAB,
  GUI | KEY_D,
  GUI | HOME,
];
export const MAC_OPTIONS = [
  0,
  CTL | ALT | LEFT,
  CTL | ALT | RIGHT,
  CTL | ALT | ENTER,
  CTL | ALT | BSPC,
  CTL | ALT | GUI | RIGHT,
  CTL | ALT | GUI | LEFT,
  CTL | ALT | KEY_U,
  CTL | ALT | KEY_I,
  CTL | ALT | KEY_J,
  CTL | ALT | KEY_K,
  CTL | ALT | KEY_C,
  GUI | KEY_M,
  CTL | GUI | KEY_F,
  CTL | UP,
  CTL | DOWN,
];

// What the shortcuts do (Windows 11 / Rectangle's defaults on a Mac).
const PC_NAMES: { [code: number]: string } = {
  [GUI | LEFT]: 'Left half',
  [GUI | RIGHT]: 'Right half',
  [GUI | UP]: 'Maximize',
  [GUI | DOWN]: 'Minimize / restore',
  [GUI | SFT | RIGHT]: 'Next display',
  [GUI | SFT | LEFT]: 'Previous display',
  [GUI | SFT | UP]: 'Full height',
  [GUI | KEY_Z]: 'Snap layouts',
  [GUI | TAB]: 'Task view',
  [GUI | KEY_D]: 'Show the desktop',
  [GUI | HOME]: 'Minimize the other windows',
};
const MAC_NAMES: { [code: number]: string } = {
  [CTL | ALT | LEFT]: 'Left half',
  [CTL | ALT | RIGHT]: 'Right half',
  [CTL | ALT | ENTER]: 'Maximize',
  [CTL | ALT | BSPC]: 'Restore',
  [CTL | ALT | GUI | RIGHT]: 'Next display',
  [CTL | ALT | GUI | LEFT]: 'Previous display',
  [CTL | ALT | KEY_U]: 'Top left quarter',
  [CTL | ALT | KEY_I]: 'Top right quarter',
  [CTL | ALT | KEY_J]: 'Bottom left quarter',
  [CTL | ALT | KEY_K]: 'Bottom right quarter',
  [CTL | ALT | KEY_C]: 'Center',
  [GUI | KEY_M]: 'Minimize',
  [CTL | GUI | KEY_F]: 'Full screen',
  [CTL | UP]: 'Mission Control',
  [CTL | DOWN]: "The app's windows",
};

// "Win + Z (Snap layouts)".
export function shortcutChoiceLabel(code: number, mac: boolean): string {
  const name = (mac ? MAC_NAMES : PC_NAMES)[code];
  return name
    ? `${shortcutLabel(code, mac)} (${t(name)})`
    : shortcutLabel(code, mac);
}

const MAC_KEY_NAMES: { [usage: number]: string } = {
  [ENTER]: 'Return',
  [BSPC]: 'Delete',
  0x4c: 'Forward Delete',
};

export function shortcutLabel(code: number, mac: boolean): string {
  if (!code) return t('None');
  const mods = code >> 8;
  const parts: string[] = [];
  if (mac) {
    if (mods & MOD_CTRL) parts.push('⌃');
    if (mods & MOD_ALT) parts.push('⌥');
    if (mods & MOD_SHIFT) parts.push('⇧');
    if (mods & MOD_GUI) parts.push('⌘');
  } else {
    if (mods & MOD_GUI) parts.push('Win');
    if (mods & MOD_CTRL) parts.push('Ctrl');
    if (mods & MOD_ALT) parts.push('Alt');
    if (mods & MOD_SHIFT) parts.push('Shift');
  }
  const usage = code & 0xff;
  const key = (mac && MAC_KEY_NAMES[usage]) || usageName(usage);
  return mac ? parts.join('') + key : [...parts, key].join(' + ');
}

// The modifier toggles, in the order the OS shows them.
const MOD_BUTTONS = (mac: boolean) =>
  mac
    ? [
        { bit: MOD_CTRL, label: '⌃ Control' },
        { bit: MOD_ALT, label: '⌥ Option' },
        { bit: MOD_SHIFT, label: '⇧ Shift' },
        { bit: MOD_GUI, label: '⌘ Command' },
      ]
    : [
        { bit: MOD_GUI, label: 'Win' },
        { bit: MOD_CTRL, label: 'Ctrl' },
        { bit: MOD_ALT, label: 'Alt' },
        { bit: MOD_SHIFT, label: 'Shift' },
      ];

// Any shortcut: modifiers + one key, typed on the keyboard or picked.
export function ShortcutEditor(props: {
  mac: boolean;
  value: number;
  onApply: (code: number) => void;
  onCancel: () => void;
}) {
  const { mac } = props;
  const [mods, setMods] = useState((props.value >> 8) & 0x0f);
  const [key, setKey] = useState(props.value & 0xff || 0x50);
  const [listening, setListening] = useState(false);
  const captureRef = useRef<HTMLButtonElement | null>(null);
  const code = (mods << 8) | key;

  return (
    <div className="shortcut-editor" role="group" aria-label={t('Shortcut')}>
      <div className="shortcut-editor-row">
        <button
          ref={captureRef}
          type="button"
          className={`mx-btn mx-press shortcut-capture${
            listening ? ' on' : ''
          }`}
          aria-pressed={listening}
          onClick={() => {
            setListening(!listening);
            captureRef.current?.focus();
          }}
          onBlur={() => setListening(false)}
          onKeyDown={(e) => {
            if (!listening) return;
            e.preventDefault();
            e.stopPropagation();
            const next = shortcutFromEvent(e);
            if (next === null) return;
            setMods(next >> 8);
            setKey(next & 0xff);
            setListening(false);
          }}
        >
          {listening ? t('Press the shortcut...') : t('Type the shortcut')}
        </button>
        <b className="shortcut-preview">{shortcutLabel(code, mac)}</b>
      </div>
      <div className="shortcut-editor-row">
        {MOD_BUTTONS(mac).map((m) => (
          <label key={m.bit} className="shortcut-mod">
            <input
              type="checkbox"
              checked={(mods & m.bit) !== 0}
              onChange={(e) =>
                setMods(e.target.checked ? mods | m.bit : mods & ~m.bit)
              }
            />
            {m.label}
          </label>
        ))}
        <select
          className="pointing-select"
          value={key}
          aria-label={t('Key')}
          onChange={(e) => setKey(Number(e.target.value))}
        >
          {!SHORTCUT_KEY_USAGES.includes(key) && (
            <option value={key}>{usageName(key)}</option>
          )}
          {SHORTCUT_KEY_USAGES.map((u) => (
            <option key={u} value={u}>
              {(mac && MAC_KEY_NAMES[u]) || usageName(u)}
            </option>
          ))}
        </select>
      </div>
      <p className="mx-sub">
        {t(
          'Shortcuts the OS takes first (such as Win + arrow keys) cannot be typed here: tick the modifiers and pick the key instead.'
        )}
      </p>
      <div className="shortcut-editor-row">
        <button
          type="button"
          className="mx-btn dark mx-press"
          onClick={() => props.onApply(code)}
        >
          {t('Apply')}
        </button>
        <button
          type="button"
          className="mx-btn mx-press"
          onClick={props.onCancel}
        >
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}

export function WindowKeysCard(props: { keyboard: IKeyboard | null }) {
  const { keyboard } = props;
  const [supported, setSupported] = useState<boolean | null>(null);
  const [codes, setCodes] = useState<number[][] | null>(null);
  const [saving, setSaving] = useState(false);
  // The shortcut being edited: [key, os].
  const [editing, setEditing] = useState<[number, number] | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSupported(null);
    setCodes(null);
    if (!keyboard) return;
    (async () => {
      const next: number[][] = [];
      for (let k = 0; k < WINDOW_KEYS.length; k++) {
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
        aria-label={`${t(WINDOW_KEYS[key].label)} (${mac ? 'Mac' : 'PC'})`}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v === CUSTOM) setEditing([key, os]);
          else change(key, os, v);
        }}
      >
        {!options.includes(value) && (
          <option value={value}>{shortcutChoiceLabel(value, mac)}</option>
        )}
        {options.map((code) => (
          <option key={code} value={code}>
            {shortcutChoiceLabel(code, mac)}
          </option>
        ))}
        <option value={CUSTOM}>{t('Custom...')}</option>
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
          {WINDOW_KEYS.map((k, i) => (
            <React.Fragment key={k.short}>
              <tr>
                <td>
                  <b>{k.short}</b> {t(k.label)}
                </td>
                <td>{select(i, 0)}</td>
                <td>{select(i, 1)}</td>
              </tr>
              {editing && editing[0] === i && (
                <tr className="window-keys-edit">
                  <td colSpan={3}>
                    <span className="mx-sub">
                      {t('{{key}} on a {{os}}', {
                        key: `${k.short} ${t(k.label)}`,
                        os: editing[1] === 1 ? 'Mac' : 'PC',
                      })}
                    </span>
                    <ShortcutEditor
                      key={editing[1]}
                      mac={editing[1] === 1}
                      value={codes[i][editing[1]]}
                      onApply={(code) => {
                        change(i, editing[1], code);
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}
