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
import { key3D, layout3D } from './Keyboard3DGeometry';
import type { Keymap3DKey } from './Keymap3D';
import { hidActionsThunk } from '../../../actions/hid.action';
import { KeyLabelLangs } from '../../../services/labellang/KeyLabelLangs';
import { KeymapPdfGenerator } from '../../../services/pdf/KeymapPdfGenerator';
import './Keymap3DView.scss';

import Keymap3D from './Keymap3D';
import { layerName, useLayerMeta } from '../../../services/layers/LayerMeta';
import { useLightingPreview } from '../../../services/lighting/LightingPreview';
import { useMatrixDeviceData } from '../../../services/matrix/MatrixDeviceData';
import {
  getEditorView,
  openEditorView,
  useEditorView,
} from '../remap/EditorViews';
import { keyboardHasTouchpad } from '../../../services/pointing/TouchpadLayout';
import {
  edgeKnobPreview,
  sameZone,
  useEdgeKnobPreview,
  zoneRects,
} from '../../../services/pointing/EdgeKnobPreview';
import { CORNER_OPTIONS } from '../../../services/pointing/EdgeKnob';
import { describeKeycode } from '../pointing/EdgeKnobShared';
import { CORNER_LABELS, EDGE_LABELS } from '../pointing/EdgeZonesCard';
import type {
  KnobActionsOverlay,
  TouchpadZoneOverlay,
} from './ControlOverlays3D';

// Share of the stage covered by the settings window.
const WINDOW_SHARE = 0.42;
// Length of the window's closing animation (see Keymap3DView.scss).
const CLOSE_MS = 220;
// Share covered by the window of another tab (shell/ViewWindow).
const TAB_WINDOW_SHARE = 0.52;

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
  const hasTouchpad = useSelector((s: RootState) =>
    keyboardHasTouchpad(s.entities.keyboardDefinition)
  );
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
  const edgeKnob = useEdgeKnobPreview();
  const geometry = useMemo(
    () => layout3D(models.map(key3D), hasTouchpad),
    [models, hasTouchpad]
  );

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

  // Layer stack view: every layer's keyboard stacked; the wheel spreads
  // the layers apart or closer.
  const [stacked, setStacked] = useState(false);
  const [stackGap, setStackGap] = useState(1.4);
  const layerMeta = useLayerMeta(keyboard?.getInformation());
  const stackLayers = Math.max(1, layerCount || 4);
  const stack: Keymap3DKey[][] | null = useMemo(() => {
    if (!stacked) return null;
    return [...Array(stackLayers)].map((_, i) => {
      const lk = keymaps[i] || {};
      const lr = remaps[i] || {};
      return geometry.keys.map((key) => {
        const pos = key.model.pos;
        const current = pos ? lr[pos] || lk[pos] : undefined;
        return {
          key,
          label: current ? genKey(current, labelLang).label : '',
          changed: !!pos && pos in lr,
          encoder: key.model.isEncoder,
        };
      });
    });
  }, [stacked, stackLayers, keymaps, remaps, geometry, labelLang]);
  const stackNames = useMemo(
    () => [...Array(stackLayers)].map((_, i) => layerName(layerMeta, i)),
    [stackLayers, layerMeta]
  );
  useEffect(() => {
    if (!stacked) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.('.keymap3d-canvas')) return;
      e.preventDefault();
      setStackGap((g) => Math.min(3.2, Math.max(0.6, g - e.deltaY * 0.002)));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [stacked]);
  // A key picked on another layer of the stack: switch to that layer
  // first, then open the key once its keymap is shown.
  const [pendingPick, setPendingPick] = useState<string | null>(null);
  const pickInLayer = (target: number, pos: string) => {
    if (target === layer) {
      pick(pos);
      return;
    }
    dispatch(KeymapActions.clearSelectedKeyPosition());
    dispatch(KeydiffActions.clearKeydiff());
    dispatch(KeymapActions.updateSelectedLayer(target));
    setPendingPick(pos);
  };
  useEffect(() => {
    if (pendingPick === null) return;
    setPendingPick(null);
    pick(pendingPick);
  }, [layer]);

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

  // Knobs open the Knobs settings (zoomed to that knob) instead of the key
  // settings; `asKey` edits the knob's push key like any key.
  const pick = (pos: string, asKey = false) => {
    const knob = asKey
      ? undefined
      : geometry.keys.find((k) => k.model.isEncoder && k.model.pos === pos);
    if (knob) {
      const midX = (geometry.bounds.minX + geometry.bounds.maxX) / 2;
      edgeKnobPreview.setKnob(knob.x < midX ? 0 : 1);
      if (open) close();
      if (getEditorView() !== 'knobs') openEditorView('knobs');
      return;
    }
    // A key picked while another tab's window is open goes back to Keymap.
    if (getEditorView() !== 'keymap') openEditorView('keymap');
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

  // "Change the push key" in the Knobs settings.
  useEffect(() => {
    const request = edgeKnob.editKey;
    if (!request) return;
    edgeKnobPreview.clearEditKey();
    const knob = knobOf(geometry, request.knob);
    if (knob?.model.pos) pick(knob.model.pos, true);
  }, [edgeKnob.editKey]);

  // A keycode dragged from the palette and dropped on a key.
  const draggingKey = useSelector(
    (s: RootState) => s.configure.keycodeKey.draggingKey
  );
  const dropKey = (pos: string) => {
    const original = layerKeymaps[pos];
    if (!draggingKey || !original) return;
    const next = draggingKey.keymap;
    if (sameKeymap(original, next)) {
      dispatch(AppActions.remapsRemoveKey(layer, pos));
      if (pos === selectedPos) dispatch(KeydiffActions.clearKeydiff());
    } else {
      dispatch(AppActions.remapsSetKey(layer, pos, next));
      if (pos === selectedPos)
        dispatch(KeydiffActions.updateKeydiff(original, next));
    }
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
  const editorView = useEditorView();
  // The Lighting settings show the LEDs on the 3D keyboard.
  const lightingState = useLightingPreview();
  const deviceData = useMatrixDeviceData(keyboard);
  const ledPreview = useMemo(() => {
    if (editorView !== 'leds') return null;
    const codes: { [pos: string]: number } = {};
    Object.keys(layerKeymaps).forEach((pos) => {
      codes[pos] = (layerRemaps[pos] || layerKeymaps[pos]).code;
    });
    return {
      state: lightingState,
      layer,
      layerColor: deviceData.leds?.[layer] ?? 0,
      codes,
    };
  }, [editorView, lightingState, deviceData, layer, layerKeymaps, layerRemaps]);
  // The Touchpad settings show the pad's zones, the Knobs settings what
  // the knobs do.
  const encodersKeymaps = useSelector(
    (s: RootState) => s.entities.device.encodersKeymaps
  );
  const encodersRemaps = useSelector((s: RootState) => s.app.encodersRemaps);
  const touchpadZones = useMemo(() => {
    const values = edgeKnob.values;
    if (editorView !== 'touchpad' || !values || !geometry.touchpad) return null;
    const name = (code: number) => (code ? t(describeKeycode(code)) : '');
    const cornerName = (code: number) => {
      const option = CORNER_OPTIONS.find((o) => o.code === code);
      return code ? (option ? t(option.label) : describeKeycode(code)) : '';
    };
    return zoneRects(values.edgeWidth).map((r): TouchpadZoneOverlay => {
      const selected = sameZone(r.zone, edgeKnob.zone);
      const id = `${r.zone.kind}-${r.zone.index}`;
      if (r.zone.kind === 'corner') {
        const label = cornerName(values.corners[r.zone.index] || 0);
        return {
          ...r,
          id,
          kind: 'corner',
          vertical: false,
          start: label,
          end: '',
          set: !!label,
          selected,
          title: t(CORNER_LABELS[r.zone.index]),
          detail: [label || t('None')],
        };
      }
      const e = r.zone.index;
      const [a, b] = (values.edges[e] || [0, 0]).map(name);
      const side = e < 2;
      return {
        ...r,
        id,
        kind: 'edge',
        vertical: side,
        // Strips start at the bottom (side edges) or the left.
        start: side ? b : a,
        end: side ? a : b,
        set: !!(a || b),
        selected,
        title: t(EDGE_LABELS[e]),
        detail:
          a || b
            ? [
                `${side ? t('Slide up') : t('Slide left')} → ${a || t('None')}`,
                `${side ? t('Slide down') : t('Slide right')} → ${b || t('None')}`,
              ]
            : [t('None')],
      };
    });
  }, [editorView, edgeKnob, geometry.touchpad]);
  const knobActions = useMemo(() => {
    if (editorView !== 'knobs') return null;
    const knobs = geometry.keys.filter(
      (k) => k.model.isEncoder && k.model.encoderId !== null
    );
    if (knobs.length === 0) return null;
    const midX = (geometry.bounds.minX + geometry.bounds.maxX) / 2;
    const label = (keymap?: IKeymap) =>
      keymap ? genKey(keymap, labelLang).label.replace(/\n/g, ' ') : '';
    return knobs.map((k): KnobActionsOverlay => {
      const id = k.model.encoderId!;
      const current = encodersKeymaps[layer]?.[id];
      const remapped = encodersRemaps[layer]?.[id];
      // The firmware's push-and-turn knobs are 0 left, 1 right.
      const side = k.x < midX ? 0 : 1;
      const push = edgeKnob.values?.knobs[side];
      const pushName = (code: number) =>
        `${t('While pushed')}: ${code ? t(describeKeycode(code)) : t('None')}`;
      return {
        encoderId: id,
        onTouch: () => edgeKnobPreview.setKnob(side),
        turn: [
          label(remapped?.counterclockwise || current?.counterclockwise),
          label(remapped?.clockwise || current?.clockwise),
        ],
        push: push ? [pushName(push[0]), pushName(push[1])] : null,
      };
    });
  }, [
    editorView,
    geometry,
    encodersKeymaps,
    encodersRemaps,
    layer,
    labelLang,
    edgeKnob.values,
  ]);
  // The Touchpad settings frame the pad (and the card above it), the Knobs
  // settings the knobs and their cards.
  const focusArea = useMemo(() => {
    if (editorView === 'touchpad' && geometry.touchpad) {
      return {
        minX: geometry.touchpad.minX - 1.4,
        maxX: geometry.touchpad.maxX + 1.4,
        minZ: geometry.touchpad.minZ - 1.8,
        maxZ: geometry.touchpad.maxZ + 0.8,
      };
    }
    const knob = knobOf(geometry, edgeKnob.knob);
    if (editorView === 'knobs' && knob) {
      return {
        minX: knob.x - 3.6,
        maxX: knob.x + 3.6,
        minZ: knob.z - 2.2,
        maxZ: knob.z + 2.2,
      };
    }
    return null;
  }, [editorView, geometry, edgeKnob.knob]);
  const pickTouchpad = (px: number, py: number) => {
    if (editorView === 'touchpad' && edgeKnob.values) {
      const hit = zoneRects(edgeKnob.values.edgeWidth).find(
        (r) => px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1
      );
      if (hit) edgeKnobPreview.setZone(hit.zone);
      return;
    }
    openEditorView('touchpad');
  };
  const tabWindow = editorView !== 'keymap';
  // The stage's chips come in again when the section changes.
  const chipKey = sectionOf(editorView);
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
          touchpad={geometry.touchpad}
          onTouchpad={pickTouchpad}
          touchpadZones={stack ? null : touchpadZones}
          knobActions={stack ? null : knobActions}
          focusArea={focusArea}
          lighting={stack ? null : ledPreview}
          layer={layer}
          stack={stack}
          stackGap={stackGap}
          stackNames={stackNames}
          onPickInLayer={pickInLayer}
          onDropKey={stack ? undefined : dropKey}
          selectedPos={windowShown ? selectedPos : null}
          focusPos={windowShown && !closing && !isOverview ? selectedPos : null}
          side={
            windowShown && !closing
              ? WINDOW_SHARE
              : tabWindow
                ? TAB_WINDOW_SHARE
                : 0
          }
          onPick={pick}
          onMiss={close}
        />
      </Scene3DBoundary>

      <div
        key={`tl-${chipKey}`}
        className="mx-float mx-anim-chip"
        style={{ left: 16, top: 16 }}
      >
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

      <div
        key={`tr-${chipKey}`}
        className="mx-float mx-anim-chip"
        style={{ right: 16, top: 16 }}
      >
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
          className={`mx-tool mx-press mx-glass ${stacked ? 'on' : ''}`}
          aria-pressed={stacked}
          onClick={() => setStacked(!stacked)}
          title={t('Show all layers stacked (wheel: spacing)')}
          style={{ border: 'none' }}
        >
          {t('Layer stack')}
        </button>
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

      <div
        key={`br-${chipKey}`}
        className="mx-float mx-anim-chip"
        style={{ right: 16, bottom: 16 }}
      >
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

          <div key={tab} className="mx-wpane mx-anim-pane">
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

function sectionOf(view: string): string {
  if (['touchpad', 'autoMouse', 'timing', 'knobs'].includes(view))
    return 'pointing';
  if (view === 'leds') return 'lighting';
  return 'keys';
}

// The knob on the left (0) or right (1) half.
function knobOf(geometry: ReturnType<typeof layout3D>, side: number) {
  const knobs = geometry.keys.filter((k) => k.model.isEncoder);
  if (knobs.length === 0) return null;
  const midX = (geometry.bounds.minX + geometry.bounds.maxX) / 2;
  return (
    knobs.find((k) => (k.x < midX ? 0 : 1) === side) ||
    knobs[Math.min(side, knobs.length - 1)]
  );
}
