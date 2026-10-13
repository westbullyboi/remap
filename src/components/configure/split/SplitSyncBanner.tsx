import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { t } from 'i18next';
import { RootState } from '../../../store/state';
import {
  chooseMirrorSide,
  fetchMirrorStatus,
  MirrorState,
  MirrorStatus,
} from '../../../services/pointing/SplitMirror';
import { SplitFirmwareBanner } from './SplitFirmwareStatus';
import './SplitFirmwareStatus.scss';

const POLL_MS = 3000;

// The halves of a split keyboard keep the same settings (firmware r24+).
// When both were changed separately (right after updating), asks which
// half's settings to keep; shows the copying while it runs.
export default function SplitSyncBanner() {
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  const [status, setStatus] = useState<MirrorStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(null);
    if (!keyboard) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const s = await fetchMirrorStatus(keyboard).catch(() => null);
      if (stopped) return;
      setStatus(s);
      // Older firmware: no need to ask again.
      if (s) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [keyboard]);

  if (!keyboard || !status) return null;
  const usb = status.usbSide === 'left' ? t('left half') : t('right half');
  const other = status.usbSide === 'left' ? t('right half') : t('left half');

  if (status.state === MirrorState.Copying) {
    return (
      <div className="split-firmware-banner split-sync-banner" role="status">
        <span>
          {t('Copying the settings to the other half of the keyboard...')}
        </span>
      </div>
    );
  }
  if (status.state !== MirrorState.Ask) return null;

  const choose = async (keep: 'usb' | 'other') => {
    setBusy(true);
    await chooseMirrorSide(keyboard, keep);
    setBusy(false);
    setStatus({ ...status, state: MirrorState.Copying });
  };
  return (
    <div className="split-firmware-banner split-sync-banner" role="alert">
      <span>
        {t(
          'The left and right halves have different settings (keymap, macros, lighting, touchpad...). From now on both keep the same ones. Which half has the settings to keep? The USB cable is on the {{usb}}.',
          { usb }
        )}
      </span>
      <button type="button" disabled={busy} onClick={() => choose('other')}>
        {t('Keep the {{side}} settings', { side: other })}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => choose('usb')}
      >
        {t('Keep the {{side}} settings', { side: usb })}
      </button>
    </div>
  );
}

// The halves run different firmware (see SplitFirmwareStatus).
export function SplitFirmwareNotice() {
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  return <SplitFirmwareBanner keyboard={keyboard} />;
}
