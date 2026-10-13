import { useSyncExternalStore } from 'react';
import type { EdgeKnobValues } from './EdgeKnob';

// The touchpad's edge / corner zones and the knobs' push-and-turn actions
// as read from the keyboard, shared between the settings windows and the
// 3D keyboard (which draws them on the pad and around the knobs).

export type TouchpadZone =
  | { kind: 'edge'; index: number }
  | { kind: 'corner'; index: number };

export type EdgeKnobPreviewState = {
  values: EdgeKnobValues | null;
  // The zone being edited in the Touchpad settings.
  zone: TouchpadZone;
  // The knob shown up close in the Knobs settings: 0 left, 1 right.
  knob: number;
  // A request to edit a knob's push key in the key settings.
  editKey: { knob: number } | null;
};

let state: EdgeKnobPreviewState = {
  values: null,
  zone: { kind: 'edge', index: 1 },
  knob: 0,
  editKey: null,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const edgeKnobPreview = {
  get: () => state,
  setValues(values: EdgeKnobValues | null) {
    if (values === state.values) return;
    state = { ...state, values };
    emit();
  },
  setZone(zone: TouchpadZone) {
    state = { ...state, zone };
    emit();
  },
  editPushKey(knob: number) {
    state = { ...state, knob, editKey: { knob } };
    emit();
  },
  clearEditKey() {
    if (!state.editKey) return;
    state = { ...state, editKey: null };
    emit();
  },
  setKnob(knob: number) {
    if (knob === state.knob) return;
    state = { ...state, knob };
    emit();
  },
};

export function useEdgeKnobPreview(): EdgeKnobPreviewState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

export const sameZone = (a: TouchpadZone, b: TouchpadZone) =>
  a.kind === b.kind && a.index === b.index;

export type ZoneRect = {
  zone: TouchpadZone;
  // 0-1 across the pad (x to the right, y down).
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

// The zones on the pad for an edge width (% of the pad on each axis), as
// the firmware and the 2D settings divide it: edges between the corners,
// corners where two edges meet.
export function zoneRects(edgeWidth: number): ZoneRect[] {
  const e = Math.max(0, Math.min(50, edgeWidth)) / 100;
  return [
    { zone: { kind: 'edge', index: 0 }, x0: 0, y0: e, x1: e, y1: 1 - e },
    { zone: { kind: 'edge', index: 1 }, x0: 1 - e, y0: e, x1: 1, y1: 1 - e },
    { zone: { kind: 'edge', index: 2 }, x0: e, y0: 0, x1: 1 - e, y1: e },
    { zone: { kind: 'edge', index: 3 }, x0: e, y0: 1 - e, x1: 1 - e, y1: 1 },
    { zone: { kind: 'corner', index: 0 }, x0: 0, y0: 0, x1: e, y1: e },
    { zone: { kind: 'corner', index: 1 }, x0: 1 - e, y0: 0, x1: 1, y1: e },
    { zone: { kind: 'corner', index: 2 }, x0: 0, y0: 1 - e, x1: e, y1: 1 },
    { zone: { kind: 'corner', index: 3 }, x0: 1 - e, y0: 1 - e, x1: 1, y1: 1 },
  ];
}
