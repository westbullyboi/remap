import React from 'react';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import { knobKeycodeIds } from '../../../services/pointing/EdgeKnob';
import { CAP_KNOB_PRESS_TURN } from '../../../services/pointing/PointingSettings';
import {
  PairSelect,
  SaveChip,
  UpdateNotice,
  useEdgeKnob,
} from './EdgeKnobShared';
import { edgeKnobPreview } from '../../../services/pointing/EdgeKnobPreview';

// Knobs tab: what turning does while the knob is pushed.
export function KnobPanel(props: { keyboard: IKeyboard | null }) {
  const { supported, values, saveState, write } = useEdgeKnob(
    props.keyboard,
    CAP_KNOB_PRESS_TURN
  );
  return (
    <div className="pointing-settings knob-panel">
      <div className="pointing-title">
        <div className="pointing-title-text">
          <h1>{t('Knobs')}</h1>
          <span>
            {t(
              'Push and turn a knob for a second set of actions. Turning without pushing uses the keycodes set on the knob in Key Config.'
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
      {supported === null && (
        <p className="pointing-checking">{t('Reading from the keyboard...')}</p>
      )}
      {values && (
        <div className="pointing-body">
          <div className="pointing-sections">
            {[0, 1].map((k) => (
              <section
                className="pointing-card"
                key={k}
                // The 3D keyboard zooms to the knob being edited.
                onMouseEnter={() => edgeKnobPreview.setKnob(k)}
                onFocus={() => edgeKnobPreview.setKnob(k)}
              >
                <div className="pointing-card-header">
                  <h2>{k === 0 ? t('Left knob') : t('Right knob')}</h2>
                  <span>{t('While pushed')}</span>
                </div>
                <div className="pointing-row">
                  <div className="pointing-row-label">
                    <span className="label">{t('Push and turn')}</span>
                  </div>
                  <div className="pointing-row-control">
                    <PairSelect
                      label={k === 0 ? t('Left knob') : t('Right knob')}
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
                  </div>
                </div>
              </section>
            ))}
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
      )}
    </div>
  );
}
