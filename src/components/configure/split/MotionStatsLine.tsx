import React, { useEffect, useState } from 'react';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  fetchMotionStats,
  MotionStats,
} from '../../../services/pointing/SplitMirror';

// With the USB cable on the half without the touchpad: how the touchpad's
// movement gets across (fetches per second, failed ones, sensor frames),
// to tell a slow link from slow settings.
export default function MotionStatsLine(props: { keyboard: IKeyboard | null }) {
  const [stats, setStats] = useState<MotionStats | null>(null);
  useEffect(() => {
    const keyboard = props.keyboard;
    setStats(null);
    if (!keyboard) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const s = await fetchMotionStats(keyboard).catch(() => null);
      if (stopped) return;
      setStats(s);
      timer = setTimeout(poll, 1000);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [props.keyboard]);
  if (!stats) return null;
  const total = stats.ok + stats.failed;
  const failedPct = total ? Math.round((stats.failed * 100) / total) : 0;
  return (
    <p className="pointing-checking motion-stats" role="status">
      {t(
        'Touchpad on the other half: {{ok}} fetches per second, {{failed}}% failed, {{frames}} sensor frames per second (move a finger to see them).',
        { ok: stats.ok, failed: failedPct, frames: stats.frames }
      )}
    </p>
  );
}
