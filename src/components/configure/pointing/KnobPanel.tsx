import React, { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { t } from 'i18next';
import { IKeyboard, IKeymap } from '../../../services/hid/Hid';
import { RootState } from '../../../store/state';
import { AppActions } from '../../../actions/actions';
import KeyboardModel from '../../../models/KeyboardModel';
import { KeycodeList } from '../../../services/hid/KeycodeList';
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

// Knobs tab: what turning does, without and while pushing the knob.
export function KnobPanel(props: { keyboard: IKeyboard | null }) {
  const { supported, values, saveState, write } = useEdgeKnob(
    props.keyboard,
    CAP_KNOB_PRESS_TURN
  );
  const turn = useKnobTurn();
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
            <SaveChip state={saveState} />
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
                        onChange={(kc) => turn.set(knob.encoderId, kc)}
                      />
                    </div>
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
                        }}
                      />
                    ) : (
                      <span className="pointing-checking">
                        {supported === null
                          ? t('Reading from the keyboard...')
                          : t('Needs newer firmware')}
                      </span>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
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
        original: [current.counterclockwise, current.clockwise],
        pending: !!(remapped?.counterclockwise || remapped?.clockwise),
      };
    });

  const set = (encoderId: number, codes: [number, number]) => {
    const knob = knobs.find((k) => k.encoderId === encoderId);
    if (!knob) return;
    const remapped = encodersRemaps[layer]?.[encoderId];
    (['ccw', 'cw'] as const).forEach((op, i) => {
      const original = knob.original[i];
      if (original && original.code === codes[i]) {
        const has =
          op === 'cw' ? remapped?.clockwise : remapped?.counterclockwise;
        if (has) {
          dispatch(AppActions.encodersRemapsRemoveKey(layer, encoderId, op));
        }
        return;
      }
      dispatch(
        AppActions.encodersRemapsSetKey(
          layer,
          encoderId,
          KeycodeList.getKeymap(codes[i], labelLang, customKeycodes),
          op
        )
      );
    });
  };

  return {
    knobs,
    set,
    layerLabel: `${layer} · ${layerName(layerMeta, layer)}`,
  };
}
