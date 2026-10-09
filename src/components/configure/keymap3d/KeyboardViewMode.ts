// Whether Key Config shows the 3D or the 2D keyboard, remembered per
// browser. 3D is the default where WebGL works.

export type KeyboardViewMode = '2d' | '3d';

const STORAGE_KEY = 'matrix.keyboardView';

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function loadKeyboardViewMode(
  hasWebgl: boolean = webglAvailable()
): KeyboardViewMode {
  if (!hasWebgl) return '2d';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === '2d' || saved === '3d') return saved;
  } catch {
    // Storage blocked: use the default.
  }
  return '3d';
}

export function saveKeyboardViewMode(mode: KeyboardViewMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}
