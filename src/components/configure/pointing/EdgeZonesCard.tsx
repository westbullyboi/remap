import React from 'react';
import { Slider } from '@mui/material';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  CORNER_OPTIONS,
  CORNERS,
  cornerKeycodeId,
  EDGE_STEP_ID,
  EDGE_WIDTH_ID,
  edgeKeycodeIds,
  EDGES,
} from '../../../services/pointing/EdgeKnob';
import { CAP_EDGE_ZONES } from '../../../services/pointing/PointingSettings';
import { hexadecimal } from '../../../utils/StringUtils';
import {
  PairSelect,
  SaveChip,
  UpdateNotice,
  useEdgeKnob,
} from './EdgeKnobShared';
import {
  edgeKnobPreview,
  useEdgeKnobPreview,
} from '../../../services/pointing/EdgeKnobPreview';

export const EDGE_LABELS = [
  'Left edge',
  'Right edge',
  'Top edge',
  'Bottom edge',
];
export const CORNER_LABELS = [
  'Top-left corner',
  'Top-right corner',
  'Bottom-left corner',
  'Bottom-right corner',
];

// Touchpad tab: sliders on the pad's edges and taps in its corners.
export function EdgeZonesCard(props: { keyboard: IKeyboard }) {
  const { supported, values, saveState, write } = useEdgeKnob(
    props.keyboard,
    CAP_EDGE_ZONES
  );
  // Shared with the 3D keyboard: a zone picked on its touchpad opens here.
  const { zone } = useEdgeKnobPreview();
  const setZone = edgeKnobPreview.setZone;

  const header = (
    <div className="pointing-card-header">
      <h2>
        {t('Edge sliders and corner taps')}
        {values && <SaveChip state={saveState} />}
      </h2>
      <span>
        {t(
          'Slide one finger along an edge of the touchpad to change the volume, scroll, zoom and more; tap a corner for a shortcut. Touches that start elsewhere move the cursor as usual, and moving from an edge into the pad also moves the cursor.'
        )}
      </span>
    </div>
  );
  if (supported === false) {
    return (
      <section className="pointing-card edge-knob-card">
        {header}
        <UpdateNotice keyboard={props.keyboard} />
      </section>
    );
  }
  if (!values) {
    return (
      <section className="pointing-card edge-knob-card">
        {header}
        <p className="pointing-checking">{t('Reading from the keyboard...')}</p>
      </section>
    );
  }

  const edgeSet = (e: number) => values.edges[e][0] || values.edges[e][1];
  const zoneLabel =
    zone.kind === 'edge' ? EDGE_LABELS[zone.index] : CORNER_LABELS[zone.index];
  const w = values.edgeWidth;

  return (
    <section className="pointing-card edge-knob-card">
      {header}
      <div className="edge-zones">
        <div
          className="edge-pad"
          role="group"
          aria-label={t('Touchpad zones')}
          style={{ ['--edge' as string]: `${w}%` }}
        >
          {EDGES.map((name, e) => (
            <button
              key={name}
              type="button"
              className={[
                'edge-zone',
                `edge-${name}`,
                edgeSet(e) ? 'set' : '',
                zone.kind === 'edge' && zone.index === e ? 'selected' : '',
              ]
                .join(' ')
                .trim()}
              aria-label={t(EDGE_LABELS[e])}
              aria-pressed={zone.kind === 'edge' && zone.index === e}
              onClick={() => setZone({ kind: 'edge', index: e })}
            />
          ))}
          {CORNERS.map((name, c) => (
            <button
              key={name}
              type="button"
              className={[
                'edge-corner',
                `corner-${name}`,
                values.corners[c] ? 'set' : '',
                zone.kind === 'corner' && zone.index === c ? 'selected' : '',
              ]
                .join(' ')
                .trim()}
              aria-label={t(CORNER_LABELS[c])}
              aria-pressed={zone.kind === 'corner' && zone.index === c}
              onClick={() => setZone({ kind: 'corner', index: c })}
            />
          ))}
          <span className="edge-pad-center">{t('Cursor')}</span>
        </div>
        <div className="edge-zone-settings">
          <h3>{t(zoneLabel)}</h3>
          {zone.kind === 'edge' ? (
            <PairSelect
              label={t(zoneLabel)}
              keycodes={values.edges[zone.index]}
              orientation={zone.index < 2 ? 'sideEdge' : 'other'}
              directions={
                zone.index < 2
                  ? [t('Slide up'), t('Slide down')]
                  : [t('Slide left'), t('Slide right')]
              }
              onChange={(kc) => {
                const edges = values.edges.slice();
                edges[zone.index] = kc;
                const [a, b] = edgeKeycodeIds(zone.index);
                write({ ...values, edges }, [
                  [a, kc[0], 2],
                  [b, kc[1], 2],
                ]);
              }}
            />
          ) : (
            <select
              className="pointing-select"
              value={values.corners[zone.index]}
              aria-label={t(zoneLabel)}
              onChange={(e) => {
                const code = Number(e.target.value);
                const corners = values.corners.slice();
                corners[zone.index] = code;
                write({ ...values, corners }, [
                  [cornerKeycodeId(zone.index), code, 2],
                ]);
              }}
            >
              {!CORNER_OPTIONS.some(
                (o) => o.code === values.corners[zone.index]
              ) && (
                <option value={values.corners[zone.index]}>
                  {t('Custom')} ({hexadecimal(values.corners[zone.index], 4)})
                </option>
              )}
              {CORNER_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {t(o.label)}
                </option>
              ))}
            </select>
          )}
          <p className="help">
            {t('You can also click a zone on the 3D touchpad.')}{' '}
            {zone.kind === 'edge'
              ? t(
                  'A keycode is sent each time the finger moves the step distance along the edge.'
                )
              : t(
                  'Sent when you tap the corner (lift within 0.3 s without moving).'
                )}
          </p>
        </div>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Edge width')}</span>
          <span className="help">
            {t('How far from each side a touch counts as on the edge.')}
          </span>
        </div>
        <div className="pointing-row-control">
          <div className="pointing-range edge-knob-range">
            <Slider
              value={values.edgeWidth}
              min={5}
              max={30}
              size="small"
              aria-label={t('Edge width')}
              onChange={(_, v) =>
                write({ ...values, edgeWidth: v as number }, [
                  [EDGE_WIDTH_ID, v as number, 1],
                ])
              }
            />
            <span className="pointing-value">{values.edgeWidth}%</span>
          </div>
        </div>
      </div>
      <div className="pointing-row">
        <div className="pointing-row-label">
          <span className="label">{t('Step distance')}</span>
          <span className="help">
            {t('Distance along the edge for one keycode (smaller = faster).')}
          </span>
        </div>
        <div className="pointing-row-control">
          <div className="pointing-range edge-knob-range">
            <Slider
              value={values.edgeStep}
              min={2}
              max={25}
              size="small"
              aria-label={t('Step distance')}
              onChange={(_, v) =>
                write({ ...values, edgeStep: v as number }, [
                  [EDGE_STEP_ID, v as number, 1],
                ])
              }
            />
            <span className="pointing-value">{values.edgeStep}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
