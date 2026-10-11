import { beforeEach } from 'vitest';
import {
  fallBackToClassicLayout,
  getUiLayout,
  resetUiLayoutForTest,
} from './UiLayout';

describe('UiLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetUiLayoutForTest();
  });

  test('only the new layout is shown', () => {
    expect(getUiLayout()).toBe('shell');
  });

  test('a layout remembered before is ignored', () => {
    window.localStorage.setItem('matrix.uiLayout', 'classic');
    expect(getUiLayout()).toBe('shell');
  });

  test('falls back to the classic editor only without 3D', () => {
    fallBackToClassicLayout();
    expect(getUiLayout()).toBe('classic');
    expect(window.localStorage.getItem('matrix.uiLayout')).toBeNull();
  });
});
