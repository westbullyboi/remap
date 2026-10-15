import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { t } from 'i18next';
import { IKeyboard, IKeymap } from '../../../services/hid/Hid';
import { RootState } from '../../../store/state';
import { AppActions } from '../../../actions/actions';
import KeyboardModel from '../../../models/KeyboardModel';
import { KeycodeList } from '../../../services/hid/KeycodeList';
import { genKey } from '../keycodekey/KeyGen';
import Keycodes from '../keycodes/Keycodes.container';
import { layerName, useLayerMeta } from '../../../services/layers/LayerMeta';
import { knobKeycodeIds } from '../../../services/pointing/EdgeKnob';
import { CAP_KNOB_PRESS_TURN } from '../../../services/pointing/PointingSettings';
import {
  PairSelect,
  SaveChip,
  UpdateNotice,
  useEdgeKnob,
} from './EdgeKnobShared';
import { edgeKnobPreview } from '../../../services/pointing/EdgeKnobPreview';
import { KnobExtraRows, KnobOptionsCard, useKnobExtras } from './KnobExtras';
import {
  KNOB_MODES,
  KNOB_REVISION,
} from '../../../services/pointing/KnobExtras';

// Knobs tab: what turning does, without and while pushing the knob.
export function KnobPanel(props: { keyboard: IKeyboard | null }) {
  const { supported, values, saveState, write } = useEdgeKnob(
    props.keyboard,
    CAP_KNOB_PRESS_TURN
  );
  const turn = useKnobTurn();
  const extras = useKnobExtras(props.keyboard);
  // Turning (pushed = 0) or push and turn (1) of knob k sends other things
  // than keys (switch windows, layers, desktops): the keys set here are not
  // used then.
  const modeOf = (k: number, pushed: number) =>
    extras.extras?.modes[k]?.[pushed] ?? 0;
  // Picking keys for turning means "send these keys": back to that mode.
  const useKeys = (k: number, pushed: number) => {
    const e = extras.extras;
    if (!e || modeOf(k, pushed) === 0) return;
    const modes = e.modes.map((m) => m.slice());
    modes[k][pushed] = 0;
    extras.change({ ...e, modes });
  };
  // The knob actions (firmware r32+), listed with the key patterns.
  const actionProps = (k: number, pushed: number) => {
    const e = extras.extras;
    const current = e ? modeOf(k, pushed) : 0;
    return {
      // Listed even when the firmware is older (disabled, with the
      // revision they need), so they can be found.
      actions: KNOB_MODES.filter((m) => m.value !== 0).map((m) => {
        const needs = m.revision ?? KNOB_REVISION;
        const tooOld = !e || (needs > extras.revision && m.value !== current);
        return {
          value: String(m.value),
          label:
            t(m.label) +
            (tooOld
              ? ` — ${
                  extras.supported === null
                    ? t('Reading from the keyboard...')
                    : t('needs firmware r{{revision}}', { revision: needs })
                }`
              : ''),
          disabled: tooOld,
        };
      }),
      action: current ? String(current) : null,
      onAction: (value: string) => {
        if (!e) return;
        const modes = e.modes.map((m) => m.slice());
        modes[k][pushed] = Number(value);
        extras.change({ ...e, modes });
      },
    };
  };
  // A direction whose key is being picked from the keycode palette.
  const [picking, setPicking] = useState<{
    encoderId: number;
    dir: number;
  } | null>(null);
  // Left and right (the firmware's push-and-turn knobs 0 and 1).
  const sides = turn.knobs.length === 1 ? [0] : [0, 1];
  return (
    <div className="pointing-settings knob-panel">
      <div className="pointing-title">
        <div className="pointing-title-text">
          <h1>{t('Knobs')}</h1>
          <span>
            {t(
              'Set what turning a knob does, and push and turn it for a second set of actions.'
            )}
          </span>
        </div>
        {values && (
          <div className="pointing-actions">
            <SaveChip
              state={saveState === 'saved' ? extras.saveState : saveState}
            />
          </div>
        )}
      </div>
      {supported === false && <UpdateNotice keyboard={props.keyboard} />}
      <div className="pointing-body">
        <div className="pointing-sections">
          {sides.map((k) => {
            const knob = turn.knobs[k];
            const name =
              sides.length === 2
                ? k === 0
                  ? t('Left knob')
                  : t('Right knob')
                : t('Knob');
            return (
              <section
                className="pointing-card"
                key={k}
                // The 3D keyboard zooms to the knob being edited.
                onMouseEnter={() => edgeKnobPreview.setKnob(k)}
                onFocus={() => edgeKnobPreview.setKnob(k)}
              >
                <div className="pointing-card-header">
                  <h2>
                    {name}
                    {knob?.pending && (
                      <span className="pointing-save-state busy" role="status">
                        {t('Not written yet')}
                      </span>
                    )}
                  </h2>
                  <span>
                    {t('Layer {{layer}}', { layer: turn.layerLabel })}
                  </span>
                </div>
                {knob && (
                  <div className="pointing-row">
                    <div className="pointing-row-label">
                      <span className="label">{t('Turn')}</span>
                      <span className="help">
                        {t(
                          'Without pushing. Written with "Write to keyboard"; each layer has its own (switch the layer at the top).'
                        )}
                      </span>
                    </div>
                    <div className="pointing-row-control">
                      <PairSelect
                        label={`${name} ${t('Turn')}`}
                        keycodes={knob.codes}
                        orientation="other"
                        directions={[t('Counter-clockwise'), t('Clockwise')]}
                        onChange={(kc) => {
                          turn.set(knob.encoderId, kc);
                          useKeys(k, 0);
                        }}
                        {...actionProps(k, 0)}
                      />
                      {turn.layerCount > 1 && (
                        <div className="knob-all-layers">
                          {turn.sameOnAllLayers(knob.encoderId) ? (
                            <span className="help">
                              {t('Same on all layers')}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="mx-btn mx-press"
                              onClick={() =>
                                turn.applyToAllLayers(knob.encoderId)
                              }
                            >
                              {t('Use on all layers')}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="knob-any-keys">
                        {[t('Counter-clockwise'), t('Clockwise')].map(
                          (dirName, dir) => {
                            const on =
                              picking?.encoderId === knob.encoderId &&
                              picking.dir === dir;
                            return (
                              <button
                                key={dir}
                                type="button"
                                className={`mx-btn mx-press${on ? ' on' : ''}`}
                                aria-pressed={on}
                                onClick={() =>
                                  setPicking(
                                    on
                                      ? null
                                      : { encoderId: knob.encoderId, dir }
                                  )
                                }
                              >
                                {dirName}: <b>{knob.labels[dir]}</b>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {knob && picking?.encoderId === knob.encoderId && (
                  <div className="knob-key-picker">
                    <p className="help">
                      {t('Pick a key for {{direction}}.', {
                        direction:
                          picking.dir === 1
                            ? t('Clockwise')
                            : t('Counter-clockwise'),
                      })}
                    </p>
                    <Keycodes
                      onPickKey={(picked) => {
                        turn.setOne(knob.encoderId, picking.dir, picked.keymap);
                        useKeys(k, 0);
                        setPicking(null);
                      }}
                    />
                  </div>
                )}
                {knob && (
                  <div className="pointing-row">
                    <div className="pointing-row-label">
                      <span className="label">{t('Push')}</span>
                      <span className="help">
                        {t(
                          'The key sent when you push the knob, set in the key settings.'
                        )}
                      </span>
                    </div>
                    <div className="pointing-row-control">
                      <button
                        type="button"
                        className="mx-btn mx-press"
                        onClick={() => edgeKnobPreview.editPushKey(k)}
                      >
                        {t('Change the push key')}
                      </button>
                    </div>
                  </div>
                )}
                <div className="pointing-row">
                  <div className="pointing-row-label">
                    <span className="label">{t('Push and turn')}</span>
                    <span className="help">
                      {t('Saved in the keyboard at once, on every layer.')}
                    </span>
                  </div>
                  <div className="pointing-row-control">
                    {values ? (
                      <>
                        <PairSelect
                          label={`${name} ${t('Push and turn')}`}
                          keycodes={values.knobs[k]}
                          orientation="other"
                          directions={[t('Counter-clockwise'), t('Clockwise')]}
                          onChange={(kc) => {
                            const knobs = values.knobs.slice();
                            knobs[k] = kc;
                            const [a, b] = knobKeycodeIds(k);
                            write({ ...values, knobs }, [
                              [a, kc[0], 2],
                              [b, kc[1], 2],
                            ]);
                            useKeys(k, 1);
                          }}
                          {...actionProps(k, 1)}
                        />
                      </>
                    ) : (
                      <span className="pointing-checking">
                        {supported === null
                          ? t('Reading from the keyboard...')
                          : t('Needs newer firmware')}
                      </span>
                    )}
                  </div>
                </div>
                <KnobExtraRows
                  knob={k}
                  name={name}
                  extras={extras}
                  keyboard={props.keyboard}
                />
              </section>
            );
          })}
          <KnobOptionsCard extras={extras} />
          <section className="pointing-card">
            <div className="pointing-card-header">
              <h2>{t('How pushing works')}</h2>
            </div>
            <p className="knob-note">
              {t(
                'When a knob has push-and-turn actions, its push key is sent when you release it, and only if you did not turn the knob. Layer keys and other hold keys on the push still act when pressed.'
              )}
            </p>
            <p className="knob-note">
              {t(
                'Drag a knob on the 3D keyboard sideways to try it. Hold Shift to push and turn.'
              )}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

type KnobTurn = {
  encoderId: number;
  // [counter-clockwise, clockwise] on the selected layer, with the changes
  // not yet written.
  codes: [number, number];
  // Key labels of the two directions.
  labels: [string, string];
  original: [IKeymap | undefined, IKeymap | undefined];
  pending: boolean;
};

// The knobs' keycodes for turning (the encoder keymap of the selected
// layer), left knob first. Changes wait for "Write to keyboard" like the
// keys' do.
function useKnobTurn() {
  const dispatch = useDispatch();
  const keymap = useSelector(
    (s: RootState) => s.entities.keyboardDefinition?.layouts.keymap
  );
  const options = useSelector(
    (s: RootState) => s.configure.layoutOptions.selectedOptions
  );
  const layer = useSelector((s: RootState) => s.configure.keymap.selectedLayer);
  const encodersKeymaps = useSelector(
    (s: RootState) => s.entities.device.encodersKeymaps
  );
  const encodersRemaps = useSelector((s: RootState) => s.app.encodersRemaps);
  const labelLang = useSelector((s: RootState) => s.app.labelLang);
  const customKeycodes = useSelector(
    (s: RootState) => s.entities.keyboardDefinition?.customKeycodes
  );
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  const layerMeta = useLayerMeta(keyboard?.getInformation());

  const encoderIds = useMemo(() => {
    if (!keymap) return [];
    const seen = new Set<number>();
    return new KeyboardModel(keymap)
      .getKeymap(options)
      .keymaps.filter((m) => m.encoderId !== null && !m.isDecal)
      .sort((a, b) => a.x - b.x)
      .map((m) => m.encoderId!)
      .filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  }, [keymap, options]);

  const label = (keymap?: IKeymap) =>
    keymap ? genKey(keymap, labelLang).label.replace(/\n/g, ' ') || '—' : '—';
  const knobs: KnobTurn[] = encoderIds
    .filter((id) => encodersKeymaps[layer]?.[id])
    .map((id) => {
      const current = encodersKeymaps[layer][id];
      const remapped = encodersRemaps[layer]?.[id];
      const ccw = remapped?.counterclockwise || current.counterclockwise;
      const cw = remapped?.clockwise || current.clockwise;
      return {
        encoderId: id,
        codes: [ccw?.code ?? 0, cw?.code ?? 0],
        labels: [label(ccw), label(cw)],
        original: [current.counterclockwise, current.clockwise],
        pending: !!(remapped?.counterclockwise || remapped?.clockwise),
      };
    });

  // One direction (0 counter-clockwise, 1 clockwise) to a keymap, on the
  // selected layer or another one.
  const setOne = (
    encoderId: number,
    dir: number,
    keymap: IKeymap,
    onLayer = layer
  ) => {
    const current = encodersKeymaps[onLayer]?.[encoderId];
    if (!current) return;
    const op = dir === 1 ? 'cw' : 'ccw';
    const remapped = encodersRemaps[onLayer]?.[encoderId];
    const original = dir === 1 ? current.clockwise : current.counterclockwise;
    if (original && original.code === keymap.code) {
      if (dir === 1 ? remapped?.clockwise : remapped?.counterclockwise) {
        dispatch(AppActions.encodersRemapsRemoveKey(onLayer, encoderId, op));
      }
      return;
    }
    dispatch(AppActions.encodersRemapsSetKey(onLayer, encoderId, keymap, op));
  };
  // The selected layer's turning keys to every layer.
  const applyToAllLayers = (encoderId: number) => {
    const current = encodersKeymaps[layer]?.[encoderId];
    const remapped = encodersRemaps[layer]?.[encoderId];
    const ccw = remapped?.counterclockwise || current?.counterclockwise;
    const cw = remapped?.clockwise || current?.clockwise;
    for (let l = 0; l < encodersKeymaps.length; l++) {
      if (l === layer) continue;
      if (ccw) setOne(encoderId, 0, ccw, l);
      if (cw) setOne(encoderId, 1, cw, l);
    }
  };
  // Whether every layer turns the same as the selected one.
  const sameOnAllLayers = (encoderId: number) => {
    const code = (l: number, dir: number) => {
      const r = encodersRemaps[l]?.[encoderId];
      const c = encodersKeymaps[l]?.[encoderId];
      return dir === 1
        ? (r?.clockwise || c?.clockwise)?.code
        : (r?.counterclockwise || c?.counterclockwise)?.code;
    };
    return encodersKeymaps.every(
      (_, l) => code(l, 0) === code(layer, 0) && code(l, 1) === code(layer, 1)
    );
  };
  const set = (encoderId: number, codes: [number, number]) => {
    codes.forEach((code, dir) =>
      setOne(
        encoderId,
        dir,
        KeycodeList.getKeymap(code, labelLang, customKeycodes)
      )
    );
  };

  return {
    knobs,
    set,
    setOne,
    applyToAllLayers,
    sameOnAllLayers,
    layerCount: encodersKeymaps.length,
    layerLabel: `${layer} · ${layerName(layerMeta, layer)}`,
  };
}
