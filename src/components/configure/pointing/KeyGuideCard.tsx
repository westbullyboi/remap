import React, { useEffect, useState } from 'react';
import { Slider, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  CAP_KEY_GUIDE,
  fetchCapabilities,
  probeProtocol,
} from '../../../services/pointing/PointingSettings';
import { SaveChip, SaveState, UpdateNotice } from './EdgeKnobShared';
import { lightingPreview } from '../../../services/lighting/LightingPreview';

// Values 0x9E..0xA0 (firmware r20+): light only the keys that are assigned
// on the active layer.
const GUIDE_ID = 0x9e;
const GUIDE_COLOR_ID = 0x9f;
const GUIDE_DIM_ID = 0xa0;
const GUIDE_KINDS: { label: string; css: string }[] = [
  { label: 'Letters, numbers, symbols', css: '#ffffff' },
  { label: 'Modifiers (Ctrl, Shift...)', css: '#3e63dd' },
  { label: 'Layer keys', css: '#d6409f' },
  { label: 'Media / volume', css: '#30a46c' },
  { label: 'Mouse / pointer', css: '#f5d90a' },
  { label: 'Shortcuts, macros, others', css: '#05a2c2' },
];

// Layer LED tab: key guide (firmware r20+).
export function KeyGuideCard(props: { keyboard: IKeyboard }) {
  const [mode, setMode] = useState<number | null>(null);
  const [colorMode, setColorMode] = useState<number>(0);
  const [dim, setDim] = useState<number>(0);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const caps =
        (await probeProtocol(props.keyboard)) === 'supported'
          ? (await fetchCapabilities(props.keyboard)) ?? 0
          : 0;
      if (cancelled) return;
      if ((caps & CAP_KEY_GUIDE) === 0) {
        setSupported(false);
        return;
      }
      const m = await props.keyboard.fetchCustomValue(GUIDE_ID, 1);
      const c = await props.keyboard.fetchCustomValue(GUIDE_COLOR_ID, 1);
      const d = await props.keyboard.fetchCustomValue(GUIDE_DIM_ID, 1);
      if (cancelled) return;
      const good = [m, c, d].every((r) => r.success && !r.unhandled);
      setSupported(good);
      if (good) {
        setMode(m.value!);
        setColorMode(c.value!);
        setDim(d.value!);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.keyboard]);

  // The 3D keyboard shows the guide while the Lighting settings are open.
  useEffect(() => {
    lightingPreview.setGuide(mode === null ? null : { mode, colorMode, dim });
  }, [mode, colorMode, dim]);
  useEffect(() => () => lightingPreview.setGuide(null), []);

  const change = async (id: number, value: number) => {
    if (id === GUIDE_ID) setMode(value);
    else if (id === GUIDE_COLOR_ID) setColorMode(value);
    setSaveState('busy');
    const r = await props.keyboard.updateCustomValue(id, value, 1);
    const saved =
      r.success && (await props.keyboard.saveCustomValues()).success;
    setSaveState(saved ? 'saved' : 'error');
  };
  const off = mode === 0;

  return (
    <section className="pointing-card edge-knob-card">
      <div className="pointing-card-header">
        <h2>
          {t('Assigned keys only')}
          {mode !== null && <SaveChip state={saveState} />}
        </h2>
        <span>
          {t(
            'Lights only the keys that do something on the active layer; transparent (▽) and empty keys go dark. You can see at a glance which keys a layer uses.'
          )}
        </span>
      </div>
      {supported === false && (
        <UpdateNotice keyboard={props.keyboard} revision={20} />
      )}
      {mode !== null && (
        <>
          <div className="pointing-row">
            <div className="pointing-row-label">
              <span className="label">{t('When to show')}</span>
              <span className="help">
                {t(
                  'With "While a layer is on", the base layer keeps the normal lighting.'
                )}
              </span>
            </div>
            <div className="pointing-row-control">
              <ToggleButtonGroup
                exclusive
                size="small"
                value={mode}
                onChange={(_, v) => v !== null && change(GUIDE_ID, v as number)}
              >
                <ToggleButton value={0}>{t('Guide off')}</ToggleButton>
                <ToggleButton value={1}>
                  {t('While a layer is on')}
                </ToggleButton>
                <ToggleButton value={2}>{t('Always')}</ToggleButton>
              </ToggleButtonGroup>
            </div>
          </div>
          <div
            className={['pointing-row', off ? 'not-applied' : '']
              .join(' ')
              .trim()}
          >
            <div className="pointing-row-label">
              <span className="label">{t('Color of the assigned keys')}</span>
            </div>
            <div className="pointing-row-control">
              <ToggleButtonGroup
                exclusive
                size="small"
                value={colorMode}
                disabled={off}
                onChange={(_, v) =>
                  v !== null && change(GUIDE_COLOR_ID, v as number)
                }
              >
                <ToggleButton value={0}>{t('Keep the colors')}</ToggleButton>
                <ToggleButton value={1}>{t('Color by kind')}</ToggleButton>
              </ToggleButtonGroup>
            </div>
          </div>
          {colorMode === 1 && !off && (
            <div className="key-guide-legend">
              {GUIDE_KINDS.map((k) => (
                <span key={k.label}>
                  <i style={{ backgroundColor: k.css }} />
                  {t(k.label)}
                </span>
              ))}
            </div>
          )}
          <div
            className={['pointing-row', off ? 'not-applied' : '']
              .join(' ')
              .trim()}
          >
            <div className="pointing-row-label">
              <span className="label">{t('Unassigned keys')}</span>
              <span className="help">
                {t(
                  'Brightness of the keys without an assignment. 0% turns them off.'
                )}
              </span>
            </div>
            <div className="pointing-row-control">
              <div className="pointing-range edge-knob-range">
                <Slider
                  value={dim}
                  min={0}
                  max={50}
                  step={5}
                  size="small"
                  disabled={off}
                  aria-label={t('Unassigned keys')}
                  onChange={(_, v) => setDim(v as number)}
                  onChangeCommitted={(_, v) =>
                    change(GUIDE_DIM_ID, v as number)
                  }
                />
                <span className="pointing-value">{dim}%</span>
              </div>
            </div>
          </div>
          <p className="knob-note">
            {t(
              'The key you hold to reach the layer stays lit. Needs the RGB lighting to be on.'
            )}
          </p>
        </>
      )}
    </section>
  );
}
