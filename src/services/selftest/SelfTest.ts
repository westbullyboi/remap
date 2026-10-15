import { IKeyboard, IKeymap } from '../hid/Hid';
import {
  fetchFirmwareRevision,
  LATEST_FIRMWARE_REVISION,
  probeProtocol,
} from '../pointing/PointingSettings';
import { decodeSplitInfo } from '../split/SplitFirmware';
import {
  DETECTED_OS,
  OS_ACTIVE_ID,
  OS_DETECTED_ID,
  OS_ENABLED_ID,
} from '../pointing/OsProfiles';
import {
  fetchMirrorStatus,
  fetchMotionStats,
  MirrorState,
} from '../pointing/SplitMirror';

// Self test of the Matrix firmware features: what the keyboard reports
// (read with the editor's VIA custom values), and a checklist of things to
// try on the keyboard, with a text report to send.

export type CheckStatus = 'ok' | 'warn' | 'old' | 'error';

export type FirmwareCheck = {
  id: string;
  label: string;
  // Revision the feature came with.
  revision: number;
  status: CheckStatus;
  // Untranslated detail, with values for i18next.
  detail: string;
  values?: { [k: string]: string | number };
};

type Read = (
  id: number,
  length: 1 | 2 | 4
) => Promise<{ value: number; bytes: Uint8Array } | 'old' | 'error'>;

function reader(keyboard: IKeyboard): Read {
  return async (id, length) => {
    const r = await keyboard.fetchCustomValue(id, length);
    if (!r.success) return 'error';
    if (r.unhandled || r.value === undefined) return 'old';
    return { value: r.value, bytes: r.bytes || new Uint8Array(0) };
  };
}

export const MIRROR_STATE_NAMES: { [s: number]: string } = {
  [MirrorState.Off]: 'Not copied (off)',
  [MirrorState.Alone]: 'The other half is not connected',
  [MirrorState.Copying]: 'Copying',
  [MirrorState.Same]: 'The same on both halves',
  [MirrorState.Ask]: 'Both halves changed: choose which to keep',
  [MirrorState.OtherBuild]: 'The other half runs a different build',
  [MirrorState.Stuck]: 'Copied twice and still different: stopped',
};

const TP_MODE_NAMES: { [v: number]: string } = {
  0: 'Normal (cursor)',
  1: 'Scroll',
  2: 'Scroll up / down only',
  10: 'Scroll left / right only',
  3: 'Zoom (up / down)',
  4: 'Arrow keys',
  5: 'Volume (up / down)',
  6: 'Switch tabs (left / right)',
  7: 'Undo / redo (left / right)',
  8: 'Page up / down',
  9: 'Slow cursor (precision mode speed)',
};

export function touchpadModeName(value: number): string {
  return TP_MODE_NAMES[value] ?? `#${value}`;
}

export type FirmwareReport = {
  checks: FirmwareCheck[];
  revision: number;
  // Touchpad mode actions (0xAA-0xAC), for the checklist.
  touchpadModes: number[] | null;
  // The OS the keyboard detected (index into DETECTED_OS), -1 unknown.
  detectedOs: number;
  // Window key shortcuts [key][0 PC / 1 Mac], null on older firmware.
  windowKeys: number[][] | null;
};

export async function runFirmwareChecks(
  keyboard: IKeyboard
): Promise<FirmwareReport> {
  const read = reader(keyboard);
  const checks: FirmwareCheck[] = [];
  const report: FirmwareReport = {
    checks,
    revision: 0,
    touchpadModes: null,
    detectedOs: -1,
    windowKeys: null,
  };

  const protocol = await probeProtocol(keyboard);
  if (protocol !== 'supported') {
    checks.push({
      id: 'protocol',
      label: 'Matrix firmware',
      revision: 0,
      status: protocol === 'error' ? 'error' : 'old',
      detail:
        protocol === 'error'
          ? 'Could not read from the keyboard.'
          : 'This keyboard does not run the Matrix firmware.',
    });
    return report;
  }

  const revision = await fetchFirmwareRevision(keyboard);
  report.revision = revision;
  checks.push({
    id: 'revision',
    label: 'Firmware revision',
    revision: 0,
    status: revision >= LATEST_FIRMWARE_REVISION ? 'ok' : 'old',
    detail:
      revision >= LATEST_FIRMWARE_REVISION
        ? 'r{{revision}} (latest)'
        : 'r{{revision}}: the latest is r{{latest}}',
    values: { revision, latest: LATEST_FIRMWARE_REVISION },
  });

  // Both halves: same revision and build.
  const split = await read(0x7d, 1);
  if (typeof split === 'string') {
    checks.push(failed('split', 'Both halves', 11, split));
  } else {
    const s = decodeSplitInfo(split.bytes, revision);
    const detail: { [k: string]: [CheckStatus, string] } = {
      match: ['ok', 'Both halves run r{{revision}}, the same build'],
      checking: ['warn', 'Still checking the other half'],
      disconnected: ['warn', 'The other half is not connected'],
      peerOutdated: ['old', 'The other half runs old firmware (r10 or older)'],
      revisionMismatch: [
        'old',
        'The other half runs r{{peer}}: write the same firmware to both halves',
      ],
      buildMismatch: [
        'warn',
        'Same revision, different builds: write the same file to both halves',
      ],
      unknown: ['warn', 'Unknown'],
    };
    const [status, text] = detail[s.kind];
    checks.push({
      id: 'split',
      label: 'Both halves',
      revision: 11,
      status,
      detail: text,
      values: {
        revision,
        peer: s.kind === 'revisionMismatch' ? s.peerRevision : '',
      },
    });
  }

  // r22: settings per OS.
  const osOn = await read(OS_ENABLED_ID, 1);
  if (typeof osOn === 'string') {
    checks.push(failed('os', 'Windows / Mac settings', 22, osOn));
  } else {
    const detected = await read(OS_DETECTED_ID, 1);
    const active = await read(OS_ACTIVE_ID, 1);
    const d = typeof detected === 'string' ? -1 : detected.value;
    report.detectedOs = d;
    const a = typeof active === 'string' ? 0 : active.value;
    checks.push({
      id: 'os',
      label: 'Windows / Mac settings',
      revision: 22,
      status: d > 0 ? 'ok' : 'warn',
      detail: osOn.value
        ? 'Connected OS: {{os}}; using the {{set}} settings'
        : 'Connected OS: {{os}}; separate settings are off',
      values: {
        os: DETECTED_OS[d] || DETECTED_OS[0],
        set: a === 1 ? 'Mac' : 'PC (Windows / Linux)',
      },
    });
  }

  // r24: same settings on both halves.
  const mirror = await fetchMirrorStatus(keyboard);
  if (mirror === null) {
    checks.push(failed('mirror', 'Same settings on both halves', 24, 'old'));
  } else {
    const okStates = [MirrorState.Same, MirrorState.Copying];
    checks.push({
      id: 'mirror',
      label: 'Same settings on both halves',
      revision: 24,
      status: okStates.includes(mirror.state) ? 'ok' : 'warn',
      detail: '{{state}} (USB on the {{side}} half)',
      values: {
        state: MIRROR_STATE_NAMES[mirror.state] ?? `#${mirror.state}`,
        side: mirror.usbSide,
      },
    });
  }

  // r28: touchpad movement from the other half.
  const motionRaw = await read(0xa9, 4);
  if (typeof motionRaw === 'string') {
    checks.push(failed('motion', 'Touchpad on the other half', 28, motionRaw));
  } else {
    const stats = await fetchMotionStats(keyboard);
    checks.push({
      id: 'motion',
      label: 'Touchpad on the other half',
      revision: 28,
      status: stats && stats.failed > stats.ok ? 'warn' : 'ok',
      detail: stats
        ? 'Last second: {{ok}} fetches, {{failed}} failed, {{frames}} sensor frames'
        : 'Touchpad on the USB half, or not touched in the last second',
      values: stats
        ? { ok: stats.ok, failed: stats.failed, frames: stats.frames }
        : {},
    });
  }

  // r30: touchpad modes and the edge bar.
  const modes: number[] = [];
  let modesFailed: 'old' | 'error' | null = null;
  for (const id of [0xaa, 0xab, 0xac]) {
    const r = await read(id, 1);
    if (typeof r === 'string') {
      modesFailed = r;
      break;
    }
    modes.push(r.value);
  }
  if (modesFailed) {
    checks.push(
      failed('tpModes', 'Touchpad while a key is held', 30, modesFailed)
    );
  } else {
    report.touchpadModes = modes;
    const bar = await read(0xae, 1);
    checks.push({
      id: 'tpModes',
      label: 'Touchpad while a key is held',
      revision: 30,
      status: 'ok',
      detail: 'TP1: {{m1}} / TP2: {{m2}} / TP3: {{m3}}; edge bar {{bar}}',
      values: {
        m1: touchpadModeName(modes[0]),
        m2: touchpadModeName(modes[1]),
        m3: touchpadModeName(modes[2]),
        bar: typeof bar !== 'string' && bar.value ? 'on' : 'off',
      },
    });
  }

  // r31: window keys.
  const windowKeys: number[][] = [];
  let keysFailed: 'old' | 'error' | null = null;
  for (let k = 0; k < 6 && !keysFailed; k++) {
    const pair: number[] = [];
    for (const os of [0, 1]) {
      const r = await read(0xb0 + k * 2 + os, 2);
      if (typeof r === 'string') {
        keysFailed = r;
        break;
      }
      pair.push(r.value);
    }
    windowKeys.push(pair);
  }
  if (keysFailed) {
    checks.push(failed('windowKeys', 'Window keys', 31, keysFailed));
  } else {
    report.windowKeys = windowKeys;
    checks.push({
      id: 'windowKeys',
      label: 'Window keys',
      revision: 31,
      status: 'ok',
      detail: '{{count}} of 6 keys have a shortcut',
      values: {
        count: windowKeys.filter((p) => p[0] || p[1]).length,
      },
    });
  }

  return report;
}

function failed(
  id: string,
  label: string,
  revision: number,
  why: 'old' | 'error'
): FirmwareCheck {
  return {
    id,
    label,
    revision,
    status: why,
    detail:
      why === 'old'
        ? 'Needs r{{revision}} or later'
        : 'Could not read from the keyboard.',
    values: { revision },
  };
}

// Matrix custom keys (QK_KB_n, keyboard definition customKeycodes).
export const QK_KB_0 = 0x7e00;
export const MATRIX_TEST_KEYS: { index: number; short: string }[] = [
  { index: 6, short: 'TP1' },
  { index: 7, short: 'TP1 TG' },
  { index: 8, short: 'TP2' },
  { index: 9, short: 'TP3' },
  { index: 10, short: 'Win ◧' },
  { index: 11, short: 'Win ◨' },
  { index: 12, short: 'Win ▣' },
  { index: 13, short: 'Win _' },
  { index: 14, short: 'Win ⇥' },
  { index: 15, short: 'Win ↺' },
];

// Where each custom key is on the keymap: index → layers it is on.
export function findCustomKeys(
  keymaps: { [pos: string]: IKeymap }[]
): Map<number, number[]> {
  const found = new Map<number, number[]>();
  keymaps.forEach((layer, l) => {
    Object.values(layer).forEach((km) => {
      const index = km.code - QK_KB_0;
      if (index < 0 || index > 31) return;
      const layers = found.get(index) || [];
      if (!layers.includes(l)) layers.push(l);
      found.set(index, layers);
    });
  });
  return found;
}

// --- Input monitor -----------------------------------------------------

export type InputEntry = { kind: string; text: string; count: number };

const MOD_NAMES: [keyof ModState, string][] = [
  ['metaKey', 'Win/⌘'],
  ['ctrlKey', 'Ctrl'],
  ['altKey', 'Alt'],
  ['shiftKey', 'Shift'],
];
type ModState = {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

function modPrefix(e: ModState): string {
  return MOD_NAMES.filter(([k]) => e[k])
    .map(([, n]) => `${n} + `)
    .join('');
}

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta', 'OS'];

// One line for a key press, or null for a modifier alone.
export function describeKey(e: ModState & { key: string }): string | null {
  if (MODIFIER_KEYS.includes(e.key)) return null;
  const key =
    e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return modPrefix(e) + key;
}

// One line for a wheel event: direction (and Ctrl = zoom).
export function describeWheel(
  e: ModState & { deltaX: number; deltaY: number }
): string | null {
  const ax = Math.abs(e.deltaX);
  const ay = Math.abs(e.deltaY);
  if (ax === 0 && ay === 0) return null;
  const dir = ay >= ax ? (e.deltaY > 0 ? '↓' : '↑') : e.deltaX > 0 ? '→' : '←';
  return modPrefix(e) + dir;
}

// Adds an entry, merging it with the last one when the same.
export function pushEntry(
  log: InputEntry[],
  kind: string,
  text: string,
  max = 8
): InputEntry[] {
  const last = log[0];
  if (last && last.kind === kind && last.text === text) {
    return [{ ...last, count: last.count + 1 }, ...log.slice(1)];
  }
  return [{ kind, text, count: 1 }, ...log].slice(0, max);
}

// --- Report ------------------------------------------------------------

export type ManualResult = 'ok' | 'ng' | '';

export function buildReport(params: {
  app: string;
  userAgent: string;
  firmware: FirmwareReport | null;
  translate: (s: string, v?: { [k: string]: string | number }) => string;
  manual: { label: string; result: ManualResult; note?: string }[];
}): string {
  const { firmware, translate } = params;
  const lines: string[] = ['Matrix self test', params.app];
  lines.push(`Browser: ${params.userAgent}`);
  lines.push('');
  lines.push('[Firmware]');
  if (!firmware) lines.push('(not read)');
  firmware?.checks.forEach((c) => {
    const mark = { ok: 'OK', warn: '!!', old: '--', error: 'ER' }[c.status];
    lines.push(
      `${mark} ${translate(c.label)}: ${translate(c.detail, translateValues(c.values, translate))}`
    );
  });
  lines.push('');
  lines.push('[Tried on the keyboard]');
  params.manual.forEach((m) => {
    const mark = m.result === 'ok' ? 'OK' : m.result === 'ng' ? 'NG' : '  ';
    lines.push(`${mark} ${m.label}${m.note ? ` — ${m.note}` : ''}`);
  });
  return lines.join('\n');
}

export function translateValues(
  values: { [k: string]: string | number } | undefined,
  translate: (s: string) => string
): { [k: string]: string | number } {
  const out: { [k: string]: string | number } = {};
  Object.entries(values || {}).forEach(([k, v]) => {
    out[k] = typeof v === 'string' && v ? translate(v) : v;
  });
  return out;
}
