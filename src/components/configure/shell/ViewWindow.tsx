import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { t } from 'i18next';
import { RootState } from '../../../store/state';
import { KeymapActions } from '../../../actions/actions';
import {
  MacroActionsThunk,
  MacroEditorActions,
} from '../../../actions/macro.action';
import { QK_MACRO_MIN } from '../../../services/hid/compositions/MacroComposition';
import { KeycodeList } from '../../../services/hid/KeycodeList';
import { genKey } from '../keycodekey/KeyGen';
import {
  ConfigureView,
  editorViewLabel,
  openEditorView,
} from '../remap/EditorViews';
import PointingSettings from '../pointing/PointingSettings.container';
import type { PointingSettingsMode } from '../pointing/PointingSettings';
import { KnobPanel } from '../pointing/KnobPanel';
import Combos from '../combos/Combos';
import EditorSidebar from '../sidebar/EditorSidebar.container';
import MacroEditor from '../macroeditor/MacroEditor.container';
import OsProfileBar from './OsProfileBar';
import { WindowKeysCard } from './WindowKeysCard';
import { useOsEdit } from '../../../services/pointing/OsProfiles';

// Settings that have a Mac version (firmware r22).
const PER_OS_VIEWS: ConfigureView[] = ['touchpad', 'timing', 'knobs'];

const POINTING_MODES: ConfigureView[] = [
  'touchpad',
  'autoMouse',
  'timing',
  'leds',
];

// Settings of the selected tab (everything but Keymap), shown as a window
// over the 3D keyboard in the new layout. Closing it goes back to Keymap.
export default function ViewWindow(props: { view: ConfigureView }) {
  const { view } = props;
  const dispatch = useDispatch();
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  const osEdit = useOsEdit(keyboard);

  // Esc closes the window.
  useEffect(() => {
    if (view === 'keymap') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') openEditorView('keymap');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  if (view === 'keymap') return null;
  const title = editorViewLabel(view);

  let body: React.ReactNode;
  if (POINTING_MODES.includes(view)) {
    body = (
      <PointingSettings
        mode={view as PointingSettingsMode}
        onEditLayer={(layer: number) => {
          dispatch(KeymapActions.updateSelectedLayer(layer));
          openEditorView('keymap');
        }}
      />
    );
  } else if (view === 'knobs') {
    body = <KnobPanel keyboard={keyboard} />;
  } else if (view === 'combos') {
    body = <Combos />;
  } else if (view === 'layers') {
    body = <EditorSidebar />;
  } else {
    body = <MacroWindowBody />;
  }

  return (
    <div className="mx-win mx-viewwin" role="dialog" aria-label={title}>
      <div className="mx-viewwin-head">
        <b>{title}</b>
        <button
          type="button"
          className="mx-ib mx-press"
          aria-label={t('Close')}
          title={t('Close')}
          onClick={() => openEditorView('keymap')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div key={view} className="mx-viewwin-body mx-anim-pane">
        {PER_OS_VIEWS.includes(view) && (
          <OsProfileBar keyboard={keyboard} edit={osEdit} />
        )}
        {/* Reloads the settings when another OS's set is picked. */}
        <React.Fragment key={osEdit}>{body}</React.Fragment>
      </div>
    </div>
  );
}

// Macros: pick a macro slot, then edit it with the macro editor.
function MacroWindowBody() {
  const dispatch = useDispatch();
  const macroKey = useSelector((s: RootState) => s.configure.macroEditor.key);
  const maxCount = useSelector(
    (s: RootState) => s.entities.device.macro.maxCount
  );
  const labelLang = useSelector((s: RootState) => s.app.labelLang);
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  const customKeycodes = useSelector(
    (s: RootState) => s.entities.keyboardDefinition?.customKeycodes
  );
  useEffect(() => () => void dispatch(MacroEditorActions.clearMacroKey()), []);

  if (macroKey) return <MacroEditor />;
  const windowKeys = <WindowKeysCard keyboard={keyboard} />;
  if (!maxCount) {
    return (
      <div>
        <p className="mx-sub">
          {t('This keyboard has no macros (dynamic keymap macros are off).')}
        </p>
        {windowKeys}
      </div>
    );
  }
  return (
    <div>
      <p className="mx-sub" style={{ marginTop: 0 }}>
        {t(
          'Choose a macro to edit. Assign it to a key with M0, M1... in the Keymap palette.'
        )}
      </p>
      <div className="mx-macro-list">
        {[...Array(maxCount)].map((_, i) => (
          <button
            key={i}
            type="button"
            className="mx-btn mx-press"
            onClick={() => {
              const keymap = KeycodeList.getKeymap(
                QK_MACRO_MIN + i,
                labelLang,
                customKeycodes
              );
              dispatch(
                MacroActionsThunk.updateMacroKey(genKey(keymap, labelLang))
              );
            }}
          >
            M{i}
          </button>
        ))}
      </div>
      {windowKeys}
    </div>
  );
}
