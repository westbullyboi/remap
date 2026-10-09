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
import './Keymap3DView.scss';

const Keymap3D = React.lazy(() => import('./Keymap3D'));

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

  return (
    <div className="keymap3d">
      <Scene3DBoundary onError={props.onUnavailable}>
        <Suspense
          fallback={<div className="keymap3d-loading">{t('Loading 3D…')}</div>}
        >
          <Keymap3D
            keys={keys}
            plates={geometry.plates}
            bounds={geometry.bounds}
            selectedPos={windowShown ? selectedPos : null}
            focusPos={windowShown && !closing ? selectedPos : null}
            side={windowShown && !closing ? WINDOW_SHARE : 0}
            onPick={pick}
            onMiss={close}
          />
        </Suspense>
      </Scene3DBoundary>

      {!windowShown && (
        <p className="keymap3d-hint">{t('Click a key to open its settings')}</p>
      )}

      {windowShown && current && currentKey && (
        <div
          className={`keymap3d-window${closing ? ' closing' : ''}`}
          role="dialog"
          aria-label={t('Selected key')}
        >
          <header className="keymap3d-window-header">
            <span className="keymap3d-window-cap">{currentKey.label}</span>
            <div className="keymap3d-window-title">
              <span className="mono strong">
                {current.keycodeInfo
                  ? current.keycodeInfo.name.long
                  : hexadecimal(current.code, 4)}
              </span>
              <span className="mono dim">
                {t('Layer')} {layer} · {selectedPos}
              </span>
              {current.desc && (
                <span className="keymap3d-window-desc">
                  {localizedKeycodeDesc(current.desc)}
                </span>
              )}
            </div>
            <button
              type="button"
              className="keymap3d-window-close"
              aria-label={t('Close')}
              onClick={close}
            >
              ×
            </button>
          </header>
          <div className="keymap3d-tabs" role="tablist">
            {(
              [
                ['keycode', t('Keycode')],
                ['details', t('Details')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="keymap3d-window-body">
            {tab === 'keycode' ? (
              <Keycodes onPickKey={assign} />
            ) : (
              <KeyInspector />
            )}
          </div>
          {tab === 'keycode' && (
            <p className="keymap3d-window-note">
              {t('Pick a keycode to assign it to this key')}
            </p>
          )}
        </div>
      )}
    </div>
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
