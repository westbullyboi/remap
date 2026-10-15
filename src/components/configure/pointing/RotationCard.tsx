import React, { useEffect, useRef, useState } from 'react';
import { Slider } from '@mui/material';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  PairSelect,
  SAVE_DELAY_MS,
  SaveChip,
  SaveState,
  UpdateNotice,
} from './EdgeKnobShared';

// Firmware r33: turning two fingers on the touchpad sends a keycode per
// step (volume by default). Values 0xCB / 0xCC (keycodes counter-clockwise
// / clockwise, 0 = off) and 0xCD (degrees per step), matrix_pointing.c.
export const ROTATION_KC_IDS = [0xcb, 0xcc];
export const ROTATION_STEP_ID = 0xcd;

type Values = { keycodes: [number, number]; step: number };

export function RotationCard(props: { keyboard: IKeyboard }) {
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
      const read = async (id: number, size: 1 | 2) => {
        const r = await keyboard.fetchCustomValue(id, size);
        if (!r.success || r.unhandled) throw r;
        return r.value!;
      };
      try {
        const next: Values = {
          keycodes: [
            await read(ROTATION_KC_IDS[0], 2),
            await read(ROTATION_KC_IDS[1], 2),
          ],
          step: await read(ROTATION_STEP_ID, 1),
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

  const write = (next: Values, writes: [number, number, 1 | 2][]) => {
    setValues(next);
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

  const header = (
    <div className="pointing-card-header">
      <h2>
        {t('Turn two fingers')}
        {values && <SaveChip state={saveState} />}
      </h2>
      <span>
        {t(
          'Put two fingers on the touchpad and turn them like a knob. It starts after about 15 degrees of turning; moving both fingers the same way stays a scroll.'
        )}
      </span>
    </div>
  );
  if (supported === false) {
    return (
      <section className="pointing-card edge-knob-card">
        {header}
        <UpdateNotice keyboard={keyboard} revision={33} />
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
  const off = !values.keycodes[0] && !values.keycodes[1];
  return (
    <section className="pointing-card edge-knob-card">
      {header}
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Action')}</span>
          <span className="help">{t('"None" turns the gesture off.')}</span>
        </div>
        <div className="pointing-row-control">
          <PairSelect
            label={t('Turn two fingers')}
            keycodes={values.keycodes}
            orientation="other"
            directions={[t('Counter-clockwise'), t('Clockwise')]}
            onChange={(kc) =>
              write({ ...values, keycodes: kc }, [
                [ROTATION_KC_IDS[0], kc[0], 2],
                [ROTATION_KC_IDS[1], kc[1], 2],
              ])
            }
          />
        </div>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Turn per step')}</span>
          <span className="help">
            {t('How far to turn for one key (smaller = more steps).')}
          </span>
        </div>
        <div className="pointing-row-control">
          <div className="pointing-range edge-knob-range">
            <Slider
              value={values.step}
              min={5}
              max={45}
              step={5}
              size="small"
              disabled={off}
              aria-label={t('Turn per step')}
              onChange={(_, v) =>
                write({ ...values, step: v as number }, [
                  [ROTATION_STEP_ID, v as number, 1],
                ])
              }
            />
            <span className="pointing-value">{values.step}°</span>
          </div>
        </div>
      </div>
    </section>
  );
}
