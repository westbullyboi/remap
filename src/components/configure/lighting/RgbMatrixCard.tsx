import React, { useEffect, useRef, useState } from 'react';
import { lightingPreview } from '../../../services/lighting/LightingPreview';
import { Slider } from '@mui/material';
import { t } from 'i18next';
import './RgbMatrixCard.scss';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  applyRgbMatrix,
  fetchEffectListMatches,
  fetchRgbMatrix,
  RGB_MATRIX_EFFECTS,
  RgbMatrixState,
  saveRgbMatrix,
} from '../../../services/lighting/RgbMatrix';

type Props = {
  keyboard: IKeyboard;
  capabilities: number | null;
};

const SAVE_DELAY_MS = 600;

// HSV (0-255 each, like QMK) to a CSS color.
export function hsvToCss(h: number, s: number, v: number): string {
  const hh = (h / 255) * 6;
  const ss = s / 255;
  const vv = v / 255;
  const i = Math.floor(hh) % 6;
  const f = hh - Math.floor(hh);
  const p = vv * (1 - ss);
  const q = vv * (1 - f * ss);
  const u = vv * (1 - (1 - f) * ss);
  const [r, g, b] = [
    [vv, u, p],
    [q, vv, p],
    [p, vv, u],
    [p, q, vv],
    [u, p, vv],
    [vv, p, q],
  ][i];
  const c = (x: number) => Math.round(x * 255);
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

function effectName(index: number, known: boolean): string {
  if (index === 0) return t('Off');
  const e = RGB_MATRIX_EFFECTS[index - 1];
  if (!known || !e) return `${t('Effect')} ${index}`;
  return t(`rgbEffect.${e.id}`, { defaultValue: e.ja });
}

// Brightness, effect, speed and color of the keyboard's RGB Matrix (QMK's
// lighting values over VIA). Changes are sent at once and saved shortly
// after the last one.
export default function RgbMatrixCard(props: Props) {
  const { keyboard } = props;
  const [state, setState] = useState<RgbMatrixState | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [listKnown, setListKnown] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'busy' | 'error'>(
    'saved'
  );
  const stateRef = useRef<RgbMatrixState | null>(null);
  const pending = useRef(new Set<keyof RgbMatrixState>());
  const sending = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setUnsupported(false);
    (async () => {
      const result = await fetchRgbMatrix(keyboard);
      if (cancelled) return;
      if (!result.success) {
        setUnsupported(true);
        return;
      }
      stateRef.current = result.state!;
      setState(result.state!);
      lightingPreview.setRgb(result.state!);
      const matches = await fetchEffectListMatches(
        keyboard,
        props.capabilities
      );
      // Unknown (older firmware): the list was made for this keyboard's
      // firmware, so keep the names.
      if (!cancelled) setListKnown(matches !== false);
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [keyboard, props.capabilities]);

  // Sends the pending changes one at a time (a slider fires many events;
  // only the latest value of each part is sent).
  const flush = async () => {
    if (sending.current) return;
    sending.current = true;
    let ok = true;
    while (pending.current.size > 0) {
      const keys = Array.from(pending.current);
      pending.current.clear();
      const sent = new Set<string>();
      for (const key of keys) {
        const group = key === 'sat' ? 'hue' : key;
        if (sent.has(group)) continue;
        sent.add(group);
        const result = await applyRgbMatrix(keyboard, key, stateRef.current!);
        if (!result.success) ok = false;
      }
    }
    sending.current = false;
    if (!ok) {
      setSaveState('error');
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const result = await saveRgbMatrix(keyboard);
      setSaveState(result.success ? 'saved' : 'error');
    }, SAVE_DELAY_MS);
  };

  const update = (key: keyof RgbMatrixState, value: number) => {
    const next = { ...stateRef.current!, [key]: value };
    stateRef.current = next;
    setState(next);
    lightingPreview.setRgb(next);
    setSaveState('busy');
    pending.current.add(key);
    flush();
  };

  if (unsupported) return null;

  const effectOptions = [0, ...RGB_MATRIX_EFFECTS.map((_, i) => i + 1)];
  if (state && !effectOptions.includes(state.effect)) {
    effectOptions.push(state.effect);
  }
  const off = state?.effect === 0;
  const percent = (v: number) => `${Math.round((v / 255) * 100)}%`;

  return (
    <section className="pointing-card rgb-matrix-card">
      <div className="pointing-card-header">
        <h2>
          {t('Lighting')}
          <span
            className={[
              'pointing-save-state',
              saveState === 'saved' ? '' : saveState,
            ]
              .join(' ')
              .trim()}
            role="status"
          >
            {saveState === 'error'
              ? t('Not saved')
              : saveState === 'busy'
                ? t('Saving to the keyboard...')
                : t('Saved in the keyboard')}
          </span>
        </h2>
        <span>
          {t(
            'Brightness, animation and color of the keyboard LEDs. Changes show on the keyboard right away. Layers with their own LED color below use that color (at this brightness); turning the effect off also turns the layer colors off.'
          )}
        </span>
      </div>
      {!state ? (
        <p className="pointing-checking">{t('Reading from the keyboard...')}</p>
      ) : (
        <>
          <div className="pointing-row">
            <div className="pointing-row-label">
              <span className="label">{t('Effect')}</span>
              {!listKnown && (
                <span className="help">
                  {t(
                    'This firmware has another set of effects, so they are shown by number.'
                  )}
                </span>
              )}
            </div>
            <div className="pointing-row-control">
              <select
                className="pointing-select"
                value={state.effect}
                aria-label={t('Effect')}
                onChange={(e) => update('effect', Number(e.target.value))}
              >
                {effectOptions.map((i) => (
                  <option key={i} value={i}>
                    {effectName(i, listKnown)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <RangeRow
            label={t('Brightness')}
            value={state.brightness}
            disabled={off}
            format={percent}
            onChange={(v) => update('brightness', v)}
          />
          <RangeRow
            label={t('Speed')}
            help={t('How fast animated effects move.')}
            value={state.speed}
            disabled={off}
            format={percent}
            onChange={(v) => update('speed', v)}
          />
          <RangeRow
            label={t('Hue')}
            value={state.hue}
            disabled={off}
            className="rgb-hue"
            format={() => ''}
            onChange={(v) => update('hue', v)}
            adornment={
              <span
                className="rgb-swatch"
                style={{
                  background: hsvToCss(state.hue, state.sat, 255),
                }}
                aria-hidden="true"
              />
            }
          />
          <RangeRow
            label={t('Saturation')}
            help={t('0% is white.')}
            value={state.sat}
            disabled={off}
            format={percent}
            onChange={(v) => update('sat', v)}
          />
        </>
      )}
    </section>
  );
}

function RangeRow(props: {
  label: string;
  help?: string;
  value: number;
  disabled: boolean;
  className?: string;
  // eslint-disable-next-line no-unused-vars
  format: (v: number) => string;
  adornment?: React.ReactNode;
  // eslint-disable-next-line no-unused-vars
  onChange: (v: number) => void;
}) {
  return (
    <div className="pointing-row">
      <div className="pointing-row-label">
        <span className="label">{props.label}</span>
        {props.help && <span className="help">{props.help}</span>}
      </div>
      <div className="pointing-row-control">
        <div className={['pointing-range', props.className || ''].join(' ')}>
          <Slider
            value={props.value}
            min={0}
            max={255}
            disabled={props.disabled}
            onChange={(_, v) => props.onChange(v as number)}
            aria-label={props.label}
            size="small"
          />
          {props.adornment}
          <span className="pointing-value">{props.format(props.value)}</span>
        </div>
      </div>
    </div>
  );
}
