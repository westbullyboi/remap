import { IKeymap } from '../../../services/hid/Hid';
import React from 'react';
import { t } from 'i18next';

export const LAYER_COLORS = [
  '#1a1a1d',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
  '#06b6d4',
  '#f97316',
];

export function layerColor(layer: number): string {
  return LAYER_COLORS[layer % LAYER_COLORS.length];
}

type LayerProps = {
  layerCount: number;
  selectedLayer: number;
  remaps: { [pos: string]: IKeymap }[];
  // eslint-disable-next-line no-unused-vars
  onClickLayer: (layer: number) => void;
};

export function Layer(props: LayerProps) {
  const layers = [...Array(props.layerCount)].map((_, i) => i);
  return (
    <div className="layer-wrapper">
      <div className="layer-panel-title">{t('LAYERS')}</div>
      <ul className="layer-list">
        {layers.map((layer) => {
          const hasChanges =
            props.remaps![layer] != undefined &&
            0 < Object.values(props.remaps![layer]).length;
          const selected = props.selectedLayer === layer;
          return (
            <li key={layer}>
              <button
                type="button"
                className={['layer-row', selected && 'selected'].join(' ')}
                onClick={() => {
                  props.onClickLayer(layer);
                }}
              >
                <span
                  className="layer-dot"
                  style={{ backgroundColor: layerColor(layer) }}
                />
                <span className="layer-number">{layer}</span>
                {hasChanges && <span className="layer-changed-dot" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
