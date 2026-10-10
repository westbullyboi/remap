import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { t } from 'i18next';
import Keymap3DView from '../keymap3d/Keymap3DView';
import './EditorShell.scss';
import { RootState } from '../../../store/state';
import { AppActions, NotificationActions } from '../../../actions/actions';
import { setUiLayout } from '../../../services/ui/UiLayout';
import {
  ConfigureView,
  openEditorView,
  useEditorView,
} from '../remap/EditorViews';
import { useKeyboardConnection } from '../hooks/useKeyboardConnection';
import { useLayerSelection } from '../hooks/useLayerSelection';
import { useWriteToKeyboard } from '../hooks/useWriteToKeyboard';
import { Remaps, RemapsHistory } from '../../../services/history/RemapsHistory';
import {
  buildKeymapFile,
  keymapFileToRemaps,
  parseKeymapFile,
} from '../../../services/keymapfile/KeymapFile';
import {
  replaceLayerMeta,
  useLayerMeta,
} from '../../../services/layers/LayerMeta';

type BigTabId = 'keys' | 'pointing' | 'lighting' | 'cf';

const history = new RemapsHistory();

export default function EditorShell() {
  const view = useEditorView();

  const getBigTab = (v: ConfigureView): BigTabId => {
    if (['keymap', 'macros', 'combos', 'layers'].includes(v)) return 'keys';
    if (['touchpad', 'autoMouse', 'timing', 'knobs'].includes(v))
      return 'pointing';
    if (['leds'].includes(v)) return 'lighting';
    return 'keys';
  };

  const bigTab = getBigTab(view);

  const goTab = (tab: BigTabId) => {
    if (tab === 'keys') openEditorView('keymap');
    else if (tab === 'pointing') openEditorView('touchpad');
    else if (tab === 'lighting') openEditorView('leds');
  };

  return (
    <div className="mx-root">
      <div className="mx-panel">
        <div className="mx-top mx-fade">
          <header className="mx-hdr">
            <ShellHeaderLeft view={view} bigTab={bigTab} />
            <ShellHeaderRight view={view} bigTab={bigTab} />
          </header>

          <nav className="mx-big" aria-label="セクション">
            <button
              className={bigTab === 'keys' ? 'cur' : ''}
              aria-current={bigTab === 'keys'}
              onClick={() => goTab('keys')}
            >
              Keys
            </button>
            <button
              className={bigTab === 'pointing' ? 'cur' : ''}
              aria-current={bigTab === 'pointing'}
              onClick={() => goTab('pointing')}
            >
              Pointing
            </button>
            <button
              className={bigTab === 'lighting' ? 'cur' : ''}
              aria-current={bigTab === 'lighting'}
              onClick={() => goTab('lighting')}
            >
              Lighting
            </button>
          </nav>

          <ShellSubNav view={view} bigTab={bigTab} />
          <div className="mx-rule" style={{ marginTop: 0 }} />
        </div>

        <main
          className="mx-main"
          style={{
            marginLeft: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            WebkitMaskImage: 'none',
            maskImage: 'none',
            paddingBottom: 'clamp(8px, 1.4vh, 14px)',
          }}
        >
          <section
            className="mx-card"
            aria-label="キーボード"
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              padding: 'clamp(6px, 1.2vh, 12px)',
              animation:
                'mx-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s backwards',
            }}
          >
            <div className="mx-stage" style={{ flex: 1 }}>
              <Keymap3DView onUnavailable={() => setUiLayout('classic')} />
            </div>
          </section>
        </main>

        <footer className="mx-foot">
          <div className="mx-hgrp">
            <button
              className="mx-btn mx-press"
              onClick={() => setUiLayout('classic')}
            >
              Back to classic layout
            </button>
          </div>
          <div className="mx-hgrp">
            <ApplyButton />
          </div>
        </footer>
      </div>
    </div>
  );
}

function ShellHeaderLeft({
  view,
  bigTab,
}: {
  view: ConfigureView;
  bigTab: BigTabId;
}) {
  const connection = useKeyboardConnection();
  const { keyboard, info } = connection;
  const devName = info ? info.productName : 'No Device';
  const isConnected = !!keyboard;

  return (
    <div className="mx-hgrp">
      <div style={{ position: 'relative' }}>
        <button className="mx-hbtn mx-press">
          <span className="mx-dot32">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2.5" y="6" width="19" height="12" rx="2.5"></rect>
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"></path>
            </svg>
          </span>
          {devName}
        </button>
      </div>
      <span className="mx-chip opt">
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: isConnected ? '#1f8a55' : '#888',
          }}
        />
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}

function ShellHeaderRight({
  view,
  bigTab,
}: {
  view: ConfigureView;
  bigTab: BigTabId;
}) {
  const layer = useLayerSelection();
  const store = useStore<RootState>();
  const dispatch = useDispatch<any>();
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  const remaps = useSelector((s: RootState) => s.app.remaps);
  const remapsBaseline = useSelector((s: RootState) => s.app.remapsBaseline);
  const info = keyboard?.getInformation();
  const layerMeta = useLayerMeta(info);
  const [, forceRender] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    history.reset(store.getState().app.remaps as Remaps);
    forceRender((n) => n + 1);
  }, [keyboard, remapsBaseline]);

  useEffect(() => {
    history.observe(remaps as Remaps);
    forceRender((n) => n + 1);
  }, [remaps]);

  const restore = (snapshot: Remaps | null) => {
    if (snapshot && snapshot.length === store.getState().app.remaps.length) {
      dispatch(AppActions.remapsSetKeys(snapshot));
    }
  };

  const onExport = () => {
    if (!info) return;
    const state = store.getState();
    const file = buildKeymapFile(
      {
        name: info.productName,
        vendorId: info.vendorId,
        productId: info.productId,
      },
      state.entities.device.keymaps,
      state.app.remaps,
      layerMeta
    );
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${info.productName || 'keymap'}.matrix-keymap.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const state = store.getState();
      const parsed = parseKeymapFile(await file.text());
      const result = keymapFileToRemaps(
        parsed,
        state.entities.device.keymaps,
        state.app.labelLang,
        state.entities.keyboardDefinition?.customKeycodes
      );
      dispatch(AppActions.remapsSetKeys(result.remaps));
      if (parsed.layerMeta) replaceLayerMeta(info, parsed.layerMeta);
      dispatch(
        NotificationActions.addSuccess(
          `${t('Imported')}: ${result.changed} ${t('changes')}` +
            (result.skipped ? ` / ${result.skipped} ${t('skipped')}` : '') +
            ` — ${t('Press Flash to write them to the keyboard.')}`
        )
      );
    } catch (e: any) {
      dispatch(NotificationActions.addError(e?.message || String(e)));
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const undoOff = !history.canUndo();
  const redoOff = !history.canRedo();

  return (
    <div className="mx-hgrp">
      <div style={{ position: 'relative' }}>
        <button
          className="mx-hbtn mx-press"
          style={{ padding: '0 6px 0 16px' }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: layer.color || '#fff',
            }}
          ></span>
          Layer {layer.selected} {layer.name ? `· ${layer.name}` : ''}
          <span className="mx-dot32">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6"></path>
            </svg>
          </span>
        </button>
      </div>

      {bigTab === 'keys' && (
        <>
          <button
            className={`mx-ib mx-press ${undoOff ? 'off' : ''}`}
            aria-label={t('Undo')}
            title={t('Undo')}
            disabled={undoOff}
            onClick={() => restore(history.undo())}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 14L4 9l5-5"></path>
              <path d="M4 9h10a6 6 0 0 1 0 12h-3"></path>
            </svg>
          </button>
          <button
            className={`mx-ib mx-press ${redoOff ? 'off' : ''}`}
            aria-label={t('Redo')}
            title={t('Redo')}
            disabled={redoOff}
            onClick={() => restore(history.redo())}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 14l5-5-5-5"></path>
              <path d="M20 9H10a6 6 0 0 0 0 12h3"></path>
            </svg>
          </button>
        </>
      )}

      <label
        className="mx-hbtn mx-press"
        title={t('Import')}
        style={{ position: 'relative', padding: '0 16px 0 14px' }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>
        </svg>
        <span className="lbl">{t('Import')}</span>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          aria-label={t('Import')}
          onChange={(e) => onImport(e.target.files?.[0])}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        />
      </label>

      <button
        className="mx-hbtn mx-press"
        title={t('Export')}
        onClick={onExport}
        style={{ padding: '0 16px 0 14px' }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 16V4M7 9l5-5 5 5M5 20h14"></path>
        </svg>
        <span className="lbl">{t('Export')}</span>
      </button>

      <button
        className="mx-hbtn mx-press"
        title={t('Firmware')}
        style={{ padding: '0 16px 0 14px' }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="7" y="7" width="10" height="10" rx="1.5"></rect>
          <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"></path>
        </svg>
        <span className="lbl">Firmware</span>
      </button>
    </div>
  );
}

function ShellSubNav({
  view,
  bigTab,
}: {
  view: ConfigureView;
  bigTab: BigTabId;
}) {
  if (bigTab === 'keys') {
    return (
      <nav className="mx-subnav" aria-label="Keys">
        <button
          className={view === 'keymap' ? 'cur' : ''}
          aria-current={view === 'keymap'}
          onClick={() => openEditorView('keymap')}
        >
          Keymap
        </button>
        <button
          className={view === 'macros' ? 'cur' : ''}
          aria-current={view === 'macros'}
          onClick={() => openEditorView('macros')}
        >
          Macros
        </button>
        <button
          className={view === 'combos' ? 'cur' : ''}
          aria-current={view === 'combos'}
          onClick={() => openEditorView('combos')}
        >
          Combos
        </button>
        <button
          className={view === 'layers' ? 'cur' : ''}
          aria-current={view === 'layers'}
          onClick={() => openEditorView('layers')}
        >
          Layers
        </button>
      </nav>
    );
  }
  if (bigTab === 'pointing') {
    return (
      <nav className="mx-subnav" aria-label="Pointing">
        <button
          className={view === 'touchpad' ? 'cur' : ''}
          aria-current={view === 'touchpad'}
          onClick={() => openEditorView('touchpad')}
        >
          Touchpad
        </button>
        <button
          className={view === 'autoMouse' ? 'cur' : ''}
          aria-current={view === 'autoMouse'}
          onClick={() => openEditorView('autoMouse')}
        >
          Mouse layer
        </button>
        <button
          className={view === 'timing' ? 'cur' : ''}
          aria-current={view === 'timing'}
          onClick={() => openEditorView('timing')}
        >
          Timing
        </button>
        <button
          className={view === 'knobs' ? 'cur' : ''}
          aria-current={view === 'knobs'}
          onClick={() => openEditorView('knobs')}
        >
          Knobs
        </button>
      </nav>
    );
  }
  if (bigTab === 'lighting') {
    return (
      <nav className="mx-subnav" aria-label="Lighting">
        <button
          className={view === 'leds' ? 'cur' : ''}
          aria-current={view === 'leds'}
          onClick={() => openEditorView('leds')}
        >
          Effects
        </button>
      </nav>
    );
  }
  return <nav className="mx-subnav" />;
}

function ApplyButton() {
  const { pending, writing, write } = useWriteToKeyboard();
  return (
    <button
      className={`mx-primary mx-press ${pending === 0 || writing ? 'idle' : ''}`}
      disabled={pending === 0 || writing}
      onClick={write}
    >
      {writing ? t('Writing...') : t('Write to keyboard')}
      {pending > 0 && (
        <span
          style={{
            background: '#fff',
            color: '#0e0e10',
            padding: '2px 6px',
            borderRadius: 10,
            fontSize: 12,
            marginLeft: 8,
          }}
        >
          {pending}
        </span>
      )}
    </button>
  );
}
