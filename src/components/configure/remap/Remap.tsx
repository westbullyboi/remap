/* eslint-disable no-undef */
import React from 'react';
import { t } from 'i18next';
import './Remap.scss';
import './EditorPanel.scss';
import { hexadecimal } from '../../../utils/StringUtils';
import Keycodes from '../keycodes/Keycodes.container';
import Keymap from '../keymap/Keymap.container';
import { RemapActionsType, RemapStateType } from './Remap.container';
import { Key } from '../keycodekey/KeyGen';
import { kinds2CategoryLabel } from '../customkey/AutocompleteKeys';
import MacroEditor from '../macroeditor/MacroEditor.container';
import PointingSettings from '../pointing/PointingSettings.container';
import EditorSidebar from '../sidebar/EditorSidebar.container';
import KeyInspector from '../inspector/KeyInspector.container';
import Combos from '../combos/Combos';
import LayerBar, { EditorFooter } from '../layerbar/LayerBar';
import { localizedKeycodeDesc } from '../../../services/hid/KeycodeDescJa';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store/state';
import { SplitFirmwareBanner } from '../split/SplitFirmwareStatus';
import { FlashBackupBanner } from '../firmware/FlashBackupBanner';
import { KnobPanel } from '../pointing/KnobPanel';
import {
  ConfigureView,
  DEFAULT_KEYBOARD_SCALE,
  EDITOR_VIEWS,
  EditorViewIcon,
  editorViewLabel,
  getEditorView,
  KEYBOARD_SCALES,
  loadKeyboardScale,
  saveKeyboardScale,
  subscribeEditorView,
} from './EditorViews';

type OwnProp = {};
type RemapPropType = OwnProp &
  Partial<RemapStateType> &
  Partial<RemapActionsType>;

type OwnState = {
  minWidth: number;
  view: ConfigureView;
  // Scale of the keyboard so it fits narrow screens (1 = full size).
  zoom: number;
  // Size picked by the user (upper bound of zoom).
  scale: number;
};

// Horizontal room kept around the keyboard for the side toolbar.
const MIN_SIDE_MENU_WIDTH = 32;
export default class Remap extends React.Component<RemapPropType, OwnState> {
  private readonly keyboardWrapperRef: React.RefObject<HTMLDivElement>;
  private readonly keycodeRef: React.RefObject<HTMLDivElement>;
  private readonly editorMainRef: React.RefObject<HTMLDivElement>;
  private resizeObserver: ResizeObserver | null = null;

  private updateZoom() {
    const main = this.editorMainRef.current;
    if (!main || !this.state.minWidth) return;
    const available = main.clientWidth - 8;
    const zoom = Math.max(
      0.3,
      Math.min(this.state.scale, available / this.state.minWidth)
    );
    if (Math.abs(zoom - this.state.zoom) > 0.01) this.setState({ zoom });
  }

  constructor(props: RemapPropType | Readonly<RemapPropType>) {
    super(props);
    this.keyboardWrapperRef = React.createRef();
    this.keycodeRef = React.createRef();
    this.state = {
      minWidth: 0,
      view: 'keymap',
      zoom: DEFAULT_KEYBOARD_SCALE,
      scale: DEFAULT_KEYBOARD_SCALE,
    };
    this.editorMainRef = React.createRef();
  }

  // Other parts of the editor open a screen (see openEditorView).
  private unsubscribeView: (() => void) | null = null;

  private setScale(scale: number) {
    saveKeyboardScale(scale);
    this.setState({ scale, zoom: scale }, () => this.updateZoom());
  }

  componentDidMount() {
    const scale = loadKeyboardScale();
    if (scale !== this.state.scale) {
      this.setState({ scale, zoom: scale }, () => this.updateZoom());
    }
    this.unsubscribeView = subscribeEditorView(() =>
      this.setState({ view: getEditorView() })
    );
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.updateZoom());
      if (this.editorMainRef.current) {
        this.resizeObserver.observe(this.editorMainRef.current);
      }
    }
  }

  componentWillUnmount() {
    this.unsubscribeView?.();
    this.resizeObserver?.disconnect();
  }

  componentDidUpdate(prevProps: RemapPropType) {
    if (this.props.keyboardWidth != prevProps.keyboardWidth) {
      this.setState(
        {
          minWidth: this.props.keyboardWidth! + MIN_SIDE_MENU_WIDTH * 2,
        },
        () => this.updateZoom()
      );
    }
  }

  private availableViews(): ConfigureView[] {
    return EDITOR_VIEWS;
  }

  private onEditLayer(layer: number) {
    this.props.selectLayer!(layer);
    this.setState({ view: 'keymap' });
  }

  render() {
    const views = this.availableViews();
    const view = views.includes(this.state.view) ? this.state.view : 'keymap';
    return (
      <React.Fragment>
        <div className="editor-layout">
          <EditorSidebar />
          <div className="editor-main" ref={this.editorMainRef}>
            {!this.props.macroKey && <LayerBar />}
            <SplitBanner />
            <FlashBackupBanner />
            {!this.props.macroKey && (
              <div
                className="keyboard-scale"
                role="group"
                aria-label={t('Keyboard size')}
              >
                {KEYBOARD_SCALES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={this.state.scale === s.value ? 'selected' : ''}
                    aria-pressed={this.state.scale === s.value}
                    title={`${t('Keyboard size')}: ${Math.round(
                      s.value * 100
                    )}%`}
                    onClick={() => this.setScale(s.value)}
                  >
                    {t(`keyboardScale.${s.label}`)}
                  </button>
                ))}
              </div>
            )}
            <div
              className="keyboard-wrapper"
              style={{
                minWidth: this.state.minWidth,
                // CSS zoom keeps the layout (and the popovers' positions)
                // consistent, unlike a transform.
                zoom: this.state.zoom,
              }}
              ref={this.keyboardWrapperRef}
            >
              <EditMode mode={this.props.macroKey ? 'macro' : 'keymap'} />
            </div>

            {/* Settings below the keyboard, in tabs (Conductor Studio style) */}
            <section className="editor-panel">
              <div className="editor-tabs" role="tablist">
                {views.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    className={['editor-tab', view === v ? 'selected' : '']
                      .join(' ')
                      .trim()}
                    onClick={() => this.setState({ view: v })}
                  >
                    <EditorViewIcon view={v} className="editor-tab-icon" />
                    <span>{editorViewLabel(v)}</span>
                  </button>
                ))}
              </div>
              <div className="editor-tab-panel" role="tabpanel">
                {view === 'keymap' ? (
                  <React.Fragment>
                    <KeyInspector />
                    <div className="keycode" ref={this.keycodeRef}>
                      <Keycodes />
                    </div>
                  </React.Fragment>
                ) : view === 'combos' ? (
                  <Combos />
                ) : view === 'knobs' ? (
                  <KnobTab />
                ) : (
                  <PointingSettings
                    mode={view as any}
                    onEditLayer={this.onEditLayer.bind(this)}
                  />
                )}
              </div>
            </section>
          </div>
        </div>
        <EditorFooter />
        {view === 'keymap' && <Desc value={this.props.hoverKey} />}
      </React.Fragment>
    );
  }
}

export function KnobTab() {
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  return <KnobPanel keyboard={keyboard} />;
}

export function SplitBanner() {
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  return <SplitFirmwareBanner keyboard={keyboard} />;
}

type EditModeType = {
  mode: 'keymap' | 'macro';
};
export function EditMode(props: EditModeType) {
  if (props.mode === 'keymap') {
    return (
      <div className="keymap">
        <Keymap />
      </div>
    );
  } else if (props.mode === 'macro') {
    return (
      <div className="macro">
        <MacroEditor />
      </div>
    );
  } else {
    return <div></div>;
  }
}

type DescType = {
  value: Key | null | undefined;
};
export function Desc(props: DescType) {
  if (!props.value) return <div></div>;
  if (props.value.keymap.isAny) return <div className="keycode-desc">Any</div>;
  if (props.value.keymap.keycodeInfo) {
    const info = props.value.keymap.keycodeInfo!;
    const isAscii = props.value.keymap.isAscii;
    const code = info.code;
    const hex = hexadecimal(code);
    const categories = kinds2CategoryLabel(props.value.keymap.kinds);
    const desc = props.value.keymap.desc
      ? ': ' + localizedKeycodeDesc(props.value.keymap.desc)
      : '';
    const keycodeName = props.value.keymap.keycodeInfo.name.long;
    const label = isAscii ? `ASCII(${keycodeName})` : keycodeName;
    return (
      <div className="keycode-desc">
        <div className="keycode-desc-label">
          {`/${categories}/${props.value.label}${desc}`}
        </div>
        <div className="keycode-desc-detail">{`${label} | ${hex}(${code})`}</div>
      </div>
    );
  } else {
    return <div></div>;
  }
}
