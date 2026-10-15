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
// Firmware r35: circular scrolling (one finger around the pad from its
// rim); on with the scroll method "Circular" (0x0B = 1). Keycodes 0xCE /
// 0xCF, degrees per step 0xD0.
export const CIRCULAR_KC_IDS = [0xce, 0xcf];
export const CIRCULAR_STEP_ID = 0xd0;

type Values = { keycodes: [number, number]; step: number };

type GestureSpec = {
  title: string;
  description: string;
  actionHelp: string;
  kcIds: number[];
  stepId: number;
  revision: number;
  // "None" turns the gesture off (else it only sends nothing).
  noneTurnsOff: boolean;
};

export function RotationCard(props: { keyboard: IKeyboard }) {
  return (
    <TurnGestureCard
      keyboard={props.keyboard}
      spec={{
        title: t('Turn two fingers'),
        description: t(
          'Put two fingers on the touchpad and turn them like a knob. It starts after about 15 degrees of turning; moving both fingers the same way stays a scroll.'
        ),
        actionHelp: t('"None" turns the gesture off.'),
        kcIds: ROTATION_KC_IDS,
        stepId: ROTATION_STEP_ID,
        revision: 33,
        noneTurnsOff: true,
      }}
    />
  );
}

export function CircularScrollCard(props: { keyboard: IKeyboard }) {
  return (
    <TurnGestureCard
      keyboard={props.keyboard}
      spec={{
        title: t('Circular scrolling'),
        description: t(
          'Put one finger near the rim of the touchpad and move it round the middle, like a wheel: clockwise scrolls down. Turn it on with Scroll method "Circular" above. Starting on an edge that has an edge slider keeps the slider.'
        ),
        actionHelp: t('What going round sends (scrolling by default).'),
        kcIds: CIRCULAR_KC_IDS,
        stepId: CIRCULAR_STEP_ID,
        revision: 35,
        noneTurnsOff: false,
      }}
    />
  );
}

function TurnGestureCard(props: { keyboard: IKeyboard; spec: GestureSpec }) {
  const { keyboard, spec } = props;
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
            await read(spec.kcIds[0], 2),
            await read(spec.kcIds[1], 2),
          ],
          step: await read(spec.stepId, 1),
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
        {spec.title}
        {values && <SaveChip state={saveState} />}
      </h2>
      <span>{spec.description}</span>
    </div>
  );
  if (supported === false) {
    return (
      <section className="pointing-card edge-knob-card">
        {header}
        <UpdateNotice keyboard={keyboard} revision={spec.revision} />
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
  const off = spec.noneTurnsOff && !values.keycodes[0] && !values.keycodes[1];
  return (
    <section className="pointing-card edge-knob-card">
      {header}
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Action')}</span>
          <span className="help">{spec.actionHelp}</span>
        </div>
        <div className="pointing-row-control">
          <PairSelect
            label={spec.title}
            keycodes={values.keycodes}
            orientation="other"
            directions={[t('Counter-clockwise'), t('Clockwise')]}
            onChange={(kc) =>
              write({ ...values, keycodes: kc }, [
                [spec.kcIds[0], kc[0], 2],
                [spec.kcIds[1], kc[1], 2],
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
                  [spec.stepId, v as number, 1],
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
