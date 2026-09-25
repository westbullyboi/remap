import React from 'react';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import i18next from 'i18next';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomMenuDialog from './CustomMenuDialog';
import { parseCustomMenus } from '../../../services/hid/CustomMenu';
import { IKeyboard } from '../../../services/hid/Hid';

const menus = parseCustomMenus([
  {
    label: 'Touchpad',
    content: [
      {
        label: 'Pointer',
        content: [
          {
            label: 'Tap to click',
            type: 'toggle',
            content: ['id_touchpad_tap', 0, 1],
          },
          {
            showIf: '{id_touchpad_tap} == 1',
            label: 'Tap term',
            type: 'range',
            options: [0, 255],
            content: ['id_touchpad_tap_term', 0, 2],
          },
          {
            label: 'Scroll direction',
            type: 'dropdown',
            options: ['Normal', 'Reverse'],
            content: ['id_touchpad_scroll', 0, 3],
          },
        ],
      },
    ],
  },
]);

const createKeyboard = (values: { [valueId: number]: number[] }) => {
  const keyboard = {
    fetchCustomMenuValue: vi.fn(async (commandBytes: number[]) => {
      const value = values[commandBytes[1]];
      return value === undefined
        ? { success: false, unhandled: true }
        : { success: true, value };
    }),
    updateCustomMenuValue: vi.fn(async () => ({ success: true })),
    saveCustomMenu: vi.fn(async () => ({ success: true })),
  };
  return keyboard;
};

describe('CustomMenuDialog', () => {
  beforeAll(async () => {
    // Return the key itself as the translated text.
    await i18next.init({ lng: 'en', resources: {} });
  });

  test('loads values, applies showIf and updates a toggle', async () => {
    const keyboard = createKeyboard({ 1: [0], 2: [100], 3: [1] });
    const onError = vi.fn();
    render(
      <CustomMenuDialog
        open={true}
        onClose={() => {}}
        keyboard={keyboard as unknown as IKeyboard}
        menus={menus}
        onError={onError}
      />
    );

    await screen.findByText('Tap to click');
    expect(keyboard.fetchCustomMenuValue).toHaveBeenCalledTimes(3);
    expect(keyboard.fetchCustomMenuValue).toHaveBeenNthCalledWith(1, [0, 1]);
    // Hidden because tap is disabled.
    expect(screen.queryByText('Tap term')).toBeNull();
    expect(screen.getByText('Reverse')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox'));

    await waitFor(() => expect(keyboard.saveCustomMenu).toHaveBeenCalled());
    expect(keyboard.updateCustomMenuValue).toHaveBeenCalledWith([0, 1], [1]);
    expect(keyboard.saveCustomMenu).toHaveBeenCalledWith(0);
    expect(screen.getByText('Tap term')).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });

  test('shows unsupported controls', async () => {
    const keyboard = createKeyboard({ 1: [1], 2: [100] });
    render(
      <CustomMenuDialog
        open={true}
        onClose={() => {}}
        keyboard={keyboard as unknown as IKeyboard}
        menus={menus}
        onError={() => {}}
      />
    );

    await screen.findByText('Not supported by the keyboard firmware');
    expect(screen.getByText('Tap term')).toBeTruthy();
  });
});
