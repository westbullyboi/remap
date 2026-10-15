import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Slider } from '@mui/material';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import { RootState } from '../../../store/state';
import { KeycodeList } from '../../../services/hid/KeycodeList';
import { genKey } from '../keycodekey/KeyGen';
import Keycodes from '../keycodes/Keycodes.container';
import {
  fetchKnobExtras,
  KNOB_ACCELS,
  KNOB_MODES,
  KNOB_REVISION,
  KnobExtras,
  knobExtrasWrites,
} from '../../../services/pointing/KnobExtras';
import { fetchFirmwareRevision } from '../../../services/pointing/PointingSettings';
import { SAVE_DELAY_MS, SaveState, UpdateNotice } from './EdgeKnobShared';

// Firmware r32 knob settings: what turning does, acceleration, hold and
// double press of the push switch, the LED bar.
export function useKnobExtras(keyboard: IKeyboard | null) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [extras, setExtras] = useState<KnobExtras | null>(null);
  // Firmware revision: virtual desktops need r34 (older firmware would
  // take the value as the last mode it knows).
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const current = useRef<KnobExtras | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSupported(null);
    setExtras(null);
    if (!keyboard) return;
    fetchFirmwareRevision(keyboard).then((r) => !cancelled && setRevision(r));
    fetchKnobExtras(keyboard)
      .then((r) => {
        if (cancelled) return;
        current.current = r;
        setExtras(r);
        setSupported(r !== null);
      })
      .catch(() => !cancelled && setSupported(false));
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [keyboard]);

  const change = (next: KnobExtras) => {
    if (!keyboard || !current.current) return;
    const writes = knobExtrasWrites(current.current, next);
    current.current = next;
    setExtras(next);
    if (writes.length === 0) return;
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

  return { supported, extras, saveState, change, revision };
}

type Extras = ReturnType<typeof useKnobExtras>;

function useKeyLabel() {
  const labelLang = useSelector((s: RootState) => s.app.labelLang);
  const customKeycodes = useSelector(
    (s: RootState) => s.entities.keyboardDefinition?.customKeycodes
  );
  return (code: number) => {
    if (!code) return t('None');
    const keymap = KeycodeList.getKeymap(code, labelLang, customKeycodes);
    return genKey(keymap, labelLang).label.replace(/\n/g, ' ') || '—';
  };
}

// Rows of one knob's card: turning modes, acceleration, hold and double
// press.
export function KnobExtraRows(props: {
  knob: number;
  name: string;
  extras: Extras;
  keyboard: IKeyboard | null;
}) {
  const { knob, name, extras: x } = props;
  const label = useKeyLabel();
  const [picking, setPicking] = useState<'hold' | 'double' | null>(null);
  if (x.supported === false) {
    return (
      <div className="pointing-row">
        <UpdateNotice keyboard={props.keyboard} revision={KNOB_REVISION} />
      </div>
    );
  }
  const e = x.extras;
  if (!e) return null;

  const setMode = (pushed: number, value: number) => {
    const modes = e.modes.map((m) => m.slice());
    modes[knob][pushed] = value;
    x.change({ ...e, modes });
  };
  const setKey = (which: 'hold' | 'double', code: number) => {
    const list = (which === 'hold' ? e.holdKc : e.doubleKc).slice();
    list[knob] = code;
    x.change(
      which === 'hold' ? { ...e, holdKc: list } : { ...e, doubleKc: list }
    );
  };
  const modeSelect = (pushed: number) => (
    <select
      className="pointing-select"
      value={e.modes[knob][pushed]}
      aria-label={`${name} ${pushed ? t('Push and turn') : t('Turn')}`}
      onChange={(ev) => setMode(pushed, Number(ev.target.value))}
    >
      {KNOB_MODES.filter(
        (m) =>
          (m.revision ?? 0) <= x.revision || m.value === e.modes[knob][pushed]
      ).map((m) => (
        <option key={m.value} value={m.value}>
          {t(m.label)}
        </option>
      ))}
    </select>
  );
  const keyButton = (which: 'hold' | 'double') => {
    const code = (which === 'hold' ? e.holdKc : e.doubleKc)[knob];
    const on = picking === which;
    return (
      <div className="knob-any-keys">
        <button
          type="button"
          className={`mx-btn mx-press${on ? ' on' : ''}`}
          aria-pressed={on}
          onClick={() => setPicking(on ? null : which)}
        >
          <b>{label(code)}</b>
        </button>
        {code !== 0 && (
          <button
            type="button"
            className="mx-btn mx-press"
            onClick={() => setKey(which, 0)}
          >
            {t('Clear')}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Turning does')}</span>
          <span className="help">
            {t(
              'Switch windows: Alt + Tab (Cmd + Tab on a Mac) is held while you turn and let go when the knob rests. Select the layer: each step goes to the next / previous layer.'
            )}
          </span>
        </div>
        <div className="pointing-row-control">{modeSelect(0)}</div>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Push and turn does')}</span>
          <span className="help">
            {t('"Send the keys" uses the push-and-turn keys below.')}
          </span>
        </div>
        <div className="pointing-row-control">{modeSelect(1)}</div>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Acceleration')}</span>
          <span className="help">
            {t(
              'Turning fast sends more steps (for keys, not windows or layers).'
            )}
          </span>
        </div>
        <div className="pointing-row-control">
          <div
            className="mx-seg"
            role="radiogroup"
            aria-label={t('Acceleration')}
          >
            {KNOB_ACCELS.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={e.accel[knob] === a.value}
                className={`mx-press${e.accel[knob] === a.value ? ' on' : ''}`}
                onClick={() => {
                  const accel = e.accel.slice();
                  accel[knob] = a.value;
                  x.change({ ...e, accel });
                }}
              >
                {t(a.label)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Hold the knob down')}</span>
          <span className="help">
            {t('Sent once the knob is held for the hold time.')}
          </span>
        </div>
        <div className="pointing-row-control">{keyButton('hold')}</div>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Push twice')}</span>
          <span className="help">
            {t(
              'With a key here, a single push is sent a moment later (after the double press time).'
            )}
          </span>
        </div>
        <div className="pointing-row-control">{keyButton('double')}</div>
      </div>
      {picking && (
        <div className="knob-key-picker">
          <p className="help">
            {picking === 'hold'
              ? t('Pick the key for holding the knob down.')
              : t('Pick the key for pushing twice.')}
          </p>
          <Keycodes
            onPickKey={(picked) => {
              setKey(picking, picked.keymap.code);
              setPicking(null);
            }}
          />
        </div>
      )}
    </>
  );
}

// Settings shared by both knobs.
export function KnobOptionsCard(props: { extras: Extras }) {
  const x = props.extras;
  const e = x.extras;
  if (!e) return null;
  const ms = (
    key: 'holdMs' | 'doubleMs' | 'switchMs',
    min: number,
    max: number,
    labelText: string,
    help: string
  ) => (
    <div className="pointing-row">
      <div className="pointing-row-label">
        <span className="label">{labelText}</span>
        <span className="help">{help}</span>
      </div>
      <div className="pointing-row-control">
        <div className="pointing-range edge-knob-range">
          <Slider
            value={e[key]}
            min={min}
            max={max}
            step={10}
            size="small"
            aria-label={labelText}
            onChange={(_, v) => x.change({ ...e, [key]: v as number })}
          />
          <span className="pointing-value">{e[key]} ms</span>
        </div>
      </div>
    </div>
  );
  return (
    <section className="pointing-card">
      <div className="pointing-card-header">
        <h2>{t('Knob options')}</h2>
        <span>{t('For both knobs. Saved in the keyboard at once.')}</span>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Level on the LEDs')}</span>
          <span className="help">
            {t(
              'While you turn, the LEDs show a bar: how far the knob went, or the selected layer. Same color as the edge slider bar.'
            )}
          </span>
        </div>
        <div className="pointing-row-control">
          <label className="edge-knob-reverse">
            <input
              type="checkbox"
              checked={e.bar}
              onChange={(ev) => x.change({ ...e, bar: ev.target.checked })}
            />
            {t('On')}
          </label>
        </div>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Layers to select')}</span>
          <span className="help">
            {t('Selecting the layer goes through layers 0 to this number - 1.')}
          </span>
        </div>
        <div className="pointing-row-control">
          <select
            className="pointing-select"
            value={e.layers}
            aria-label={t('Layers to select')}
            onChange={(ev) =>
              x.change({ ...e, layers: Number(ev.target.value) })
            }
          >
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      {ms(
        'holdMs',
        150,
        1000,
        t('Hold time'),
        t('How long to hold the knob down for the hold key.')
      )}
      {ms(
        'doubleMs',
        100,
        600,
        t('Double press time'),
        t('The second push must come within this time.')
      )}
      {ms(
        'switchMs',
        300,
        2000,
        t('Window switching ends after'),
        t('Alt / Cmd is let go when the knob rests this long.')
      )}
    </section>
  );
}
