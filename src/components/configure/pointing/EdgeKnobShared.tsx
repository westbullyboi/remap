import React, { useEffect, useRef, useState } from 'react';
import { t } from 'i18next';
import './EdgeKnobSettings.scss';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  EdgeKnobValues,
  fetchEdgeKnob,
  matchPair,
  PAIR_PRESETS,
  PairOrientation,
  presetKeycodes,
  writeEdgeKnobValues,
} from '../../../services/pointing/EdgeKnob';
import {
  fetchCapabilities,
  probeProtocol,
} from '../../../services/pointing/PointingSettings';
import { hexadecimal } from '../../../utils/StringUtils';
import { firmwareFlasherStore } from '../firmware/firmwareFlasherStore';
import { edgeKnobPreview } from '../../../services/pointing/EdgeKnobPreview';

export const SAVE_DELAY_MS = 500;

export type SaveState = 'saved' | 'busy' | 'error';

// Reads the values once per keyboard; writes each change and saves shortly
// after the last one.
export function useEdgeKnob(
  keyboard: IKeyboard | null | undefined,
  capability: number
) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [values, setValues] = useState<EdgeKnobValues | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSupported(null);
    setValues(null);
    if (!keyboard) return;
    (async () => {
      const ok =
        (await probeProtocol(keyboard)) === 'supported' &&
        ((await fetchCapabilities(keyboard)) ?? 0) & capability;
      if (cancelled) return;
      if (!ok) {
        setSupported(false);
        return;
      }
      const result = await fetchEdgeKnob(keyboard);
      if (cancelled) return;
      setSupported(result.success);
      if (result.success) setValues(result.values!);
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [keyboard, capability]);

  // The 3D keyboard draws the zones and the knobs' actions from these.
  useEffect(() => {
    edgeKnobPreview.setValues(values);
  }, [values]);

  const write = (next: EdgeKnobValues, entries: [number, number, 1 | 2][]) => {
    setValues(next);
    if (!keyboard) return;
    setSaveState('busy');
    queue.current = queue.current.then(async () => {
      const r = await writeEdgeKnobValues(keyboard, entries);
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

  return { supported, values, saveState, write };
}

export function SaveChip(props: { state: SaveState }) {
  return (
    <span
      className={[
        'pointing-save-state',
        props.state === 'saved' ? '' : props.state,
      ]
        .join(' ')
        .trim()}
      role="status"
    >
      {props.state === 'error'
        ? t('Not saved')
        : props.state === 'busy'
          ? t('Saving to the keyboard...')
          : t('Saved in the keyboard')}
    </span>
  );
}

export function UpdateNotice(props: {
  keyboard: IKeyboard | null | undefined;
  revision?: number;
}) {
  return (
    <div className="pointing-preview-banner pointing-outdated" role="alert">
      <span>
        {t(
          'This needs newer firmware (Matrix r{{revision}} or later). Write the latest firmware to both halves.',
          { revision: props.revision ?? 12 }
        )}
      </span>
      <button
        type="button"
        className="edge-knob-update"
        onClick={() => firmwareFlasherStore.open(props.keyboard || null)}
      >
        {t('Write firmware')}
      </button>
    </div>
  );
}

// A preset pair of keycodes plus "reverse".
export function PairSelect(props: {
  label: string;
  keycodes: [number, number];
  orientation: PairOrientation;
  directions: [string, string];
  // eslint-disable-next-line no-unused-vars
  onChange: (keycodes: [number, number]) => void;
}) {
  const choice = matchPair(props.keycodes, props.orientation);
  const value =
    choice.kind === 'none'
      ? ''
      : choice.kind === 'preset'
        ? choice.preset.id
        : 'custom';
  const reversed = choice.kind === 'preset' && choice.reversed;
  const apply = (id: string, rev: boolean) => {
    if (id === '') return props.onChange([0, 0]);
    const preset = PAIR_PRESETS.find((p) => p.id === id);
    if (preset) props.onChange(presetKeycodes(preset, props.orientation, rev));
  };
  return (
    <div className="edge-knob-pair">
      <select
        className="pointing-select"
        value={value}
        aria-label={props.label}
        onChange={(e) => apply(e.target.value, false)}
      >
        <option value="">{t('None')}</option>
        {PAIR_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {t(p.label)}
          </option>
        ))}
        {choice.kind === 'custom' && (
          <option value="custom">
            {t('Custom')} ({hexadecimal(choice.keycodes[0], 4)} /{' '}
            {hexadecimal(choice.keycodes[1], 4)})
          </option>
        )}
      </select>
      {choice.kind === 'preset' && (
        <label className="edge-knob-reverse">
          <input
            type="checkbox"
            checked={reversed}
            onChange={(e) => apply(choice.preset.id, e.target.checked)}
          />
          {t('Reverse')}
        </label>
      )}
      {choice.kind === 'preset' && (
        <span className="edge-knob-directions">
          {props.directions[0]} → {t(describeKeycode(props.keycodes[0]))} /{' '}
          {props.directions[1]} → {t(describeKeycode(props.keycodes[1]))}
        </span>
      )}
    </div>
  );
}

// Short name of a keycode used by the presets.
const KEYCODE_NAMES: { [code: number]: string } = {
  0x00a9: 'Volume up',
  0x00aa: 'Volume down',
  0x00bd: 'Brighter',
  0x00be: 'Dimmer',
  0x00d9: 'Scroll up',
  0x00da: 'Scroll down',
  0x00db: 'Scroll left',
  0x00dc: 'Scroll right',
  0x012d: 'Zoom out',
  0x012e: 'Zoom in',
  0x0156: 'Zoom out',
  0x0157: 'Zoom in',
  0x01da: 'Zoom out',
  0x01d9: 'Zoom in',
  0x032b: 'Previous tab',
  0x012b: 'Next tab',
  0x011d: 'Undo',
  0x011c: 'Redo',
  0x081d: 'Undo',
  0x0a1d: 'Redo',
  0x00ac: 'Previous track',
  0x00ab: 'Next track',
  0x0052: 'Up',
  0x0051: 'Down',
  0x0050: 'Left',
  0x004f: 'Right',
  0x0950: 'Previous desktop',
  0x094f: 'Next desktop',
  0x0150: 'Previous desktop',
  0x014f: 'Next desktop',
  0x004b: 'Page up',
  0x004e: 'Page down',
};
export function describeKeycode(code: number): string {
  return KEYCODE_NAMES[code] || hexadecimal(code, 4);
}
