/* eslint-disable no-undef */
import React, { useEffect, useRef, useState } from 'react';
import { t } from 'i18next';
import { Menu, MenuItem } from '@mui/material';
import './EditorShell.scss';
import './KeyConfigTheme.scss';
import './SettingsTheme.scss';
import { IKeyboard } from '../../../services/hid/Hid';
import { hexadecimal } from '../../../utils/StringUtils';
import { APPLICATION_NAME } from '../../../utils/Brand';
import { setUiLayout } from '../../../services/ui/UiLayout';
import {
  ConfigureView,
  EDITOR_VIEWS,
  EditorViewIcon,
  editorViewLabel,
  KEYBOARD_SCALES,
  loadKeyboardScale,
  openEditorView,
  saveKeyboardScale,
  useEditorView,
} from '../remap/EditorViews';
import { useAccount } from '../hooks/useAccount';
import { useKeyConfigDisplay } from '../hooks/useKeyConfigDisplay';
import { useKeyboardConnection } from '../hooks/useKeyboardConnection';
import { useLayerSelection } from '../hooks/useLayerSelection';
import { useWriteToKeyboard } from '../hooks/useWriteToKeyboard';
import { Desc, EditMode, KnobTab, SplitBanner } from '../remap/Remap';
import EditorSidebar from '../sidebar/EditorSidebar.container';
import KeyInspector from '../inspector/KeyInspector.container';
import Keycodes from '../keycodes/Keycodes.container';
import Keymap3DView from '../keymap3d/Keymap3DView';
import {
  KeyboardViewMode,
  loadKeyboardViewMode,
  saveKeyboardViewMode,
} from '../keymap3d/KeyboardViewMode';
import Combos from '../combos/Combos';
import PointingSettings from '../pointing/PointingSettings.container';
import HeaderActions from '../header/HeaderActions';
import InfoDialog from '../info/InfoDialog.container';
import KeymapSafetyDialog from '../safety/KeymapSafetyDialog';
import { FlashBackupBanner } from '../firmware/FlashBackupBanner';
import { firmwareFlasherStore } from '../firmware/firmwareFlasherStore';
import { SplitFirmwareLine } from '../split/SplitFirmwareStatus';
import ProfileIcon from '../../common/auth/ProfileIcon.container';
import LicenseLink from '../../common/license/LicenseLink';

// The redesigned editor (UI rebuild P3): an icon rail with the screens, a
// side panel with the keyboard and its layers, and the selected screen.
// Shown instead of the header and Remap when the new layout is chosen.
export default function EditorShell() {
  // Any part of the editor may open a screen (see openEditorView).
  const view = useEditorView();
  const layers = useLayerSelection();
  const { hoverKey } = useKeyConfigDisplay();

  // An opened keyboard starts on Key Config.
  useEffect(() => openEditorView('keymap'), []);

  // Mouse Layer's "edit this layer".
  const editLayer = (layer: number) => {
    layers.select(layer);
    openEditorView('keymap');
  };

  return (
    <div className="mx-shell">
      <ShellRail view={view} onView={openEditorView} />
      <ShellSidePanel />
      <main className="mx-shell-main">
        <ShellTopBar view={view} />
        <SplitBanner />
        <FlashBackupBanner />
        {view === 'keymap' ? (
          <KeyConfigView />
        ) : (
          <section className="mx-shell-card mx-shell-settings">
            {view === 'combos' ? (
              <Combos />
            ) : view === 'knobs' ? (
              <KnobTab />
            ) : (
              <PointingSettings mode={view} onEditLayer={editLayer} />
            )}
          </section>
        )}
      </main>
      {view === 'keymap' && <Desc value={hoverKey} />}
    </div>
  );
}

function ShellRail(props: {
  view: ConfigureView;
  // eslint-disable-next-line no-unused-vars
  onView: (view: ConfigureView) => void;
}) {
  const { keyboard } = useKeyboardConnection();
  return (
    <div className="mx-shell-rail-case">
      <nav className="mx-shell-rail" aria-label={t('Screens')}>
        <span className="mx-shell-brand" aria-label={APPLICATION_NAME}>
          M
        </span>
        <span className="mx-shell-rail-divider" aria-hidden="true" />
        {EDITOR_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            className="mx-shell-rail-button"
            aria-label={editorViewLabel(v)}
            aria-current={props.view === v ? 'page' : undefined}
            title={editorViewLabel(v)}
            onClick={() => props.onView(v)}
          >
            <EditorViewIcon view={v} />
          </button>
        ))}
      </nav>
      <button
        type="button"
        className="mx-shell-firmware"
        title={t('Write firmware')}
        onClick={() => firmwareFlasherStore.open(keyboard || null)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 3h8v14H6zM9 6h2M10 9v5M8 12l2 2 2-2" />
        </svg>
        <span>{t('Firmware')}</span>
      </button>
    </div>
  );
}

function ShellSidePanel() {
  const { keyboard } = useKeyboardConnection();
  return (
    <aside className="mx-shell-side" aria-label={t('Keyboard')}>
      <DeviceSwitcher />
      <EditorSidebar embedded />
      <div className="mx-shell-side-footer">
        <div className="mx-shell-connection">
          <span className="mx-shell-dot" aria-hidden="true" />
          <span>USB · {t('Connected')}</span>
        </div>
        <SplitFirmwareLine keyboard={keyboard || null} />
        <button
          type="button"
          className="mx-shell-link"
          onClick={() => setUiLayout('classic')}
        >
          {t('Back to the classic layout')}
        </button>
        <LicenseLink />
      </div>
    </aside>
  );
}

// Name of the open keyboard; opens the menu to switch to another one.
function DeviceSwitcher() {
  const connection = useKeyboardConnection();
  const { keyboard, keyboards, info } = connection;
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  if (!keyboard || !info) return null;

  const choose = (kbd: IKeyboard) => {
    setOpen(false);
    connection.open(kbd);
  };
  const another = () => {
    setOpen(false);
    connection.openAnother();
  };

  return (
    <div className="mx-shell-device">
      <button
        ref={anchorRef}
        type="button"
        className="mx-shell-device-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="mx-shell-device-name">{info.productName}</span>
        <span className="mx-shell-device-ids">
          {hexadecimal(info.vendorId, 4)} : {hexadecimal(info.productId, 4)}
        </span>
      </button>
      <button
        type="button"
        className="mx-shell-icon-button"
        aria-label={t('Keyboard information')}
        title={t('Keyboard information')}
        onClick={() => setInfoOpen(true)}
      >
        i
      </button>
      <Menu
        anchorEl={anchorRef.current}
        open={open}
        onClose={() => setOpen(false)}
      >
        {keyboards.map((kbd, index) => {
          const item = kbd.getInformation();
          return (
            <MenuItem
              key={index}
              disabled={kbd === keyboard}
              onClick={() => choose(kbd)}
            >
              {item.productName} ({hexadecimal(item.vendorId, 4)} /{' '}
              {hexadecimal(item.productId, 4)})
            </MenuItem>
          );
        })}
        <MenuItem onClick={another}>{t('+ KEYBOARD')}</MenuItem>
      </Menu>
      <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

function ShellTopBar(props: { view: ConfigureView }) {
  const layer = useLayerSelection();
  const account = useAccount();
  return (
    <header className="mx-shell-topbar">
      <div className="mx-shell-title">
        <h1>{editorViewLabel(props.view)}</h1>
        {props.view === 'keymap' && (
          <span className="mx-shell-layer-pill">
            <span
              className="mx-shell-layer-dot"
              style={{ backgroundColor: layer.color }}
              aria-hidden="true"
            />
            {layer.name} · L{layer.selected}
          </span>
        )}
      </div>
      <div className="mx-shell-topbar-actions">
        <HeaderActions />
        {account.available && <ProfileIcon logout={account.logout} />}
        <ApplyButton />
      </div>
    </header>
  );
}

// Writes the pending changes to the keyboard ("Flash" in the classic
// layout), after the same keymap check.
function ApplyButton() {
  const { pending, writing, issues, write, writeAnyway, dismissIssues } =
    useWriteToKeyboard();

  return (
    <React.Fragment>
      <button
        type="button"
        className="mx-shell-apply"
        disabled={pending === 0 || writing}
        onClick={write}
      >
        <span>{writing ? t('Writing...') : t('Write to keyboard')}</span>
        {pending > 0 && (
          <span
            className="mx-shell-apply-count"
            title={t('Changes not yet flashed')}
          >
            {pending}
          </span>
        )}
      </button>
      <KeymapSafetyDialog
        open={issues !== null}
        issues={issues || []}
        onCancel={dismissIssues}
        onProceed={writeAnyway}
      />
    </React.Fragment>
  );
}

function KeyConfigView() {
  const { keyboardWidth, macroKey } = useKeyConfigDisplay();
  const [scale, setScale] = useState(loadKeyboardScale);
  const [mode, setMode] = useState<KeyboardViewMode>(() =>
    loadKeyboardViewMode()
  );
  const areaRef = useRef<HTMLDivElement>(null);
  const zoom = useKeyboardZoom(areaRef, keyboardWidth, scale);
  // Horizontal room kept around the keyboard (same as the classic layout).
  const minWidth = keyboardWidth ? keyboardWidth + 64 : 0;
  const changeMode = (next: KeyboardViewMode) => {
    saveKeyboardViewMode(next);
    setMode(next);
  };

  if (mode === '3d' && !macroKey) {
    return (
      <section className="mx-shell-card mx-shell-keyboard mx-shell-keyboard-3d">
        <div className="mx-shell-keyboard-tools">
          <KeyboardViewToggle mode={mode} onChange={changeMode} />
        </div>
        <Keymap3DView onUnavailable={() => setMode('2d')} />
      </section>
    );
  }

  return (
    <React.Fragment>
      <section className="mx-shell-card mx-shell-keyboard" ref={areaRef}>
        {!macroKey && (
          <div className="mx-shell-keyboard-tools">
            <KeyboardViewToggle mode={mode} onChange={changeMode} />
            <div
              className="mx-shell-segment"
              role="group"
              aria-label={t('Keyboard size')}
            >
              {KEYBOARD_SCALES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={scale === s.value}
                  title={`${t('Keyboard size')}: ${Math.round(s.value * 100)}%`}
                  onClick={() => {
                    saveKeyboardScale(s.value);
                    setScale(s.value);
                  }}
                >
                  {t(`keyboardScale.${s.label}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="keyboard-wrapper" style={{ minWidth, zoom }}>
          <EditMode mode={macroKey ? 'macro' : 'keymap'} />
        </div>
      </section>
      <div className="mx-shell-keycodes">
        <section className="mx-shell-card mx-shell-inspector">
          <KeyInspector />
        </section>
        <section className="mx-shell-card mx-shell-palette">
          <Keycodes />
        </section>
      </div>
    </React.Fragment>
  );
}

// Switches Key Config between the 3D and the 2D keyboard.
function KeyboardViewToggle(props: {
  mode: KeyboardViewMode;
  // eslint-disable-next-line no-unused-vars
  onChange: (mode: KeyboardViewMode) => void;
}) {
  return (
    <div
      className="mx-shell-segment"
      role="group"
      aria-label={t('Keyboard view')}
    >
      {(['3d', '2d'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={props.mode === m}
          onClick={() => props.onChange(m)}
        >
          {m.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// Scale of the keyboard so that it fits the card (up to the chosen size).
function useKeyboardZoom(
  ref: React.RefObject<HTMLElement>,
  keyboardWidth: number,
  scale: number
): number {
  const [zoom, setZoom] = useState(scale);
  useEffect(() => {
    const el = ref.current;
    const update = () => {
      if (!el || !keyboardWidth) {
        setZoom(scale);
        return;
      }
      const available = el.clientWidth - 8;
      setZoom(Math.max(0.3, Math.min(scale, available / (keyboardWidth + 64))));
    };
    update();
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, keyboardWidth, scale]);
  return zoom;
}
