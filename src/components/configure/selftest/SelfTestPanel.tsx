import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { t } from 'i18next';
import { RootState } from '../../../store/state';
import {
  buildReport,
  CheckStatus,
  describeKey,
  describeWheel,
  findCustomKeys,
  FirmwareReport,
  InputEntry,
  ManualResult,
  MATRIX_TEST_KEYS,
  pushEntry,
  runFirmwareChecks,
  touchpadModeName,
  translateValues,
} from '../../../services/selftest/SelfTest';
import { shortcutLabel, WINDOW_KEYS } from '../shell/WindowKeysCard';
import { firmwareFlasherStore } from '../firmware/firmwareFlasherStore';
import './SelfTestPanel.scss';

const RESULTS_KEY = 'matrix.selfTest.v1';

function loadResults(): { [id: string]: ManualResult } {
  try {
    const raw = window.localStorage.getItem(RESULTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveResults(results: { [id: string]: ManualResult }) {
  try {
    window.localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  } catch {
    // Not remembered; still shown for this session.
  }
}

const STATUS_MARK: { [s in CheckStatus]: string } = {
  ok: '✓',
  warn: '!',
  old: '–',
  error: '×',
};
const STATUS_LABEL: { [s in CheckStatus]: string } = {
  ok: 'OK',
  warn: 'Check',
  old: 'Not in this firmware',
  error: 'Read failed',
};

type ManualItem = {
  id: string;
  group: string;
  label: string;
  // Where the key is, or that it is missing from the keymap.
  where?: string;
  missing?: boolean;
};

const tr = (s: string, v?: { [k: string]: string | number }) =>
  t(s, v) as string;

// Self test: what the keyboard reports, things to try on the keyboard
// (with an input monitor showing what reaches the computer), and a text
// report of the results.
export default function SelfTestPanel() {
  const keyboard = useSelector((s: RootState) => s.entities.keyboard);
  const keymaps = useSelector((s: RootState) => s.entities.device.keymaps);
  const layerLabel = (l: number) => tr('Layer {{n}}', { n: l });

  const [firmware, setFirmware] = useState<FirmwareReport | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(loadResults);
  const [copied, setCopied] = useState<'' | 'ok' | 'failed'>('');
  const [report, setReport] = useState<string | null>(null);

  const run = async () => {
    if (!keyboard) return;
    setRunning(true);
    try {
      setFirmware(await runFirmwareChecks(keyboard));
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => {
    setFirmware(null);
    run();
  }, [keyboard]);

  const placed = useMemo(() => findCustomKeys(keymaps || []), [keymaps]);
  const mac = firmware?.detectedOs === 3 || firmware?.detectedOs === 4;

  const items: ManualItem[] = useMemo(() => {
    const where = (index: number) => {
      const layers = placed.get(index);
      return layers
        ? { where: layers.map(layerLabel).join(', ') }
        : {
            where: tr('Not on the keymap (Key Config > Custom)'),
            missing: true,
          };
    };
    const modes = firmware?.touchpadModes;
    const mode = (i: number) =>
      modes ? tr(touchpadModeName(modes[i])) : tr('(not read)');
    const list: ManualItem[] = [
      {
        id: 'tp1',
        group: 'r30',
        label: tr('Hold TP1 and move a finger on the touchpad: {{mode}}', {
          mode: mode(0),
        }),
        ...where(6),
      },
      {
        id: 'tp1tg',
        group: 'r30',
        label: tr(
          'Tap TP1 TG, move a finger (TP1 action), tap TP1 TG again (cursor again)'
        ),
        ...where(7),
      },
      {
        id: 'tp2',
        group: 'r30',
        label: tr('Hold TP2 and move a finger: {{mode}}', { mode: mode(1) }),
        ...where(8),
      },
      {
        id: 'tp3',
        group: 'r30',
        label: tr('Hold TP3 and move a finger: {{mode}}', { mode: mode(2) }),
        ...where(9),
      },
      {
        id: 'bar',
        group: 'r30',
        label: tr(
          'Slide a finger along an edge of the touchpad: the LEDs show a bar'
        ),
      },
    ];
    WINDOW_KEYS.forEach((k, i) => {
      const code = firmware?.windowKeys?.[i]?.[mac ? 1 : 0] ?? 0;
      list.push({
        id: `win${i}`,
        group: 'r31',
        label: tr('{{key}} ({{label}}): the window moves ({{shortcut}})', {
          key: k.short,
          label: tr(k.label),
          shortcut: firmware?.windowKeys
            ? shortcutLabel(code, mac)
            : tr('(not read)'),
        }),
        ...where(10 + i),
      });
    });
    const knobItems: [string, string][] = [
      [
        'knobAccel',
        'Turn a knob fast: it goes further than turning slowly (acceleration on)',
      ],
      ['knobHold', 'Hold a knob down: the hold key is sent'],
      ['knobDouble', 'Push a knob twice quickly: the double press key is sent'],
      [
        'knobWindows',
        'Knob set to switch windows: turning goes through the windows, resting picks one',
      ],
      [
        'knobLayers',
        'Knob set to select the layer: turning changes the layer and the LEDs show which',
      ],
      ['knobBar', 'Turn a knob: the LEDs show a bar for a moment'],
    ];
    knobItems.forEach(([id, text]) =>
      list.push({ id, group: 'r32', label: tr(text) })
    );
    list.push(
      {
        id: 'os',
        group: 'r22',
        label: tr(
          'Connect to a Windows PC and to a Mac: "Connected OS" above shows each'
        ),
      },
      {
        id: 'mirror',
        group: 'r24',
        label: tr(
          'Plug the USB cable into the left half: the keymap and settings are the same'
        ),
      },
      {
        id: 'leftpad',
        group: 'r29',
        label: tr(
          'With the USB cable on the left half: the touchpad moves the cursor without delay'
        ),
      }
    );
    return list;
  }, [firmware, placed, mac]);

  const setResult = (id: string, result: ManualResult) => {
    const next = { ...results, [id]: results[id] === result ? '' : result };
    setResults(next as { [id: string]: ManualResult });
    saveResults(next as { [id: string]: ManualResult });
  };

  const makeReport = () =>
    buildReport({
      app: window.location.host,
      userAgent: navigator.userAgent,
      firmware,
      translate: tr,
      manual: items.map((i) => ({
        label: `[${i.group}] ${i.label}`,
        result: results[i.id] || '',
        note: i.missing ? i.where : undefined,
      })),
    });

  const copyReport = async () => {
    const text = makeReport();
    setReport(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      // Clipboard blocked: the text is shown to copy by hand.
      setCopied('failed');
    }
  };

  if (!keyboard) {
    return <p className="mx-sub">{t('Connect the keyboard first.')}</p>;
  }

  const done = items.filter((i) => results[i.id]).length;
  const old = firmware?.checks.some((c) => c.status === 'old');

  return (
    <div className="selftest">
      <p className="mx-sub">
        {t(
          'Checks the Matrix features on this keyboard. Read the firmware below, try each item on the keyboard and mark it, then copy the report and send it.'
        )}
      </p>

      <section className="selftest-section">
        <div className="selftest-head">
          <h3>{t('What the keyboard reports')}</h3>
          <button
            type="button"
            className="mx-btn mx-press"
            disabled={running}
            onClick={run}
          >
            {running ? t('Reading...') : t('Read again')}
          </button>
        </div>
        {!firmware && (
          <p className="mx-sub">{t('Reading from the keyboard...')}</p>
        )}
        {firmware && (
          <ul className="selftest-checks">
            {firmware.checks.map((c) => (
              <li key={c.id} className={`selftest-check is-${c.status}`}>
                <span className="selftest-mark" aria-hidden="true">
                  {STATUS_MARK[c.status]}
                </span>
                <span className="selftest-check-body">
                  <b>
                    {t(c.label)}
                    {c.revision > 0 && (
                      <small className="selftest-rev">r{c.revision}</small>
                    )}
                  </b>
                  <span>{tr(c.detail, translateValues(c.values, tr))}</span>
                </span>
                <span className="selftest-status">
                  {t(STATUS_LABEL[c.status])}
                </span>
              </li>
            ))}
          </ul>
        )}
        {old && (
          <div className="selftest-update">
            <span>
              {t(
                'Some features need newer firmware. Write the latest firmware to both halves.'
              )}
            </span>
            <button
              type="button"
              className="mx-btn dark mx-press"
              onClick={() => firmwareFlasherStore.open(keyboard)}
            >
              {t('Write firmware')}
            </button>
          </div>
        )}
      </section>

      <section className="selftest-section">
        <h3>{t('Input monitor')}</h3>
        <p className="mx-sub">
          {t(
            'Click the box, then use the keyboard and the touchpad over it: it shows what reaches the computer (keys, scrolling, zoom...). Shortcuts the OS takes first (such as Win + arrows) do not show here: check that the window moves instead.'
          )}
        </p>
        <InputMonitor />
      </section>

      <section className="selftest-section">
        <div className="selftest-head">
          <h3>
            {t('Try on the keyboard')}{' '}
            <small className="selftest-count">
              {done} / {items.length}
            </small>
          </h3>
          <button
            type="button"
            className="mx-btn mx-press"
            onClick={() => {
              setResults({});
              saveResults({});
            }}
          >
            {t('Clear the marks')}
          </button>
        </div>
        <ul className="selftest-items">
          {items.map((item) => (
            <li key={item.id} className="selftest-item">
              <span className="selftest-rev">{item.group}</span>
              <span className="selftest-item-body">
                <span>{item.label}</span>
                {item.where && (
                  <small className={item.missing ? 'is-missing' : ''}>
                    {item.where}
                  </small>
                )}
              </span>
              <span className="selftest-result" role="group">
                <button
                  type="button"
                  className={`mx-press is-ok${
                    results[item.id] === 'ok' ? ' on' : ''
                  }`}
                  aria-pressed={results[item.id] === 'ok'}
                  onClick={() => setResult(item.id, 'ok')}
                >
                  {t('Works')}
                </button>
                <button
                  type="button"
                  className={`mx-press is-ng${
                    results[item.id] === 'ng' ? ' on' : ''
                  }`}
                  aria-pressed={results[item.id] === 'ng'}
                  onClick={() => setResult(item.id, 'ng')}
                >
                  {t('Does not')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="selftest-section">
        <div className="selftest-head">
          <h3>{t('Report')}</h3>
          <button
            type="button"
            className="mx-btn dark mx-press"
            onClick={copyReport}
          >
            {t('Copy the report')}
          </button>
        </div>
        {copied === 'ok' && (
          <p className="mx-sub">{t('Copied. Paste it in the chat.')}</p>
        )}
        {copied === 'failed' && (
          <p className="mx-sub">
            {t('Could not copy: select the text below and copy it.')}
          </p>
        )}
        {report && (
          <textarea
            className="selftest-report"
            readOnly
            value={report}
            rows={12}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
      </section>
    </div>
  );
}

// Shows the keys, wheel and pointer input that reach the page while the
// box is focused / under the pointer.
function InputMonitor() {
  const box = useRef<HTMLDivElement | null>(null);
  const [log, setLog] = useState<InputEntry[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Not passive: keeps the page from scrolling or zooming (Ctrl + wheel).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const text = describeWheel(e);
      if (text) setLog((l) => pushEntry(l, 'wheel', text));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="selftest-monitor-wrap">
      <div
        ref={box}
        className={`selftest-monitor${focused ? ' on' : ''}`}
        tabIndex={0}
        role="log"
        aria-label={t('Input monitor')}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Tab') return;
          e.preventDefault();
          const text = describeKey(e);
          if (text) setLog((l) => pushEntry(l, 'key', text));
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          setLog((l) => pushEntry(l, 'move', 'cursor'));
        }}
        onPointerDown={(e) => {
          const buttons = [
            'Left button',
            'Middle button',
            'Right button',
            'Back button',
            'Forward button',
          ];
          const name = buttons[e.button];
          setLog((l) =>
            pushEntry(l, 'click', name ? tr(name) : `#${e.button}`)
          );
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {log.length === 0 ? (
          <span className="selftest-monitor-empty">
            {focused ? t('Waiting for input...') : t('Click here to start')}
          </span>
        ) : (
          <ol>
            {log.map((entry, i) => (
              <li key={log.length - i} className={`is-${entry.kind}`}>
                <span className="selftest-kind">
                  {t(
                    {
                      key: 'Key',
                      wheel: 'Scroll / zoom',
                      move: 'Cursor',
                      click: 'Click',
                    }[entry.kind] || entry.kind
                  )}
                </span>
                <b>{entry.kind === 'move' ? t('Moved') : entry.text}</b>
                {entry.count > 1 && (
                  <span className="selftest-times">×{entry.count}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
      <button
        type="button"
        className="mx-btn mx-press"
        onClick={() => setLog([])}
      >
        {t('Clear')}
      </button>
    </div>
  );
}
