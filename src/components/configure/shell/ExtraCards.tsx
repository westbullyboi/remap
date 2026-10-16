import React, { useEffect, useRef, useState } from 'react';
import { Slider } from '@mui/material';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  EXTRA_REVISION,
  fetchWindowHolds,
  HOME_LED_COLOR_ID,
  HOME_LED_ID,
  LOCK_CHOICES,
  LOCK_MINUTES_ID,
  readExtraByte,
  windowHoldIds,
} from '../../../services/pointing/ExtraBlock';
import {
  SAVE_DELAY_MS,
  SaveChip,
  SaveState,
  UpdateNotice,
} from '../pointing/EdgeKnobShared';
import {
  shortcutChoiceLabel,
  ShortcutEditor,
  WINDOW_KEYS,
} from './WindowKeysCard';

// Writes values and saves shortly after the last one.
function useWriter(keyboard: IKeyboard | null) {
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [keyboard]
  );
  const write = (writes: [number, number, 1 | 2][]) => {
    if (!keyboard) return;
    setSaveState('busy');
    queue.current = queue.current.then(async () => {
      for (const [id, value, size] of writes) {
        const r = await keyboard.updateCustomValue(id, value, size);
        if (!r.success) {
          setSaveState('error');
          return;
        }
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const saved = await keyboard.saveCustomValues();
        setSaveState(saved.success ? 'saved' : 'error');
      }, SAVE_DELAY_MS);
    });
  };
  return { saveState, write };
}

// One-byte values of the extra block: null while reading, false on older
// firmware.
function useBytes(keyboard: IKeyboard | null, ids: number[]) {
  const [values, setValues] = useState<number[] | null | false>(null);
  useEffect(() => {
    let cancelled = false;
    setValues(null);
    if (!keyboard) return;
    (async () => {
      try {
        const next: number[] = [];
        for (const id of ids) {
          const v = await readExtraByte(keyboard, id);
          if (v === null) {
            if (!cancelled) setValues(false);
            return;
          }
          next.push(v);
        }
        if (!cancelled) setValues(next);
      } catch {
        if (!cancelled) setValues(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [keyboard]);
  return [values, setValues] as const;
}

const COLORS = [
  { value: 0, label: 'Lighting color' },
  { value: 2, label: 'Red' },
  { value: 3, label: 'Green' },
  { value: 4, label: 'Yellow' },
  { value: 5, label: 'Blue' },
  { value: 6, label: 'Magenta' },
  { value: 7, label: 'Cyan' },
  { value: 8, label: 'White' },
];

function Card(props: {
  title: string;
  description: string;
  saveState: SaveState;
  values: unknown;
  keyboard: IKeyboard | null;
  children: React.ReactNode;
}) {
  return (
    <section className="pointing-card edge-knob-card">
      <div className="pointing-card-header">
        <h2>
          {props.title}
          {props.values ? <SaveChip state={props.saveState} /> : null}
        </h2>
        <span>{props.description}</span>
      </div>
      {props.values === false ? (
        <UpdateNotice keyboard={props.keyboard} revision={EXTRA_REVISION} />
      ) : props.values === null ? (
        <p className="pointing-checking">{t('Reading from the keyboard...')}</p>
      ) : (
        props.children
      )}
    </section>
  );
}

// Home row marks (JS): the base layer's F and J keys stay lit.
export function HomeRowCard(props: { keyboard: IKeyboard | null }) {
  const [values, setValues] = useBytes(props.keyboard, [
    HOME_LED_ID,
    HOME_LED_COLOR_ID,
  ]);
  const { saveState, write } = useWriter(props.keyboard);
  const v = values || [0, 0];
  return (
    <Card
      title={t('Home row marks')}
      description={t(
        'The keys of F and J on the base layer (also as the tap of a hold key) stay softly lit, over the lighting effect, so the hands find the home row. Needs the lighting on.'
      )}
      saveState={saveState}
      values={values}
      keyboard={props.keyboard}
    >
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Brightness')}</span>
          <span className="help">{t('0 turns the marks off.')}</span>
        </div>
        <div className="pointing-row-control">
          <div className="pointing-range edge-knob-range">
            <Slider
              value={v[0]}
              min={0}
              max={100}
              step={5}
              size="small"
              aria-label={t('Brightness')}
              onChange={(_, x) => {
                setValues([x as number, v[1]]);
                write([[HOME_LED_ID, x as number, 1]]);
              }}
            />
            <span className="pointing-value">
              {v[0] ? `${v[0]} %` : t('Off')}
            </span>
          </div>
        </div>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Color')}</span>
        </div>
        <div className="pointing-row-control">
          <select
            className="pointing-select"
            value={v[1]}
            disabled={!v[0]}
            aria-label={t('Color')}
            onChange={(e) => {
              const c = Number(e.target.value);
              setValues([v[0], c]);
              write([[HOME_LED_COLOR_ID, c, 1]]);
            }}
          >
            {COLORS.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Card>
  );
}

// Screen lock after no input (KA).
export function AutoLockCard(props: { keyboard: IKeyboard | null }) {
  const [values, setValues] = useBytes(props.keyboard, [LOCK_MINUTES_ID]);
  const { saveState, write } = useWriter(props.keyboard);
  const minutes = values ? values[0] : 0;
  return (
    <Card
      title={t('Lock the screen when away')}
      description={t(
        'With no key, knob or touchpad input for this long, the keyboard sends the screen lock shortcut once: Win + L (Ctrl + Cmd + Q on a Mac). Not while the computer sleeps.'
      )}
      saveState={saveState}
      values={values}
      keyboard={props.keyboard}
    >
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Lock after')}</span>
          <span className="help">
            {t(
              'Watching a video or presenting without touching the keyboard also counts as no input.'
            )}
          </span>
        </div>
        <div className="pointing-row-control">
          <select
            className="pointing-select"
            value={minutes}
            aria-label={t('Lock after')}
            onChange={(e) => {
              const m = Number(e.target.value);
              setValues([m]);
              write([[LOCK_MINUTES_ID, m, 1]]);
            }}
          >
            {LOCK_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m ? t('{{n}} min', { n: m }) : t('Never')}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Card>
  );
}

// Window keys held (JU): presets of [first, then] shortcuts.
const CTL = 0x100;
const SFT = 0x200;
const ALT = 0x400;
const GUI = 0x800;
const LEFT = 0x50;
const RIGHT = 0x4f;
const UP = 0x52;
const DOWN = 0x51;
const ENTER = 0x28;
type HoldPreset = { codes: [number, number]; label: string };
const PC_HOLDS: HoldPreset[] = [
  { codes: [0, 0], label: 'Nothing (same as a press)' },
  { codes: [GUI | LEFT, GUI | UP], label: 'Top left quarter' },
  { codes: [GUI | RIGHT, GUI | UP], label: 'Top right quarter' },
  { codes: [GUI | LEFT, GUI | DOWN], label: 'Bottom left quarter' },
  { codes: [GUI | RIGHT, GUI | DOWN], label: 'Bottom right quarter' },
  { codes: [GUI | SFT | LEFT, 0], label: 'Previous display' },
  { codes: [GUI | SFT | RIGHT, 0], label: 'Next display' },
  { codes: [GUI | UP, 0], label: 'Maximize' },
  { codes: [GUI | 0x1d, 0], label: 'Snap layouts' },
];
const MAC_HOLDS: HoldPreset[] = [
  { codes: [0, 0], label: 'Nothing (same as a press)' },
  { codes: [CTL | ALT | 0x18, 0], label: 'Top left quarter' },
  { codes: [CTL | ALT | 0x0c, 0], label: 'Top right quarter' },
  { codes: [CTL | ALT | 0x0d, 0], label: 'Bottom left quarter' },
  { codes: [CTL | ALT | 0x0e, 0], label: 'Bottom right quarter' },
  { codes: [CTL | ALT | GUI | LEFT, 0], label: 'Previous display' },
  { codes: [CTL | ALT | GUI | RIGHT, 0], label: 'Next display' },
  { codes: [CTL | ALT | ENTER, 0], label: 'Maximize' },
  { codes: [CTL | ALT | 0x06, 0], label: 'Center' },
];
const CUSTOM = 'custom';

function holdLabel(codes: number[], mac: boolean): string {
  return codes
    .filter((c) => c)
    .map((c) => shortcutChoiceLabel(c, mac))
    .join(' → ');
}

export function WindowHoldCard(props: { keyboard: IKeyboard | null }) {
  const { keyboard } = props;
  const [holds, setHolds] = useState<number[][][] | null | false>(null);
  const [editing, setEditing] = useState<[number, number] | null>(null);
  const { saveState, write } = useWriter(keyboard);
  useEffect(() => {
    let cancelled = false;
    setHolds(null);
    if (!keyboard) return;
    fetchWindowHolds(keyboard, WINDOW_KEYS.length)
      .then((r) => !cancelled && setHolds(r === null ? false : r))
      .catch(() => !cancelled && setHolds(false));
    return () => {
      cancelled = true;
    };
  }, [keyboard]);
  if (!keyboard) return null;

  const change = (key: number, os: number, codes: [number, number]) => {
    if (!holds) return;
    const next = holds.map((k) => k.map((o) => o.slice()));
    next[key][os] = codes;
    setHolds(next);
    const [a, b] = windowHoldIds(key, os === 1);
    write([
      [a, codes[0], 2],
      [b, codes[1], 2],
    ]);
  };

  const select = (key: number, os: number) => {
    if (!holds) return null;
    const mac = os === 1;
    const presets = mac ? MAC_HOLDS : PC_HOLDS;
    const codes = holds[key][os];
    const index = presets.findIndex(
      (p) => p.codes[0] === codes[0] && p.codes[1] === codes[1]
    );
    return (
      <select
        className="pointing-select"
        value={index >= 0 ? String(index) : 'current'}
        aria-label={`${t(WINDOW_KEYS[key].label)} ${t('held')} (${
          mac ? 'Mac' : 'PC'
        })`}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) setEditing([key, os]);
          else if (v !== 'current') change(key, os, presets[Number(v)].codes);
        }}
      >
        {index < 0 && <option value="current">{holdLabel(codes, mac)}</option>}
        {presets.map((p, i) => (
          <option key={i} value={String(i)}>
            {t(p.label)}
            {p.codes[0] ? ` — ${holdLabel(p.codes, mac)}` : ''}
          </option>
        ))}
        <option value={CUSTOM}>{t('Custom...')}</option>
      </select>
    );
  };

  return (
    <Card
      title={t('Window keys held')}
      description={t(
        'Holding a window key for the hold time (Knobs > Knob options) sends these instead, up to two shortcuts one after the other: on Windows, Win + ← then Win + ↑ puts the window in the top left quarter.'
      )}
      saveState={saveState}
      values={holds}
      keyboard={keyboard}
    >
      {holds && (
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
                      <ShortcutEditor
                        key={editing[1]}
                        mac={editing[1] === 1}
                        value={holds[i][editing[1]][0]}
                        onApply={(code) => {
                          change(i, editing[1], [code, 0]);
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
      )}
    </Card>
  );
}
