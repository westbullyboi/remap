import React, { useEffect, useRef, useState } from 'react';
import { Slider } from '@mui/material';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  SAVE_DELAY_MS,
  SaveChip,
  SaveState,
  UpdateNotice,
} from './EdgeKnobShared';

// Firmware r30: what the touchpad does while a Touchpad Mode key is held
// (custom keys TP1-TP3 in Key Config), and the edge slider's LED bar.
// Values on the VIA custom channel (matrix_pointing.c, mp_ext_fields).
export const TP_MODE_IDS = [0xaa, 0xab, 0xac];
export const TP_STEP_ID = 0xad;
export const EDGE_BAR_ID = 0xae;
export const EDGE_BAR_COLOR_ID = 0xaf;

// Actions, as numbered by the firmware (MP_TPM_*).
export const TP_MODE_ACTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Normal (cursor)' },
  { value: 1, label: 'Scroll' },
  { value: 2, label: 'Scroll up / down only' },
  { value: 10, label: 'Scroll left / right only' },
  { value: 3, label: 'Zoom (up / down)' },
  { value: 4, label: 'Arrow keys' },
  { value: 5, label: 'Volume (up / down)' },
  { value: 6, label: 'Switch tabs (left / right)' },
  { value: 7, label: 'Undo / redo (left / right)' },
  { value: 8, label: 'Page up / down' },
  { value: 9, label: 'Slow cursor (precision mode speed)' },
];

// Uses a step distance (one keycode per step).
const STEPPED = [3, 4, 5, 6, 7, 8];

const MODE_KEYS = ['TP1 (hold) / TP1 TG (toggle)', 'TP2 (hold)', 'TP3 (hold)'];

const BAR_COLORS = [
  { value: 0, label: 'Lighting color' },
  { value: 2, label: 'Red' },
  { value: 3, label: 'Green' },
  { value: 4, label: 'Yellow' },
  { value: 5, label: 'Blue' },
  { value: 6, label: 'Magenta' },
  { value: 7, label: 'Cyan' },
  { value: 8, label: 'White' },
];

type Values = {
  modes: number[];
  step: number;
  bar: number;
  barColor: number;
};

export function TouchpadModesCard(props: { keyboard: IKeyboard }) {
  const { keyboard } = props;
  const [supported, setSupported] = useState<boolean | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSupported(null);
    setValues(null);
    (async () => {
      const read = async (id: number) => {
        const r = await keyboard.fetchCustomValue(id, 1);
        if (!r.success || r.unhandled) throw r;
        return r.value!;
      };
      try {
        const next: Values = {
          modes: [
            await read(TP_MODE_IDS[0]),
            await read(TP_MODE_IDS[1]),
            await read(TP_MODE_IDS[2]),
          ],
          step: await read(TP_STEP_ID),
          bar: await read(EDGE_BAR_ID),
          barColor: await read(EDGE_BAR_COLOR_ID),
        };
        if (cancelled) return;
        setValues(next);
        setSupported(true);
      } catch {
        if (!cancelled) setSupported(false);
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [keyboard]);

  const write = (next: Values, id: number, value: number) => {
    setValues(next);
    setSaveState('busy');
    queue.current = queue.current.then(async () => {
      const r = await keyboard.updateCustomValue(id, value, 1);
      if (!r.success) {
        setSaveState('error');
        return;
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const saved = await keyboard.saveCustomValues();
        setSaveState(saved.success ? 'saved' : 'error');
      }, SAVE_DELAY_MS);
    });
  };

  const header = (
    <div className="pointing-card-header">
      <h2>
        {t('Touchpad while a key is held')}
        {values && <SaveChip state={saveState} />}
      </h2>
      <span>
        {t(
          'Hold a Touchpad Mode key and move a finger to scroll, zoom, use the arrow keys and more instead of moving the cursor. Put the keys TP1, TP1 TG, TP2 and TP3 on the keymap (Key Config > Custom). Works in the mouse mode (not in the precision touchpad mode).'
        )}
      </span>
    </div>
  );
  if (supported === false) {
    return (
      <section className="pointing-card edge-knob-card">
        {header}
        <UpdateNotice keyboard={keyboard} revision={30} />
      </section>
    );
  }
  if (!values) {
    return (
      <section className="pointing-card edge-knob-card">
        {header}
        <p className="pointing-checking">{t('Reading from the keyboard...')}</p>
      </section>
    );
  }

  const usesStep = values.modes.some((m) => STEPPED.includes(m));
  return (
    <section className="pointing-card edge-knob-card touchpad-modes-card">
      {header}
      {values.modes.map((mode, i) => (
        <div className="pointing-row" key={i}>
          <div className="pointing-row-label">
            <span className="label">{t('Mode {{n}}', { n: i + 1 })}</span>
            <span className="help">{t(MODE_KEYS[i])}</span>
          </div>
          <div className="pointing-row-control">
            <select
              className="pointing-select"
              value={mode}
              aria-label={t('Mode {{n}}', { n: i + 1 })}
              onChange={(e) => {
                const v = Number(e.target.value);
                const modes = values.modes.slice();
                modes[i] = v;
                write({ ...values, modes }, TP_MODE_IDS[i], v);
              }}
            >
              {TP_MODE_ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {t(a.label)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      {usesStep && (
        <div className="pointing-row">
          <div className="pointing-row-label">
            <span className="label">{t('Distance per step')}</span>
            <span className="help">
              {t(
                'For zoom, arrow keys, volume, tabs, undo and pages: finger movement for one step (smaller = faster).'
              )}
            </span>
          </div>
          <div className="pointing-row-control">
            <div className="pointing-range edge-knob-range">
              <Slider
                value={values.step}
                min={2}
                max={30}
                size="small"
                aria-label={t('Distance per step')}
                onChange={(_, v) =>
                  write(
                    { ...values, step: v as number },
                    TP_STEP_ID,
                    v as number
                  )
                }
              />
              <span className="pointing-value">{values.step} mm</span>
            </div>
          </div>
        </div>
      )}
      <div className="pointing-card-header touchpad-modes-sub">
        <h2>{t('Edge slider on the LEDs')}</h2>
        <span>
          {t(
            'While you slide along an edge of the touchpad, the LEDs show where the finger is along it as a bar (filling from the left, or from the bottom for the side edges).'
          )}
        </span>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Show the bar')}</span>
        </div>
        <div className="pointing-row-control">
          <label className="edge-knob-reverse">
            <input
              type="checkbox"
              checked={values.bar === 1}
              onChange={(e) => {
                const v = e.target.checked ? 1 : 0;
                write({ ...values, bar: v }, EDGE_BAR_ID, v);
              }}
            />
            {t('On')}
          </label>
          <select
            className="pointing-select"
            value={values.barColor}
            disabled={values.bar !== 1}
            aria-label={t('Bar color')}
            onChange={(e) => {
              const v = Number(e.target.value);
              write({ ...values, barColor: v }, EDGE_BAR_COLOR_ID, v);
            }}
          >
            {BAR_COLORS.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
