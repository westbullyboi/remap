globalThis.window={matchMedia:()=>({matches:false})};class DCLogic{setState(){}}

class Component extends DCLogic {
componentDidMount() {
this._onScroll = (e) => {
const t = e.target;
if (!t || !t.classList || !t.classList.contains('mx-main')) return;
const s = t.scrollTop > 8;
if (s !== !!(this.state && this.state.scrolled)) this.setState({ scrolled: s });
};
document.addEventListener('scroll', this._onScroll, true);
}
componentWillUnmount() {
document.removeEventListener('scroll', this._onScroll, true);
if (this._ro) this._ro.disconnect();
(this._timers || []).forEach((t) => clearTimeout(t));
clearTimeout(this._tt); clearTimeout(this._ts);
if (this._raf) cancelAnimationFrame(this._raf);
}
later(fn, ms) {
this._timers = this._timers || [];
const t = setTimeout(fn, ms);
this._timers.push(t);
return t;
}
showToast(msg) {
clearTimeout(this._tt);
this.setState({ toast: msg, toastN: ((this.state && this.state.toastN) || 0) + 1 });
this._tt = setTimeout(() => this.setState({ toast: null }), 3200);
}
renderVals() {
const st = this.state || {};
const ptr = st.ptr || null;
const gx = ptr ? ptr.x : 690;
const gy = ptr ? ptr.y : 40;
const glowBase = 'position: absolute; top: 0; left: 0; border-radius: 50%; pointer-events: none; will-change: transform; ';
const at = (w, h, dx, dy) => 'translate(' + Math.round(gx - w / 2 + dx) + 'px, ' + Math.round(gy - h / 2 + dy) + 'px)';
const open = st.open || null;
const toggle = (name) => () => this.setState({ open: open === name ? null : name });
const closeAll = () => this.setState({ open: null });
const dlg = !!open && open.indexOf('dlg-') === 0;
const sw = (on) => 'position: relative; width: 56px; height: 32px; border: none; border-radius: 16px; cursor: pointer; padding: 0; flex: none; transition: background-color 0.3s ease, transform 0.2s ease; background: ' + (on ? '#0e0e10' : '#d5d8de');
const knob = (on) => 'position: absolute; top: 4px; left: ' + (on ? '28px' : '4px') + '; width: 24px; height: 24px; border-radius: 12px; background: #ffffff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18); transition: left 0.42s cubic-bezier(0.34, 1.56, 0.64, 1)';
const pillCls = (on) => (on ? 'on' : '');
const autosave = (patch) => {
this.setState(Object.assign({ saving: true }, patch));
clearTimeout(this._ts);
this._ts = setTimeout(() => this.setState({ saving: false }), 700);
};
const R = {
slider: (label, value, min, max, step, text, help, onSet, off) => ({ isSlider: true, label, value, min, max, step, valueText: text, help: help || '', off: !!off, dim: off ? 'opacity: 0.45; transition: opacity 0.3s ease' : 'transition: opacity 0.3s ease', track: 'width: 100%; accent-color: #0e0e10', onChange: (e) => onSet(Number(e.target.value)) }),
sw: (label, on, help, onSet, off) => ({ isSwitch: true, label, on: !!on, help: help || '', off: !!off, dim: off ? 'opacity: 0.45; transition: opacity 0.3s ease' : 'transition: opacity 0.3s ease', swStyle: sw(!!on), knobStyle: knob(!!on), toggle: () => onSet(!on) }),
seg: (label, options, cur, help, onSet, off) => ({ isSeg: true, label, help: help || '', off: !!off, dim: off ? 'opacity: 0.45; transition: opacity 0.3s ease' : 'transition: opacity 0.3s ease', opts: options.map((o) => { const v = Array.isArray(o) ? o[0] : o; const l = Array.isArray(o) ? o[1] : o; return { label: l, on: v === cur, cls: v === cur ? 'on' : '', off: !!off, style: '', pick: () => onSet(v) }; }) }),
select: (label, groups, cur, help, onSet, off) => ({ isSelect: true, label, value: cur, help: help || '', off: !!off, dim: off ? 'opacity: 0.45; transition: opacity 0.3s ease' : 'transition: opacity 0.3s ease', groups: groups.map(([g, opts]) => ({ label: g, opts })), onChange: (e) => onSet(e.target.value) }),
swatches: (label, options, cur, help, onSet, off) => ({ isSwatches: true, label, help: help || '', off: !!off, dim: off ? 'opacity: 0.45; transition: opacity 0.3s ease' : 'transition: opacity 0.3s ease', valueText: (options.find((o) => o[0] === cur) || [0, ''])[1], opts: options.map(([v, l, color]) => ({ label: l, on: v === cur, off: !!off, pick: () => onSet(v), style: 'width: 34px; height: 34px; border-radius: 17px; cursor: pointer; padding: 0; transition: transform 0.2s ease; ' + (color ? 'background: ' + color : 'background: conic-gradient(#e5484d, #f5d90a, #30a46c, #05a2c2, #3e63dd, #d6409f, #e5484d)') + '; border: ' + (v === cur ? '3px solid #0e0e10' : '2px solid #ffffff') + '; box-shadow: 0 0 0 1px #d5d8de' })) }),
note: (text) => ({ isNote: true, help: text, dim: '' }),
button: (label, onClick) => ({ isButton: true, label, onClick, dim: '' })
};
const card = (title, sub, rows, extra) => Object.assign({ title, sub: sub || '', rows, hasBadge: false, badge: '', style: '', rowsStyle: 'display: flex; flex-direction: column; gap: 16px' }, extra || {});
const rowsGrid = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px 28px';
const ptabs = (key, list, def) => { const cur = st[key] || def; return { cur, tabs: list.map(([id, label]) => ({ label, on: cur === id, pick: () => this.setState({ [key]: id }) })) }; };
const C = {
glowStyle: glowBase + 'width: 1300px; height: 900px; background: radial-gradient(closest-side, rgba(70, 112, 210, 0.42), rgba(70, 112, 210, 0.16) 55%, rgba(70, 112, 210, 0) 100%); filter: blur(80px); transition: transform 1.6s cubic-bezier(0.2, 0.7, 0.2, 1); transform: ' + at(1300, 900, 0, -120),
glowStyle2: glowBase + 'width: 760px; height: 560px; background: radial-gradient(closest-side, rgba(130, 168, 245, 0.5), rgba(130, 168, 245, 0) 100%); filter: blur(64px); transition: transform 0.8s cubic-bezier(0.2, 0.7, 0.2, 1); transform: ' + at(760, 560, 0, 0),
glowStyle3: glowBase + 'width: 900px; height: 640px; background: radial-gradient(closest-side, rgba(160, 140, 235, 0.28), rgba(160, 140, 235, 0) 100%); filter: blur(90px); transition: transform 2.4s cubic-bezier(0.2, 0.7, 0.2, 1); transform: ' + at(900, 640, ptr ? (690 - gx) * 0.6 + 220 : 380, ptr ? (300 - gy) * 0.4 + 120 : 260),
onMove: (e) => {
if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
const el = e.currentTarget;
const r = el.getBoundingClientRect();
const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
this._ptr = { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this.setState({ ptr: this._ptr }); });
},
onLeave: () => this.setState({ ptr: null }),
closeAll, menuOpen: !!open && !dlg, dialogOpen: dlg,
hdrCls: st.scrolled ? 'scrolled' : '', miniCls: st.scrolled ? 'show' : '',
kbdOpen: open === 'kbd', toggleKbd: toggle('kbd'),
gearOpen: open === 'gear', toggleGear: toggle('gear'),
helpOpen: open === 'help', toggleHelp: toggle('help'),
onImport: (e) => { const f = e.target.files && e.target.files[0]; this.setState({ open: null }); if (f) this.showToast('Imported: ' + f.name); },
exportKeymap: () => { this.setState({ open: null }); this.showToast('matrix-split42.matrix-keymap.json を書き出しました'); },
hasToast: !!st.toast, toast: st.toast || '',
toastAnim: 'animation: ' + ((st.toastN || 0) % 2 ? 'mx-pop-a' : 'mx-pop-b') + ' 0.4s cubic-bezier(0.3, 0.7, 0.4, 1)',
saving: !!st.saving,
autoStatusText: st.saving ? 'キーボードに保存中…' : 'キーボードに保存済み（自動保存）',
autoStatusDot: 'width: 8px; height: 8px; border-radius: 4px; transition: background-color 0.3s ease; background: ' + (st.saving ? '#c08a1e' : '#1f8a55')
};

const DEF_SECTION = 'connect'; const DEF_SUB = 'kbd';
const section = st.section || DEF_SECTION;
const isConnect = section === 'connect', isFirmware = section === 'firmware';
const csub = st.csub || (DEF_SECTION === 'connect' && DEF_SUB) || 'kbd';
const secN = st.secN || 0, paneN = st.paneN || 0;
const winHide = !!st.winHide;
const go = (sec) => { if (sec === section) return; this.setState({ section: sec, secN: secN + 1, paneN: paneN + 1, winHide: false, winClosing: false, open: null }); };
const closeWin = () => { if (winHide || st.winClosing || st.flashing || st.phase === 'busy') return; this.setState({ winClosing: true }); this.later(() => this.setState({ winHide: true, winClosing: false }), 230); };

// connection: Connect starts unplugged; Firmware is reached from a connected session
const phase = st.phase || (st.connected ?? DEF_SECTION === 'firmware' ? 'done' : 'idle');
const connected = phase === 'done';
const DEVICES = [{ id: 'ms42', name: 'Matrix Split 42', note: 'USB でつながっています（左右とも検出）' }];
const dev = st.dev || null;
const deviceName = (DEVICES.find((d) => d.id === dev) || DEVICES[0]).name;
const connect = () => {
if (!dev) return;
this.setState({ phase: 'busy', powerN: (st.powerN || 0) + 1 });
this.later(() => { this.setState({ phase: 'done' }); this.showToast(deviceName + ' に接続しました'); }, 1700);
};

// firmware
const LATEST = 21;
const side = st.side || 'Left';
const file = st.file || null;
const flashing = !!st.flashing;
const prog = st.prog || 0;
const rev = st.rev || { Left: 19, Right: 19 };
const pickSide = (id) => () => { if (!isFirmware || flashing) return; this.setState({ side: id }); };
const flash = () => {
if (!file || flashing) return;
this.setState({ flashing: true, prog: 0 });
for (let i = 1; i <= 20; i++) this.later(() => this.setState({ prog: i / 20 }), i * 120);
this.later(() => { this.setState({ flashing: false, file: null, prog: 0, rebootN: (st.rebootN || 0) + 1, rev: Object.assign({}, rev, { [side]: LATEST }) }); this.showToast((side === 'Left' ? '左手側' : '右手側') + 'にファームウェアを書き込みました'); }, 2600);
};

// 3D keyboard geometry (same board as the Keys stage)
const P = [];
const stagL = [16, 16, 6, 0, 6, 10], stagR = [10, 6, 0, 6, 16, 16];
[['Tab', 'Ctrl', 'Shift'], ['Q', 'A', 'Z'], ['W', 'S', 'X'], ['E', 'D', 'C'], ['R', 'F', 'V'], ['T', 'G', 'B']].forEach((ks, c) => ks.forEach((id, r) => P.push({ id, side: 'Left', x: -370 + c * 60, y: -60 + r * 60 + stagL[c], w: 54 })));
[['Y', 'H', 'N'], ['U', 'J', 'M'], ['I', 'K', ','], ['O', 'L', '.'], ['P', ';', '/'], ['Bksp', "'", 'Esc']].forEach((ks, c) => ks.forEach((id, r) => P.push({ id, side: 'Right', x: 70 + c * 60, y: -60 + r * 60 + stagR[c], w: 54 })));
[['Alt', -190, 54], ['Lower', -130, 54], ['Space', -56, 84]].forEach(([id, x, w]) => P.push({ id, side: 'Left', x, y: 142, w }));
[['Enter', 56, 84], ['Raise', 130, 54], ['GUI', 190, 54]].forEach(([id, x, w]) => P.push({ id, side: 'Right', x, y: 142, w }));
const PAD = { x: 250, y: -215, w: 180, h: 118 };
const stW = st.sw || 1200, stH = st.sh || 560;
const narrow = stW < 820;
const fit = Math.max(0.42, Math.min(stW * 0.9 / 840, stH * 0.82 / 370));
const winOn = !winHide && !st.winClosing;
const wideW = Math.min(520, stW * 0.46, stW - 32);
const sideW = Math.max(240, stW - wideW - 48);
const sideLeft = narrow ? 50 : (stW - wideW - 32) / 2 / stW * 100;
const sideFit = narrow ? Math.min(stW * 0.9 / 840, stH * 0.34 / 370) : Math.max(0.36, Math.min(sideW * 0.94 / 840, stH * 0.8 / 370));
const s0 = winOn ? sideFit : fit * 0.9, left0 = winOn ? sideLeft : 50, top0 = winOn && narrow ? 20 : 52;
let cam = { s: s0 * (connected ? 1 : 0.94), a: connected ? 40 : 52, x: 0, y: -40, left: left0, top: top0 };
if (isFirmware) cam = { s: s0 * 1.18, a: 42, x: side === 'Left' ? -170 : 170, y: -40, left: left0, top: top0 };

const order = (k) => (k.side === 'Left' ? (k.x + 400) : (k.x - 40)) / 380;
const caps = P.map((k, i) => {
const mine = isFirmware && k.side === side;
const lit = mine && flashing && order(k) <= prog;
const cls = (connected ? '' : 'ghost') + (isFirmware && !mine ? ' fdim' : '') + (lit ? ' flashk' : '');
return {
label: connected ? k.id : '',
cls,
style: 'left: ' + (k.x - k.w / 2) + 'px; top: ' + (k.y - 27) + 'px; width: ' + k.w + 'px; font-size: ' + (k.id.length > 4 ? 10 : 12) + 'px; --i: ' + i + '; --o: ' + order(k).toFixed(2),
pick: k.side === 'Left' ? pickSide('Left') : pickSide('Right')
};
});
const sidesOut = (id) => (isFirmware && side !== id ? 'fdim' : '') + (isFirmware && side === id ? ' fsel' : '');
const pct = Math.round(prog * 100);

return Object.assign(C, {
isConnect, isFirmware, connected, notConnected: !connected,
bigTabs: [['connect', 'Connect'], ['firmware', 'Firmware']].map(([id, label]) => ({ label, cls: section === id ? 'cur' : '', ac: section === id ? 'page' : 'false', pick: () => go(id) })),
subTabs: isConnect ? [['kbd', 'Keyboards'], ['defs', 'Saved definitions']].map(([id, label]) => ({ label, isLink: false, isBtn: true, href: '', cls: csub === id ? 'cur' : '', ac: csub === id ? 'page' : 'false', pick: () => { if (csub !== id) this.setState({ csub: id, paneN: paneN + 1, winHide: false }); } })) : [{ label: 'Write firmware', isLink: false, isBtn: true, href: '', cls: 'cur', ac: 'page', pick: () => this.setState({ winHide: false }) }],
subLabel: (isConnect ? 'Connect' : 'Firmware') + ' のページ',
subAnim: 'animation: ' + (secN % 2 ? 'mx-sub-a' : 'mx-sub-b') + ' 0.55s cubic-bezier(0.2, 0.8, 0.2, 1)',
connDot: 'width: 8px; height: 8px; border-radius: 4px; background: ' + (phase === 'busy' ? '#c08a1e' : '#8f9197'), connText: phase === 'busy' ? 'Connecting…' : 'Not connected',
langOpen: open === 'lang', toggleLang: toggle('lang'), langLabel: (st.lang || 'ja') === 'ja' ? '日本語' : 'English',
langs: [['ja', '日本語'], ['en', 'English']].map(([id, label]) => ({ label, on: (st.lang || 'ja') === id, style: 'font-weight: ' + ((st.lang || 'ja') === id ? 700 : 500), pick: () => this.setState({ lang: id, open: null }) })),
acctOpen: open === 'acct', toggleAcct: toggle('acct'), signedIn: !!st.signedIn, signedOut: !st.signedIn,
acctBtn: st.signedIn ? 'background: #3d6fd6' : '',
signIn: () => { this.setState({ signedIn: true, open: null }); this.showToast('ログインしました'); },
signOut: () => { this.setState({ signedIn: false, open: null }); this.showToast('ログアウトしました'); },

stageCls: (phase === 'busy' ? 'powering ' : '') + (connected && st.powerN ? 'powered' : ''),
camStyle: 'left: ' + cam.left.toFixed(2) + '%; top: ' + cam.top + '%; transform: scale(' + cam.s.toFixed(3) + ') rotateX(' + cam.a + 'deg) translate(' + (-cam.x) + 'px, ' + (-cam.y) + 'px)',
rigCls: (connected ? '' : 'idle') + ((st.rebootN || 0) ? ' reboot-' + ((st.rebootN || 0) % 2 ? 'a' : 'b') : ''),
halfLCls: sidesOut('Left'), halfRCls: sidesOut('Right'), halfLStyle: 'left: -416px; top: -114px; width: 410px; height: 304px; border: none; padding: 0; cursor: ' + (isFirmware && !flashing ? 'pointer' : 'default'),
halfRStyle: 'left: 6px; top: -300px; width: 410px; height: 490px; border: none; padding: 0; cursor: ' + (isFirmware && !flashing ? 'pointer' : 'default'),
pickLeft: pickSide('Left'), pickRight: pickSide('Right'),
padCls: (connected ? '' : 'ghost') + (isFirmware && side !== 'Right' ? ' fdim' : ''),
padStyle: 'left: ' + (PAD.x - PAD.w / 2) + 'px; top: ' + (PAD.y - PAD.h / 2) + 'px; width: ' + PAD.w + 'px; height: ' + PAD.h + 'px; cursor: default',
knobs3d: [['Left', -362], ['Right', 362]].map(([sd, x]) => ({ cls: isFirmware && side !== sd ? 'fdim' : '', style: 'left: ' + (x - 26) + 'px; top: 124px; transform: translateZ(14px)' })),
caps,
stageRef: (el) => {
if (!el || this._ro) return;
this._ro = new ResizeObserver((entries) => {
const r = entries[0].contentRect;
const cur = this.state || {};
if (Math.abs((cur.sw || 0) - r.width) > 4 || Math.abs((cur.sh || 0) - r.height) > 4) this.setState({ sw: Math.round(r.width), sh: Math.round(r.height) });
});
this._ro.observe(el);
},
chipStyle: 'height: 34px; border-radius: 17px; gap: 8px; font-size: 13px; font-weight: 600; color: #0e0e10; animation: ' + (secN % 2 ? 'mx-chip-a' : 'mx-chip-b') + ' 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
chipDot: 'width: 10px; height: 10px; border-radius: 5px; flex: none; transition: background-color 0.4s ease; background: ' + (connected ? '#1f8a55' : (phase === 'busy' ? '#c08a1e' : '#b5b8be')),
chipTitle: isFirmware ? (side === 'Left' ? 'Left half' : 'Right half') : (connected ? deviceName : 'No keyboard'),
chipSub: isFirmware ? 'r' + rev[side] + (rev[side] < LATEST ? ' → r' + LATEST + ' に更新できます' : ' · 最新') : (connected ? '接続済み・左右とも' : (phase === 'busy' ? '接続中…' : 'USB でつないでください')),
flashChip: flashing, flashPct: (side === 'Left' ? '左手側' : '右手側') + 'に書き込み中 ' + pct + '%',
hintText: isFirmware ? (flashing ? '書き込み中はケーブルを抜かないでください' : '本体を押すと、書き込む側を選べます') : (connected ? 'キーボードの準備ができました' : 'つなぐとキーボードが点灯します'),
hintStyle: 'height: 32px; animation: ' + (secN % 2 ? 'mx-chip-a' : 'mx-chip-b') + ' 0.5s ease',
reopenOn: winHide && !st.winClosing, reopenLabel: isFirmware ? 'Firmware settings' : 'Connect', reopen: () => this.setState({ winHide: false }),

closeWin, winOpen: !winHide, winCls: st.winClosing ? 'out' : '',
winStyle: st.winClosing ? '' : 'animation-name: ' + (secN % 2 ? 'mx-win' : 'mx-win2'),
winTitle: isFirmware ? 'Write firmware' : (csub === 'defs' ? 'Saved definitions' : 'Keyboards'),
winSub: isFirmware ? '.uf2 ファイルを左右それぞれに書き込みます。書き込み中はケーブルを抜かないでください。' : (csub === 'defs' ? 'このブラウザに保存されたキーボード定義です。' : 'Remap は WebHID でキーボードと直接通信します。'),
winIcon: 'width: 44px; height: 44px; border-radius: 14px; flex: none; background: linear-gradient(150deg, #2f3137, #1b1c20); transition: box-shadow 0.5s ease; box-shadow: inset 0 0 0 2px ' + (connected ? '#1f8a55' : '#8f9197') + (flashing ? ', 0 0 18px rgba(122, 162, 255, 0.6)' : ''),
paneAnim: 'animation: ' + (paneN % 2 ? 'mx-pin-a' : 'mx-pin-b') + ' 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)',
paneConnect: isConnect && csub === 'kbd', paneDefs: isConnect && csub === 'defs', paneFw: isFirmware,
phaseIdle: phase === 'idle', phasePick: phase === 'pick', phaseBusy: phase === 'busy', phaseDone: phase === 'done',
openPicker: () => this.setState({ phase: 'pick', dev: null, section: 'connect', csub: 'kbd', winHide: false, open: null, paneN: paneN + 1, secN: isConnect ? secN : secN + 1 }),
cancelPick: () => this.setState({ phase: 'idle', paneN: paneN + 1 }),
devices: DEVICES.map((d) => ({
name: d.name, note: d.note, on: dev === d.id, pick: () => this.setState({ dev: d.id }),
style: 'display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 14px 16px; border-radius: 16px; cursor: pointer; background: ' + (dev === d.id ? '#ffffff' : 'rgba(255, 255, 255, 0.6)') + '; border: ' + (dev === d.id ? '1.5px solid #0e0e10' : '1px solid #e1e3e8'),
radio: 'width: 18px; height: 18px; border-radius: 9px; box-sizing: border-box; flex: none; transition: border-width 0.2s ease; border: ' + (dev === d.id ? '6px solid #0e0e10' : '1.5px solid #b5b8be')
})),
noDevice: !dev, connect, deviceName,
connOff: phase === 'busy', connCls: phase === 'busy' ? 'idle' : '',
toFirmware: () => go('firmware'),
defText: st.def ? st.def + ' を読み込み済み' : 'Import .json',
noDefs: !(st.defs || [1]).length,
defs: (st.defs || [{ name: 'Matrix Split 42', meta: 'FEED:0000 · matrix-split42.json' }]).map((d, i, arr) => ({ name: d.name, meta: d.meta, remove: () => { this.setState({ defs: arr.filter((x, j) => j !== i) }); this.showToast(d.name + ' の定義を削除しました'); } })),
onDef: (e) => { const f = e.target.files && e.target.files[0]; if (f) { this.setState({ def: f.name, defs: (st.defs || [{ name: 'Matrix Split 42', meta: 'FEED:0000 · matrix-split42.json' }]).concat([{ name: f.name.replace(/\.json$/, ''), meta: f.name }]) }); this.showToast(f.name + ' を読み込みました'); } },

sides: [['Left', 'Left half'], ['Right', 'Right half']].map(([id, label]) => ({ label, on: side === id, cls: side === id ? 'on' : '', off: flashing, pick: pickSide(id) })),
fileLabel: file || '.uf2 ファイルを選択',
fileBox: 'position: relative; display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 8px 0 16px; border-radius: 16px; font-size: 14px; cursor: pointer; flex: none; transition: background-color 0.3s ease; ' + (file ? 'background: #ffffff; border: 1px solid #e1e3e8; color: #0e0e10' : 'background: rgba(255, 255, 255, 0.6); border: 1.5px dashed #c5c8ce; color: #4a4d54'),
onFile: (e) => { const f = e.target.files && e.target.files[0]; if (f) this.setState({ file: f.name }); },
flashing,
barStyle: 'height: 100%; border-radius: 4px; background: #0e0e10; transition: width 0.12s linear; width: ' + pct + '%',
versions: [{ k: 'Left half', v: 'r' + rev.Left, style: 'font-size: 15px; color: ' + (rev.Left < LATEST ? '#9a5310' : '#1f8a55') }, { k: 'Right half', v: 'r' + rev.Right, style: 'font-size: 15px; color: ' + (rev.Right < LATEST ? '#9a5310' : '#1f8a55') }, { k: 'Latest', v: 'r' + LATEST, style: 'font-size: 15px' }],
fwNote: rev.Left < LATEST || rev.Right < LATEST || rev.Left !== rev.Right,
fwNoteText: rev.Left !== rev.Right ? '左右のファームウェアが一致していません。もう片方にも同じファームウェアを書き込んでください。' : '最新の Matrix 対応版より古いため、一部の設定が反映されない可能性があります。',
fwNoteStyle: 'font-size: 12px; padding: 8px 12px; border-radius: 12px; flex: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ' + (rev.Left !== rev.Right ? 'background: #fbeae7; color: #8a2f24' : 'background: #fff4e0; color: #6a4a12'),
flash, pOff: !file || flashing, pCls: !file && !flashing ? 'idle' : '',
pLabel: flashing ? 'Flashing…' : 'Flash',
statusText: isFirmware ? (flashing ? (side === 'Left' ? '左手側' : '右手側') + 'に書き込み中… ' + pct + '%' : (file ? file + ' を選択中' : '.uf2 ファイルを選んでください')) : (connected ? deviceName + ' に接続済み' : (phase === 'busy' ? '接続中…' : 'キーボード未接続')),
statusDot: 'width: 8px; height: 8px; border-radius: 4px; transition: background-color 0.3s ease; background: ' + (isFirmware ? (flashing ? '#c08a1e' : (file ? '#3d6fd6' : '#8f9197')) : (connected ? '#1f8a55' : (phase === 'busy' ? '#c08a1e' : '#8f9197')))
});
}
}

const c=new Component();c.props={};c.state={};console.log(JSON.stringify(Object.keys(c.renderVals())));