import React, { useEffect, useState } from 'react';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  DETECTED_OS,
  fetchOsProfiles,
  OS_EDIT_ID,
  OS_ENABLED_ID,
  OS_MODE_ID,
  OS_SWAP_ID,
  OsProfileState,
  osEditStore,
  writeOsValue,
} from '../../../services/pointing/OsProfiles';
import { firmwareFlasherStore } from '../firmware/firmwareFlasherStore';

const SET_NAMES = ['PC (Windows / Linux)', 'Mac'];

// Settings per OS, above the settings that have a Mac version (Touchpad,
// Timing & gestures, Knobs): turn them on, pick the set to edit, how the
// keyboard picks the set, and the Ctrl / Cmd swap of the edited set.
export default function OsProfileBar(props: {
  keyboard: IKeyboard | null;
  edit: number;
}) {
  const { keyboard, edit } = props;
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, setState] = useState<OsProfileState | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!keyboard) return;
    const r = await fetchOsProfiles(keyboard, edit);
    if (!r.success) return;
    setSupported(!!r.supported);
    setState(r.state || null);
  };
  useEffect(() => {
    setSupported(null);
    setState(null);
    reload();
  }, [keyboard, edit]);

  if (!keyboard || supported === null) return null;
  if (!supported) {
    return (
      <div className="mx-osbar mx-osbar-off">
        <span>
          {t(
            'Separate settings for Windows and Mac need newer firmware (Matrix r{{revision}} or later).',
            { revision: 22 }
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
  if (!state) return null;

  const change = async (id: number, value: number) => {
    setBusy(true);
    await writeOsValue(keyboard, id, value);
    setBusy(false);
    await reload();
  };
  const pickSet = async (set: number) => {
    if (set === edit) return;
    setBusy(true);
    await keyboard.updateCustomValue(OS_EDIT_ID, set, 1);
    setBusy(false);
    // The settings below reload for the set.
    osEditStore.set(keyboard, set);
  };
  const detected = DETECTED_OS[state.detected] || DETECTED_OS[0];

  return (
    <div className="mx-osbar" aria-busy={busy}>
      <label className="mx-osbar-switch">
        <input
          type="checkbox"
          checked={state.enabled}
          disabled={busy}
          onChange={async (e) => {
            const on = e.target.checked;
            await change(OS_ENABLED_ID, on ? 1 : 0);
            if (!on) await pickSet(0);
          }}
        />
        <span>
          <b>{t('Separate settings for Windows and Mac')}</b>
          <small>
            {t(
              'Touchpad edges and corners, knob push-and-turn, 3-finger swipes and the Ctrl / Cmd swap. The keymap is shared.'
            )}
          </small>
        </span>
      </label>
      {state.enabled && (
        <div className="mx-osbar-row">
          <div className="mx-seg" role="tablist" aria-label={t('Editing')}>
            {SET_NAMES.map((name, set) => (
              <button
                key={set}
                type="button"
                role="tab"
                aria-selected={edit === set}
                className={`mx-press${edit === set ? ' on' : ''}`}
                disabled={busy}
                onClick={() => pickSet(set)}
              >
                {t(name)}
                {state.active === set && (
                  <span className="mx-osbar-dot" title={t('In use')} />
                )}
              </button>
            ))}
          </div>
          <select
            className="pointing-select"
            value={state.mode}
            disabled={busy}
            aria-label={t('Which settings to use')}
            onChange={(e) => change(OS_MODE_ID, Number(e.target.value))}
          >
            <option value={0}>{t('By the connected OS')}</option>
            <option value={1}>{t('Always PC')}</option>
            <option value={2}>{t('Always Mac')}</option>
          </select>
        </div>
      )}
      <div className="mx-osbar-row mx-osbar-status">
        <span>
          {t('Connected OS: {{os}}', { os: t(detected) })}
          {state.enabled &&
            ` — ${t('using the {{set}} settings', {
              set: t(SET_NAMES[state.active] || SET_NAMES[0]),
            })}`}
        </span>
        <label>
          <input
            type="checkbox"
            checked={state.swap}
            disabled={busy}
            onChange={(e) => change(OS_SWAP_ID, e.target.checked ? 1 : 0)}
          />
          {state.enabled
            ? t('Swap Ctrl and Cmd (Win) in the {{set}} settings', {
                set: t(SET_NAMES[edit]),
              })
            : t('Swap Ctrl and Cmd (Win)')}
        </label>
      </div>
    </div>
  );
}
