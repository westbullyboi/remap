import { useSyncExternalStore } from 'react';

// Which editor layout is shown while a keyboard is open. Matrix shows only
// the new layout ('shell'). The classic one ('classic') is used only when
// the 3D keyboard cannot be drawn in this browser (no WebGL), for the rest
// of the session; it is never remembered or chosen from the URL.
export type UiLayout = 'classic' | 'shell';

const LEGACY_STORAGE_KEY = 'matrix.uiLayout';

const listeners = new Set<() => void>();
let current: UiLayout = 'shell';

// Forget a layout chosen before the classic one was retired.
try {
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
} catch {
  // Storage blocked: nothing stored either.
}

export function getUiLayout(): UiLayout {
  return current;
}

// The 3D keyboard cannot be shown: fall back to the classic editor.
export function fallBackToClassicLayout(): void {
  if (current === 'classic') return;
  current = 'classic';
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUiLayout(): UiLayout {
  return useSyncExternalStore(subscribe, getUiLayout);
}

// For tests: back to the new layout.
export function resetUiLayoutForTest(): void {
  current = 'shell';
}
