import React, { useSyncExternalStore } from 'react';
import { t } from 'i18next';
import { PointingSettingsMode } from '../pointing/PointingSettings';

// Screens of the editor, shared by the classic tabs and the new rail.
export type ConfigureView =
  | 'keymap'
  | 'macros'
  | 'layers'
  | 'combos'
  | 'knobs'
  | PointingSettingsMode
  | 'leds';

// Touchpad / Mouse Layer are always listed; each screen checks whether the
// firmware supports them and offers a preview otherwise.
export const EDITOR_VIEWS: ConfigureView[] = [
  'keymap',
  'macros',
  'layers',
  'touchpad',
  'autoMouse',
  'timing',
  'combos',
  'knobs',
  'leds',
];

// The screen shown, shared by both layouts so that any part of the editor
// can open one (the LED chip of a layer, the touchpad on the keyboard).
let currentView: ConfigureView = 'keymap';
const viewListeners = new Set<() => void>();

export function getEditorView(): ConfigureView {
  return currentView;
}

export function openEditorView(view: ConfigureView): void {
  if (!EDITOR_VIEWS.includes(view)) return;
  currentView = view;
  viewListeners.forEach((l) => l());
}

export function subscribeEditorView(listener: () => void): () => void {
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
}

export function useEditorView(): ConfigureView {
  return useSyncExternalStore(subscribeEditorView, getEditorView);
}

export function editorViewLabel(view: ConfigureView): string {
  const labels: Record<ConfigureView, string> = {
    keymap: t('Key Config'),
    touchpad: t('Touchpad'),
    autoMouse: t('Mouse Layer'),
    timing: t('Timing & gestures'),
    combos: t('Combos'),
    knobs: t('Knobs'),
    leds: t('Layer LED colors'),
    macros: t('Macros'),
    layers: t('Layers'),
  };
  return labels[view];
}

// Small line icons of the screens.
export function EditorViewIcon(props: {
  view: ConfigureView;
  className?: string;
}) {
  const paths: Record<ConfigureView, string> = {
    keymap: 'M3 5h14v10H3zM6 8h1M9 8h1M12 8h1M6 11h8',
    touchpad: 'M4 4h12v12H4zM10 4v12',
    autoMouse:
      'M7 3h6a3 3 0 013 3v8a3 3 0 01-3 3H7a3 3 0 01-3-3V6a3 3 0 013-3zM10 3v5',
    timing: 'M10 4a6 6 0 110 12 6 6 0 010-12zM10 7v3l2 2',
    combos: 'M4 4h5v5H4zM11 11h5v5h-5zM9 6.5h4.5V11',
    knobs:
      'M10 4a6 6 0 110 12 6 6 0 010-12zM10 4v4M14.5 5.5l1.5-1.5M5.5 5.5L4 4',
    leds: 'M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.5 1.5M13.5 13.5L15 15M5 15l1.5-1.5M13.5 6.5L15 5M10 7a3 3 0 110 6 3 3 0 010-6z',
    macros: 'M4 4h5v5H4zM11 11h5v5h-5zM9 6.5h4.5V11',
    layers: 'M4 4h5v5H4zM11 11h5v5h-5zM9 6.5h4.5V11',
  };
  return (
    <svg
      className={props.className}
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[props.view]} />
    </svg>
  );
}

// Keycaps are drawn smaller than Remap's, like Conductor Studio's compact
// keyboard; the user picks the size, narrow screens shrink it further.
export const KEYBOARD_SCALES = [
  { value: 0.6, label: 'S' },
  { value: 0.7, label: 'M' },
  { value: 0.85, label: 'L' },
] as const;
export const DEFAULT_KEYBOARD_SCALE = 0.7;
const KEYBOARD_SCALE_STORAGE_KEY = 'matrix.keyboardScale';

export function loadKeyboardScale(): number {
  try {
    const v = Number(window.localStorage.getItem(KEYBOARD_SCALE_STORAGE_KEY));
    if (KEYBOARD_SCALES.some((s) => s.value === v)) return v;
  } catch {
    // Storage blocked: use the default.
  }
  return DEFAULT_KEYBOARD_SCALE;
}

export function saveKeyboardScale(scale: number): void {
  try {
    window.localStorage.setItem(KEYBOARD_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // Not remembered; still applied for this session.
  }
}
