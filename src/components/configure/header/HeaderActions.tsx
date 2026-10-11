/* eslint-disable no-undef */
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { t } from 'i18next';
import { RootState } from '../../../store/state';
import { AppActions, NotificationActions } from '../../../actions/actions';
import { hidActionsThunk } from '../../../actions/hid.action';
import { KeyboardLabelLang } from '../../../services/labellang/KeyLabelLangs';
import { Remaps, RemapsHistory } from '../../../services/history/RemapsHistory';
import {
  buildKeymapFile,
  keymapFileToRemaps,
  parseKeymapFile,
} from '../../../services/keymapfile/KeymapFile';
import {
  replaceLayerMeta,
  useLayerMeta,
} from '../../../services/layers/LayerMeta';

const history = new RemapsHistory();

// Undo / Redo, US/JIS, Export / Import (Conductor Studio style header).
export default function HeaderActions() {
  const store = useStore<RootState>();
  const dispatch = useDispatch<any>();
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  const remaps = useSelector((s: RootState) => s.app.remaps);
  const remapsBaseline = useSelector((s: RootState) => s.app.remapsBaseline);
  const labelLang = useSelector((s: RootState) => s.app.labelLang);
  const info = keyboard?.getInformation();
  const layerMeta = useLayerMeta(info);
  const [, forceRender] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  // A different keyboard, or remaps re-initialised from the device (connect,
  // flash, reset keymap, new definition), starts a fresh history. Declared
  // before the observer so that the re-initialisation is not recorded as an
  // undoable change.
  useEffect(() => {
    history.reset(store.getState().app.remaps as Remaps);
    forceRender((n) => n + 1);
  }, [keyboard, remapsBaseline]);
  // Record every change of the pending remaps.
  useEffect(() => {
    history.observe(remaps as Remaps);
    forceRender((n) => n + 1);
  }, [remaps]);

  if (!keyboard) return null;

  const restore = (snapshot: Remaps | null) => {
    // Never restore a snapshot with another layer count (it would leave
    // layers without remaps).
    if (snapshot && snapshot.length === store.getState().app.remaps.length) {
      dispatch(AppActions.remapsSetKeys(snapshot));
    }
  };

  const setLang = (lang: KeyboardLabelLang) => {
    dispatch(AppActions.updateLangLabel(lang));
    dispatch(hidActionsThunk.updateKeymaps(lang));
  };

  const onExport = () => {
    const state = store.getState();
    const file = buildKeymapFile(
      {
        name: info!.productName,
        vendorId: info!.vendorId,
        productId: info!.productId,
      },
      state.entities.device.keymaps,
      state.app.remaps,
      layerMeta
    );
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${info!.productName || 'keymap'}.matrix-keymap.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const state = store.getState();
      const parsed = parseKeymapFile(await file.text());
      const result = keymapFileToRemaps(
        parsed,
        state.entities.device.keymaps,
        state.app.labelLang,
        state.entities.keyboardDefinition?.customKeycodes
      );
      dispatch(AppActions.remapsSetKeys(result.remaps));
      if (parsed.layerMeta) replaceLayerMeta(info, parsed.layerMeta);
      dispatch(
        NotificationActions.addSuccess(
          `${t('Imported')}: ${result.changed} ${t('changes')}` +
            (result.skipped ? ` / ${result.skipped} ${t('skipped')}` : '') +
            ` — ${t('Press Flash to write them to the keyboard.')}`
        )
      );
    } catch (e: any) {
      dispatch(NotificationActions.addError(e?.message || String(e)));
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="header-actions">
      <div className="header-segment" role="group" aria-label={t('Key labels')}>
        {(
          [
            ['en-us', 'US'],
            ['ja-jp', 'JIS'],
          ] as [KeyboardLabelLang, string][]
        ).map(([lang, label]) => (
          <button
            key={lang}
            type="button"
            aria-pressed={labelLang === lang}
            onClick={() => setLang(lang)}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="header-icon-button"
        disabled={!history.canUndo()}
        onClick={() => restore(history.undo())}
        aria-label={t('Undo')}
        title={t('Undo')}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M8 5L4 9l4 4" />
          <path d="M4 9h7a5 5 0 010 10H9" />
        </svg>
      </button>
      <button
        type="button"
        className="header-icon-button"
        disabled={!history.canRedo()}
        onClick={() => restore(history.redo())}
        aria-label={t('Redo')}
        title={t('Redo')}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M12 5l4 4-4 4" />
          <path d="M16 9H9a5 5 0 000 10h2" />
        </svg>
      </button>
      <button
        type="button"
        className="header-text-button"
        onClick={() => importRef.current?.click()}
      >
        {t('Import')}
      </button>
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => onImport(e.target.files?.[0])}
      />
      <button type="button" className="header-pill-button" onClick={onExport}>
        {t('Export')}
      </button>
    </div>
  );
}
