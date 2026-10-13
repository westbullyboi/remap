import React, { useEffect, useRef, useState } from 'react';
import './PointingSettings.scss';
import { Button, CircularProgress } from '@mui/material';
import { t } from 'i18next';
import {
  PointingSettingsActionsType,
  PointingSettingsStateType,
} from './PointingSettings.container';
import {
  applySettings,
  AUTO_MOUSE_SETTINGS,
  defaultValues,
  fetchSettings,
  IPointingSettingDef,
  probeProtocol,
  ProtocolSupport,
  TIMING_SETTINGS,
  TOUCHPAD_SETTINGS,
  LED_SETTINGS,
  fetchCapabilities,
  fetchFirmwareRevision,
  isSettingApplied,
  LATEST_FIRMWARE_REVISION,
} from '../../../services/pointing/PointingSettings';
import { layerName, useLayerMeta } from '../../../services/layers/LayerMeta';
import { matrixDeviceData } from '../../../services/matrix/MatrixDeviceData';
import { firmwareFlasherStore } from '../firmware/firmwareFlasherStore';
import RgbMatrixCard from '../lighting/RgbMatrixCard';
import { EdgeZonesCard } from './EdgeZonesCard';
import MotionStatsLine from '../split/MotionStatsLine';
import { KeyGuideCard } from './KeyGuideCard';
import { SensitivityCard } from './SensitivityCard';
import { SmoothnessCard } from './SmoothnessCard';
import { TouchGlowCard } from './TouchGlowCard';
import {
  AutoMouseOverview,
  SettingRow,
  TouchpadPreview,
} from './PointingParts';
import {
  Values,
  autoMouseSections,
  ledSections,
  timingSections,
  touchpadSections,
} from './PointingSections';

export type PointingSettingsMode = 'touchpad' | 'autoMouse' | 'timing' | 'leds';

type OwnProps = {
  mode: PointingSettingsMode;
  // Opens the keymap editor on the given layer.
  onEditLayer: (layer: number) => void;
};

type PointingSettingsProps = OwnProps &
  Partial<PointingSettingsStateType> &
  Partial<PointingSettingsActionsType>;

const MODE_DEFS: Record<PointingSettingsMode, readonly IPointingSettingDef[]> =
  {
    touchpad: TOUCHPAD_SETTINGS,
    autoMouse: AUTO_MOUSE_SETTINGS,
    timing: TIMING_SETTINGS,
    leds: LED_SETTINGS,
  };

export default function PointingSettings(props: PointingSettingsProps) {
  const isTouchpad = props.mode === 'touchpad';
  const defs = MODE_DEFS[props.mode];

  const [support, setSupport] = useState<
    ProtocolSupport | 'checking' | 'outdated'
  >('checking');
  // Shows the settings UI with default values without talking to the
  // keyboard, so the screen can be checked on any firmware.
  const [preview, setPreview] = useState<boolean>(false);
  const [retry, setRetry] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [stored, setStored] = useState<Values>(defaultValues(defs));
  const [values, setValues] = useState<Values>(defaultValues(defs));
  // Which settings the firmware applies (null: unknown, assume all).
  const [capabilities, setCapabilities] = useState<number | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<boolean>(false);
  // Changes are written to the keyboard automatically, one save at a time.
  const savingRef = useRef(false);
  const layerMeta = useLayerMeta(props.keyboard?.getInformation());

  useEffect(() => {
    if (!props.keyboard) return;
    let cancelled = false;
    setSupport('checking');
    setStored(defaultValues(defs));
    setValues(defaultValues(defs));
    (async () => {
      const probed = await probeProtocol(props.keyboard!);
      if (cancelled) return;
      setSupport(probed);
      if (probed !== 'supported') return;
      setLoading(true);
      const caps = await fetchCapabilities(props.keyboard!);
      if (cancelled) return;
      setCapabilities(caps);
      const rev = await fetchFirmwareRevision(props.keyboard!);
      if (cancelled) return;
      setRevision(rev);
      const result = await fetchSettings(props.keyboard!, defs);
      if (cancelled) return;
      setLoading(false);
      if (result.success) {
        setStored(result.values!);
        setValues(result.values!);
      } else if (result.outdated) {
        setSupport('outdated');
      } else {
        props.notifyError!(
          t('Failed to read the settings from the keyboard'),
          result.cause
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.keyboard, props.mode, retry]);

  // Write changes to the keyboard shortly after the last edit (no separate
  // save step), then read the values back: the firmware may clamp them.
  useEffect(() => {
    if (support !== 'supported' || loading || !props.keyboard) return;
    if (!defs.some((d) => values[d.key] !== stored[d.key])) return;
    if (savingRef.current) return; // re-runs when the current save ends
    const snapshot = values;
    const timer = setTimeout(async () => {
      savingRef.current = true;
      setSaving(true);
      const result = await applySettings(
        props.keyboard!,
        defs,
        stored,
        snapshot
      );
      if (result.success) {
        setSaveError(false);
        const reread = await fetchSettings(props.keyboard!, defs);
        const actual = reread.success ? reread.values! : snapshot;
        setStored(actual);
        if (props.mode === 'leds') {
          matrixDeviceData.setLeds(LED_SETTINGS.map((d) => actual[d.key]));
        }
        // Keep edits made while saving; otherwise show what was stored.
        setValues((current) => (current === snapshot ? actual : current));
      } else {
        setSaveError(true);
        setStored(snapshot); // do not retry in a loop; the next edit retries
        props.notifyError!(
          t('Failed to save the settings to the keyboard'),
          result.cause
        );
      }
      savingRef.current = false;
      setSaving(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [values, stored, support, loading, saving]);

  const titles: Record<PointingSettingsMode, string> = {
    touchpad: t('Touchpad'),
    autoMouse: t('Auto mouse layer'),
    timing: t('Timing & gestures'),
    leds: t('Layer LED colors'),
  };
  const descs: Record<PointingSettingsMode, string> = {
    touchpad: t('Mounted on the top of the right half'),
    autoMouse: t(
      'Turns on the selected layer automatically while you are using the touchpad'
    ),
    timing: t('Tap-hold key timing and touchpad swipe shortcuts'),
    leds: t('Shows the active layer with the color of the keyboard LEDs'),
  };
  const title = titles[props.mode];
  const live = support === 'supported';

  if (!live && !preview) {
    return (
      <div className="pointing-settings">
        <div className="pointing-card pointing-unsupported">
          <h2>{title}</h2>
          {support === 'checking' && (
            <p className="pointing-checking">
              <CircularProgress size={16} />
              {t('Checking whether the firmware supports this feature...')}
            </p>
          )}
          {support === 'unsupported' && (
            <>
              <p>
                {t(
                  'The firmware of this keyboard does not support these settings yet. The firmware needs to implement the Matrix pointing protocol (VIA custom values on channel 0).'
                )}
              </p>
              <p>
                {t(
                  'You can still preview this screen. Nothing is sent to the keyboard in the preview.'
                )}
              </p>
            </>
          )}
          {support === 'error' && (
            <p>{t('Could not communicate with the keyboard.')}</p>
          )}
          {support === 'outdated' && (
            <p>
              {t(
                'The firmware on this keyboard is an older Matrix version without these settings. Write the latest Matrix-ready firmware to use them.'
              )}
            </p>
          )}
          {support !== 'checking' && (
            <div className="pointing-actions">
              {support === 'outdated' && (
                <Button
                  variant="contained"
                  size="small"
                  disableElevation
                  onClick={() =>
                    firmwareFlasherStore.open(props.keyboard || null)
                  }
                >
                  {t('Write firmware')}
                </Button>
              )}
              <Button
                variant="contained"
                size="small"
                disableElevation
                onClick={() => setPreview(true)}
              >
                {t('Preview this screen')}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setRetry(retry + 1)}
              >
                {t('Check again')}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const defOf = (key: string) => defs.find((d) => d.key === key)!;
  const update = (key: string, value: number) =>
    setValues({ ...values, [key]: value });
  const dirty = defs.some((d) => values[d.key] !== stored[d.key]);
  const layerCount = Number.isNaN(props.layerCount) ? 4 : props.layerCount!;
  const sections =
    props.mode === 'touchpad'
      ? touchpadSections()
      : props.mode === 'autoMouse'
        ? autoMouseSections()
        : props.mode === 'timing'
          ? timingSections()
          : ledSections(layerCount, (layer) => layerName(layerMeta, layer));

  return (
    <div className="pointing-settings">
      <div className="pointing-title">
        <div className="pointing-title-text">
          <h1>{title}</h1>
          <span>{descs[props.mode]}</span>
        </div>
        {loading && <CircularProgress size={20} />}
        <div className="pointing-actions">
          <Button
            variant="outlined"
            size="small"
            disabled={loading || saving}
            onClick={() => setValues(defaultValues(defs))}
          >
            {t('Reset to defaults')}
          </Button>
          <span
            className={[
              'pointing-save-state',
              live && (saving || dirty) ? 'busy' : '',
              saveError ? 'error' : '',
            ]
              .join(' ')
              .trim()}
            role="status"
          >
            {!live
              ? t('Preview (not saved)')
              : saveError
                ? t('Not saved')
                : saving || dirty
                  ? t('Saving to the keyboard...')
                  : t('Saved in the keyboard')}
          </span>
        </div>
      </div>

      {live && revision !== null && revision < LATEST_FIRMWARE_REVISION && (
        <div className="pointing-preview-banner pointing-outdated" role="alert">
          <span>
            {t(
              'The firmware on the keyboard is older than the latest Matrix-ready firmware, so some values here may not take effect. Write the latest firmware.'
            )}{' '}
            ({t('Keyboard')}: r{revision || '?'} / {t('Latest')}: r
            {LATEST_FIRMWARE_REVISION})
          </span>
          <Button
            variant="contained"
            size="small"
            disableElevation
            onClick={() => firmwareFlasherStore.open(props.keyboard || null)}
          >
            {t('Write firmware')}
          </Button>
        </div>
      )}

      {live && props.mode === 'touchpad' && values.precisionTouchpad === 1 && (
        <div className="pointing-preview-banner" role="status">
          {t(
            'Precision touchpad mode is on: on Windows, cursor speed, acceleration, taps, scrolling and smoothness follow Windows settings (Settings > Bluetooth & devices > Touchpad), not the settings below. Edge sliders, the auto mouse layer (r16+) and touch sensitivity still apply.'
          )}
        </div>
      )}

      {!live && (
        <div className="pointing-preview-banner" role="status">
          {t(
            'Preview: the firmware does not support these settings, so nothing is read from or sent to the keyboard.'
          )}
        </div>
      )}

      {live && (props.mode === 'touchpad' || props.mode === 'timing') && (
        <section className="pointing-card pointing-info">
          <h2>{t('How the settings reach the keyboard')}</h2>
          <p>
            {t(
              'Changes are written into the keyboard automatically as you edit them, so they take effect at once and stay after unplugging. The touchpad is on the right half; the settings are sent to it whichever half the USB cable is plugged into.'
            )}
          </p>
          {capabilities !== null &&
            defs.some((d) => !isSettingApplied(capabilities, d.valueId)) && (
              <p>
                {t(
                  'Settings marked "Not applied on this keyboard" are saved but have no effect with this touchpad and firmware.'
                )}
              </p>
            )}
        </section>
      )}

      {props.mode === 'autoMouse' && (
        <AutoMouseOverview
          values={values}
          layerCount={props.layerCount!}
          onChange={update}
          onEditLayer={props.onEditLayer}
        />
      )}

      <div className="pointing-body">
        <div className="pointing-sections">
          {props.mode === 'touchpad' && live && props.keyboard && (
            <MotionStatsLine keyboard={props.keyboard} />
          )}
          {props.mode === 'touchpad' && live && props.keyboard && (
            <SmoothnessCard keyboard={props.keyboard} />
          )}
          {props.mode === 'touchpad' && live && props.keyboard && (
            <SensitivityCard keyboard={props.keyboard} />
          )}
          {props.mode === 'touchpad' && live && props.keyboard && (
            <EdgeZonesCard keyboard={props.keyboard} />
          )}
          {props.mode === 'leds' && live && props.keyboard && (
            <RgbMatrixCard
              keyboard={props.keyboard}
              capabilities={capabilities}
            />
          )}
          {props.mode === 'leds' && live && props.keyboard && (
            <KeyGuideCard keyboard={props.keyboard} />
          )}
          {props.mode === 'leds' && live && props.keyboard && (
            <TouchGlowCard keyboard={props.keyboard} />
          )}
          {sections.map((section) => (
            <section className="pointing-card" key={section.title}>
              <div className="pointing-card-header">
                <h2>{section.title}</h2>
                <span>{section.desc}</span>
              </div>
              {section.rows.map((row) => (
                <SettingRow
                  key={row.key}
                  row={row}
                  def={defOf(row.key)}
                  value={values[row.key]}
                  disabled={loading || saving}
                  applied={
                    !live ||
                    isSettingApplied(capabilities, defOf(row.key).valueId)
                  }
                  onChange={(v) => update(row.key, v)}
                />
              ))}
            </section>
          ))}
        </div>
        {isTouchpad && <TouchpadPreview values={values} />}
      </div>
    </div>
  );
}
