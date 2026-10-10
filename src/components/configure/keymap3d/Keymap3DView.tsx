import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { t } from 'i18next';
import { RootState } from '../../../store/state';
import {
  AppActions,
  KeydiffActions,
  KeymapActions,
} from '../../../actions/actions';
import KeyboardModel from '../../../models/KeyboardModel';
import { IKeymap } from '../../../services/hid/Hid';
import { ModsComposition } from '../../../services/hid/compositions/ModsComposition';
import { localizedKeycodeDesc } from '../../../services/hid/KeycodeDescJa';
import { hexadecimal } from '../../../utils/StringUtils';
import { Key, genKey } from '../keycodekey/KeyGen';
import Keycodes from '../keycodes/Keycodes.container';
import KeyInspector from '../inspector/KeyInspector.container';
import {
  key3D,
  plates as toPlates,
  unionBounds,
  keyBounds,
} from './Keyboard3DGeometry';
import type { Keymap3DKey } from './Keymap3D';
import { hidActionsThunk } from '../../../actions/hid.action';
import { KeyLabelLangs } from '../../../services/labellang/KeyLabelLangs';
import { KeymapPdfGenerator } from '../../../services/pdf/KeymapPdfGenerator';
import './Keymap3DView.scss';

import Keymap3D from './Keymap3D';

// Share of the stage covered by the settings window.
const WINDOW_SHARE = 0.42;
// Length of the window's closing animation (see Keymap3DView.scss).
const CLOSE_MS = 220;

type Keymap3DViewProps = {
  // Called when the 3D view cannot be shown (no WebGL, an error in the
  // scene): the caller switches back to the 2D keyboard.
  onUnavailable: () => void;
};

// Key Config with the 3D keyboard: picking a key zooms to it and opens a
// semi-transparent settings window over the stage. Picking a keycode in the
// window assigns it to the key and closes the window.
export default function Keymap3DView(props: Keymap3DViewProps) {
  const dispatch = useDispatch();
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  const layerCount = useSelector(
    (s: RootState) => s.entities.device.layerCount
  );
  const keyboardKeymap = useSelector(
    (s: RootState) => s.entities.keyboardDefinition?.layouts.keymap
  );
  const options = useSelector(
    (s: RootState) => s.configure.layoutOptions.selectedOptions
  );
  const keymaps = useSelector((s: RootState) => s.entities.device.keymaps);
  const remaps = useSelector((s: RootState) => s.app.remaps);
  const layer = useSelector((s: RootState) => s.configure.keymap.selectedLayer);
  const selectedPos = useSelector(
    (s: RootState) => s.configure.keymap.selectedPos
  );
  const labelLang = useSelector((s: RootState) => s.app.labelLang);

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [tab, setTab] = useState<'keycode' | 'details'>('keycode');
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const [isOverview, setIsOverview] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const unappliedCount = useMemo(() => {
    let count = 0;
    for (const l in remaps) {
      count += Object.keys(remaps[l]).length;
    }
    return count;
  }, [remaps]);

  const handleClear = () => {
    if (confirm('Clear all changes?')) {
      const empty = Array.from({ length: layerCount || 4 }, () => ({}));
      dispatch(AppActions.remapsSetKeys(empty));
      dispatch(AppActions.encodersRemapsInit(layerCount || 4));
      dispatch(KeydiffActions.clearKeydiff());
    }
  };

  const handleReset = () => {
    if (
      confirm(
        'Current keymap will be discarded and an initial keymap will be applied immediately.\nAre you sure to reset keymap?'
      )
    ) {
      dispatch(hidActionsThunk.resetKeymap());
      setMoreOpen(false);
    }
  };

  const handlePdf = () => {
    if (!keyboardKeymap || !keyboard) return;
    const allKeys = [];
    for (let i = 0; i < (layerCount || 4); i++) {
      const layerKeymap = keymaps[i] || {};
      const generated: { [pos: string]: Key } = {};
      for (const pos of Object.keys(layerKeymap)) {
        generated[pos] = genKey(layerKeymap[pos], labelLang);
      }
      allKeys.push(generated);
    }
    const pdf = new KeymapPdfGenerator(
      keyboardKeymap,
      allKeys as any,
      layerCount || 4,
      labelLang
    );
    const info = keyboard.getInformation();
    if (info) {
      pdf.genPdf(info.productName, options).catch(() => {
        alert(`Couldn't generate the PDF.`);
      });
    }
  };

  const models = useMemo(() => {
    if (!keyboardKeymap) return [];
    return new KeyboardModel(keyboardKeymap)
      .getKeymap(options)
      .keymaps.filter((m) => !m.isDecal);
  }, [keyboardKeymap, options]);
  const geometry = useMemo(() => {
    const keys = models.map(key3D);
    return {
      keys,
      plates: toPlates(keys),
      bounds: unionBounds(keys.map(keyBounds)),
    };
  }, [models]);

  const layerKeymaps = keymaps[layer] || {};
  const layerRemaps = remaps[layer] || {};
  const keys: Keymap3DKey[] = useMemo(
    () =>
      geometry.keys.map((key) => {
        const pos = key.model.pos;
        const current = pos ? layerRemaps[pos] || layerKeymaps[pos] : undefined;
        return {
          key,
          label: current ? genKey(current, labelLang).label : '',
          changed: !!pos && pos in layerRemaps,
          encoder: key.model.isEncoder,
        };
      }),
    [geometry, layerKeymaps, layerRemaps, labelLang]
  );

  const close = () => {
    if (!open || closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      dispatch(KeymapActions.clearSelectedKeyPosition());
      dispatch(KeydiffActions.clearKeydiff());
    }, CLOSE_MS);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const pick = (pos: string) => {
    clearTimeout(closeTimer.current);
    setClosing(false);
    setIsOverview(false);
    const original = layerKeymaps[pos];
    const remapped = layerRemaps[pos];
    if (original && remapped) {
      dispatch(KeydiffActions.updateKeydiff(original, remapped));
    } else {
      dispatch(KeydiffActions.clearKeydiff());
    }
    dispatch(KeymapActions.updateSelectedKeyPosition(pos, null, 'click'));
    setTab('keycode');
    setOpen(true);
  };

  // A keycode picked in the palette is assigned to the selected key.
  const assign = (picked: Key) => {
    if (!selectedPos || closing) return;
    const original = layerKeymaps[selectedPos];
    if (!original) return;
    const next = picked.keymap;
    if (sameKeymap(original, next)) {
      dispatch(AppActions.remapsRemoveKey(layer, selectedPos));
      dispatch(KeydiffActions.clearKeydiff());
    } else {
      dispatch(AppActions.remapsSetKey(layer, selectedPos, next));
      dispatch(KeydiffActions.updateKeydiff(original, next));
    }
    close();
  };

  // Esc closes the window.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const windowShown = open && !!selectedPos;
  const current = selectedPos
    ? layerRemaps[selectedPos] || layerKeymaps[selectedPos]
    : undefined;
  const currentKey = current ? genKey(current, labelLang) : undefined;

  const isUS = labelLang === 'en-us';
  const isJIS = labelLang === 'ja-jp';

  const originalKeymap = selectedPos ? layerKeymaps[selectedPos] : undefined;
  const originalKey = originalKeymap
    ? genKey(originalKeymap, labelLang)
    : undefined;

  return (
    <>
      <Scene3DBoundary onError={props.onUnavailable}>
        <Keymap3D
          keys={keys}
          plates={geometry.plates}
          bounds={geometry.bounds}
          selectedPos={windowShown ? selectedPos : null}
          focusPos={windowShown && !closing && !isOverview ? selectedPos : null}
          side={windowShown && !closing ? WINDOW_SHARE : 0}
          onPick={pick}
          onMiss={close}
        />
      </Scene3DBoundary>

      <div className="mx-float" style={{ left: 16, top: 16 }}>
        <span className="mx-chip mx-glass">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: '#1f8a55',
            }}
          ></span>
          Layer {layer}
          {unappliedCount > 0 && (
            <span style={{ fontWeight: 500, color: '#6b6e75' }}>
              · {unappliedCount} unapplied
            </span>
          )}
        </span>
      </div>

      <div className="mx-float" style={{ right: 16, top: 16 }}>
        <div
          className="mx-seg mx-glass"
          role="group"
          aria-label="Keyboard Size"
          style={{ padding: 3, borderRadius: 19 }}
        >
          <button
            className="mx-pill sm mx-press on"
            style={{ borderColor: 'transparent' }}
          >
            S
          </button>
          <button
            className="mx-pill sm mx-press"
            style={{ borderColor: 'transparent' }}
          >
            M
          </button>
          <button
            className="mx-pill sm mx-press"
            style={{ borderColor: 'transparent' }}
          >
            L
          </button>
        </div>
        <button
          className="mx-tool mx-press mx-glass"
          disabled={unappliedCount === 0}
          onClick={handleClear}
          title="Clear all changes"
          style={{ border: 'none' }}
        >
          Clear
        </button>
        <button
          className="mx-tool mx-press mx-glass"
          onClick={handlePdf}
          title="Get keymap cheat sheet (PDF)"
          style={{ border: 'none' }}
        >
          PDF
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className="mx-dots mx-press mx-glass"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(!moreOpen)}
            style={{ border: 'none' }}
          ></button>
          {moreOpen && (
            <div
              className="mx-menu r"
              role="menu"
              style={{ top: 44, minWidth: 280 }}
            >
              <button
                className="mx-mi danger"
                role="menuitem"
                onClick={() => {
                  if (confirm('Reset Keymap?')) {
                    /* TODO */
                  }
                }}
              >
                Reset Keymap…
              </button>
            </div>
          )}
        </div>
      </div>

      {!windowShown && (
        <div
          className="mx-float opt"
          style={{ left: 16, bottom: 16, maxWidth: '46%' }}
        >
          <span className="mx-chip mx-glass">
            <span>Click a key to open its settings</span>
          </span>
        </div>
      )}

      <div className="mx-float" style={{ right: 16, bottom: 16 }}>
        <div
          className="mx-seg mx-glass"
          role="group"
          style={{ padding: 3, borderRadius: 19 }}
        >
          <button
            className={`mx-pill sm mx-press ${isUS ? 'on' : ''}`}
            onClick={() => dispatch(AppActions.updateLangLabel('en-us'))}
            style={{ borderColor: 'transparent' }}
          >
            US
          </button>
          <button
            className={`mx-pill sm mx-press ${isJIS ? 'on' : ''}`}
            onClick={() => dispatch(AppActions.updateLangLabel('ja-jp'))}
            style={{ borderColor: 'transparent' }}
          >
            JIS
          </button>
        </div>
        <select
          className="mx-sel mx-glass"
          value={labelLang}
          onChange={(e) =>
            dispatch(AppActions.updateLangLabel(e.target.value as any))
          }
          style={{ height: 34, fontSize: 12, width: 180, border: 'none' }}
        >
          {KeyLabelLangs.KeyLabelLangMenus.map((o) => (
            <option key={o.labelLang} value={o.labelLang}>
              {o.menuLabel}
            </option>
          ))}
        </select>
        <div
          className="mx-seg mx-glass"
          style={{ padding: 3, borderRadius: 19 }}
        >
          <button
            className={`mx-pill sm mx-press ${isOverview ? 'on' : ''}`}
            onClick={() => setIsOverview(true)}
            title="Overview"
            style={{ borderColor: 'transparent' }}
          >
            Overview
          </button>
          <button
            className={`mx-pill sm mx-press ${!isOverview ? 'on' : ''}`}
            onClick={() => setIsOverview(false)}
            title="Zoom"
            style={{ borderColor: 'transparent' }}
          >
            Zoom
          </button>
        </div>
      </div>

      {windowShown && current && currentKey && (
        <div
          className={`mx-win ${closing ? 'out' : ''}`}
          role="dialog"
          aria-label={t('Selected key')}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flex: 'none',
            }}
          >
            <span
              className="mx-cap"
              style={{
                position: 'relative',
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {currentKey.label}
            </span>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                }}
              >
                <b style={{ fontSize: 15 }}>Selected key</b>
                <span className="mx-sub" style={{ fontSize: 12 }}>
                  Layer {layer} · {selectedPos}
                </span>
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  wordBreak: 'break-all',
                }}
              >
                {current.keycodeInfo
                  ? current.keycodeInfo.name.long
                  : hexadecimal(current.code, 4)}
              </span>
              {current.desc && (
                <span
                  className="mx-sub mx-hide-short"
                  style={{ fontSize: 12, lineHeight: 1.5 }}
                >
                  {localizedKeycodeDesc(current.desc)}
                </span>
              )}
            </div>
            <button
              className="mx-ib mx-press"
              aria-label="Close"
              onClick={close}
              style={{ width: 36, height: 36, flex: 'none' }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18"></path>
              </svg>
            </button>
          </div>

          {selectedPos && layerRemaps[selectedPos] && originalKey && (
            <div
              className="mx-row"
              style={{
                padding: '6px 6px 6px 12px',
                background: 'rgba(61, 111, 214, 0.1)',
                flex: 'none',
              }}
            >
              <span>
                Before{' '}
                <b>
                  {originalKey.label || hexadecimal(originalKeymap!.code, 4)}
                </b>{' '}
                → <b>{currentKey.label}</b>
              </span>
              <button
                className="mx-pill sm mx-press"
                onClick={() => {
                  dispatch(AppActions.remapsRemoveKey(layer, selectedPos));
                  dispatch(KeydiffActions.clearKeydiff());
                }}
              >
                Revert
              </button>
            </div>
          )}

          <div
            className="mx-tabs"
            role="tablist"
            style={{
              flex: 'none',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            }}
          >
            {(
              [
                ['keycode', 'Keycode'],
                ['details', 'Details'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id as any)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mx-wpane">
            {tab === 'keycode' ? (
              <Keycodes onPickKey={assign} />
            ) : (
              <KeyInspector />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Same comparison as the classic layout's key popover.
export function sameKeymap(a: IKeymap, b: IKeymap): boolean {
  return (
    a.code === b.code &&
    ModsComposition.genBinary(a.modifiers || []) ===
      ModsComposition.genBinary(b.modifiers || []) &&
    a.direction === b.direction &&
    a.option === b.option
  );
}

class Scene3DBoundary extends React.Component<
  { onError: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('3D keyboard failed, falling back to 2D', error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
