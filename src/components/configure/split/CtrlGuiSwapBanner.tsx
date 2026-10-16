import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { t } from 'i18next';
import { RootState } from '../../../store/state';
import {
  CtrlGuiSwap,
  fetchCtrlGuiSwap,
  turnCtrlGuiSwapOff,
} from '../../../services/pointing/CtrlGuiSwap';
import './SplitFirmwareStatus.scss';

const POLL_MS = 5000;

// Says when the keyboard swaps Ctrl with Win / Cmd (keys set to Win then
// send Ctrl), why, and turns it off.
export default function CtrlGuiSwapBanner() {
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  const [swap, setSwap] = useState<CtrlGuiSwap | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSwap(null);
    if (!keyboard) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const s = await fetchCtrlGuiSwap(keyboard).catch(() => null);
      if (stopped) return;
      setSwap(s);
      timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [keyboard]);

  if (!keyboard || !swap || !swap.swapped) return null;
  const reasons: string[] = [];
  if (swap.byOsSetting) {
    reasons.push(
      t('"Swap Ctrl and Cmd (Win)" is on for the {{set}} settings', {
        set: swap.activeSet === 1 ? 'Mac' : t('PC (Windows / Linux)'),
      })
    );
  }
  if (swap.bySavedSetting) {
    reasons.push(
      t(
        "the keyboard's own setting is on (saved in the keyboard, e.g. by a CG_SWAP key)"
      )
    );
  }

  const turnOff = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await turnCtrlGuiSwapOff(keyboard, swap);
    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setSwap(await fetchCtrlGuiSwap(keyboard).catch(() => null));
  };

  return (
    <div className="split-firmware-banner" role="alert">
      <span>
        {t(
          'Ctrl and Win / Cmd are swapped on this keyboard: keys set to Win send Ctrl (and Ctrl sends Win).'
        )}{' '}
        {reasons.length > 0 &&
          t('Because {{reasons}}.', { reasons: reasons.join(t(', and ')) })}
        {failed && ` ${t('Could not change it. Try again.')}`}
      </span>
      <button type="button" disabled={busy} onClick={turnOff}>
        {t('Stop swapping')}
      </button>
    </div>
  );
}
