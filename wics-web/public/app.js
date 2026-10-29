// WICS web — status/map/camera/E-STOP over Terra.
// State and availability arrive by terra.events.v1 (WebSocket); sensor payloads are pulled per visible tab
// (Terra's relay carries no module streams, see docs/01-ros2-terra-boundary.md §5).
const $ = (s) => document.querySelector(s);
const state = { cfg: null, token: null, nodeId: null, ws: null, wsOk: false, status: null, node: null, modules: null, sviRes: [], tab: 'dash', estopLog: [], armed: 0 };
const SIGNALS = ['terra.nodes.liveness', 'terra.nodes.changed', 'terra.modules.changed', 'terra.svi.resources.changed', 'terra.node.signal'];

// ---------------------------------------------------------------- http
async function master(path, opts = {}) {
  const r = await fetch(state.cfg.masterUrl + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.token, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return (await r.json()).data;
}
function bridgeUrl(p) { return `${state.cfg.gatewayUrl}/api/nodes/${state.nodeId}/modules/${state.cfg.moduleId}/v1/${p}`; }
async function bridge(p, opts = {}) {
  const r = await fetch(bridgeUrl(p), { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.token } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(body?.error?.message || r.status); e.status = r.status; e.body = body; throw e; }
  return body;
}

// ---------------------------------------------------------------- login
$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#login-msg').textContent = '...';
  try {
    state.cfg = state.cfg || await (await fetch('/config.json')).json();
    const r = await fetch(state.cfg.masterUrl + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#email').value, password: $('#password').value }) });
    if (!r.ok) throw new Error('로그인 실패 (' + r.status + ')');
    state.token = (await r.json()).data.access_token;
    $('#password').value = '';
    $('#login').hidden = true; $('#app').hidden = false;
    await start();
  } catch (e) { $('#login-msg').textContent = e.message; }
});

async function start() {
  state.nodeId = state.cfg.nodeId || await discoverNode();
  connectEvents();
  await refreshControl();
  await refreshStatus();
  setInterval(() => { if (!state.wsOk || Date.now() - (state.lastStatusAt || 0) > 10000) refreshStatus(); }, state.cfg.fallbackMs || 3000); // events drive refreshes; 3s polling only as fallback, 10s as safety net
  setInterval(dataTick, 1000);
}

async function discoverNode() {
  const nodes = (await master('/api/v1/nodes')).nodes || [];
  for (const n of nodes) {
    try { if ((await master(`/api/v1/nodes/${n.node_id}/modules`)).modules.some((m) => m.id === state.cfg.moduleId)) return n.node_id; } catch { /* next */ }
  }
  throw new Error('rdk-bridge를 호스팅하는 노드가 없습니다');
}

// ---------------------------------------------------------------- terra.events.v1
let backoff = 1000;
function connectEvents() {
  const url = state.cfg.masterUrl.replace(/^http/, 'ws') + '/ws/events';
  const ws = new WebSocket(url);
  state.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', protocol: 'terra.events.v1', signals: SIGNALS, authorization: { scheme: 'Bearer', token: state.token } }));
  ws.onmessage = (m) => {
    const f = JSON.parse(m.data);
    if (f.type === 'subscribed') { state.wsOk = true; backoff = 1000; setPill('p-events', 'ok', '이벤트 연결'); logEvent('subscribed ' + SIGNALS.length + ' signals'); refreshControl(); refreshStatus(); }
    else if (f.type === 'event') { logEvent(`${f.event} ${JSON.stringify(f.data || {})}`); onEvent(f.event); }
    else if (f.type === 'error') logEvent('error ' + JSON.stringify(f));
  };
  ws.onclose = () => { state.wsOk = false; setPill('p-events', 'bad', '이벤트 끊김 · 폴링 폴백'); logEvent('closed; retry in ' + backoff + 'ms'); setTimeout(connectEvents, backoff); backoff = Math.min(backoff * 2, 10000); };
  ws.onerror = () => ws.close();
}
let evTimer = null;
function onEvent() { clearTimeout(evTimer); evTimer = setTimeout(() => { refreshControl(); refreshStatus(); }, 150); } // coalesce bursts
function logEvent(t) { const el = $('#event-log'); el.textContent = (new Date().toLocaleTimeString() + ' ' + t + '\n' + el.textContent).slice(0, 6000); }

// ---------------------------------------------------------------- control-plane view
async function refreshControl() {
  try {
    const [node, mods, res] = await Promise.all([
      master(`/api/v1/nodes/${state.nodeId}`), master(`/api/v1/nodes/${state.nodeId}/modules`),
      master(`/api/v1/svi/resources?node_id=${state.nodeId}`).catch(() => ({ items: [] })),
    ]);
    state.node = node; state.modules = mods.modules || []; state.sviRes = res.items || [];
  } catch (e) { logEvent('control refresh: ' + e.message); }
  renderPills(); renderDash();
}
async function refreshStatus() {
  try { state.status = await bridge('status'); state.statusErr = null; state.lastStatusAt = Date.now(); }
  catch (e) { state.status = null; state.statusErr = e.message; }
  renderPills(); renderDash();
}
function setPill(id, cls, text) { const p = $('#' + id); p.className = 'pill ' + cls; p.textContent = text; }
function renderPills() {
  const n = state.node;
  if (n) setPill('p-node', n.status === 'online' && n.relay_connected ? 'ok' : 'bad', '노드 ' + (n.status || '?'));
  const mod = (state.modules || []).find((m) => m.id === state.cfg.moduleId);
  const ok = mod && state.status;
  setPill('p-module', ok ? (state.status.mode === 'ok' ? 'ok' : 'warn') : 'bad', ok ? (state.status.mode === 'ok' ? '브리지 정상' : '브리지 일부 저하') : '브리지 응답 없음');
}
const stCls = (s) => 'st ' + s;
function renderDash() {
  const s = state.status, n = state.node;
  $('#chain-table').innerHTML = [
    ['브라우저 ↔ Tree 이벤트', state.wsOk ? '연결 (terra.events.v1)' : '끊김 → 3초 폴링 폴백'],
    ['로봇 노드', n ? `${n.display_name || n.node_id} · ${n.status} · relay ${n.relay_connected ? '연결' : '끊김'}` : '-'],
    ['rdk-bridge 모듈', (state.modules || []).some((m) => m.id === state.cfg.moduleId) ? '카탈로그 등재' : '카탈로그에 없음'],
    ['브리지 상태', s ? `${s.mode} · stage ${s.stage} · 가동 ${s.uptime_s}s` : (state.statusErr || '-')],
  ].map(([a, b]) => `<tr><td class="muted">${a}</td><td>${b}</td></tr>`).join('');
  $('#robot-info').textContent = s?.robot ? `모드 ${s.robot.mode} · 컨트롤러 ${s.robot.controller} · 배터리 ${s.robot.battery_pct}%` : '로봇 보고 없음(status 어댑터)';
  const cat = Object.fromEntries((state.sviRes || []).map((r) => [String(r.resource_id).split('.').pop(), r]));
  $('#res-table tbody').innerHTML = s ? Object.entries(s.resources).map(([k, v]) => {
    const c = cat[k];
    return `<tr><td>${k}</td><td class="${stCls(v.state)}">${v.state}</td><td>${v.age_ms < 0 ? '-' : (v.age_ms / 1000).toFixed(1) + 's'}</td><td>${v.hz}</td><td>${v.sequence}</td><td>${v.adapter_alive ? '실행 중' : '<span class="st down">중지</span>'}</td><td>${c ? c.status : '-'}</td></tr>`;
  }).join('') : '';
}

// ---------------------------------------------------------------- data pulls (only for the visible tab)
const inflight = new Set();
async function pull(key, fn) { if (inflight.has(key)) return; inflight.add(key); try { await fn(); } catch (e) { onPullError(key, e); } finally { inflight.delete(key); } }
let tickN = 0;
function dataTick() {
  tickN++;
  if (state.tab === 'map') {
    pull('map', async () => { if (tickN % 2 === 0) { state.map = await bridge('map'); drawMap(); } });
    pull('scan', async () => { state.scan = await bridge('scan'); drawMap(); });
    pull('pose', async () => { state.pose = await bridge('pose'); drawMap(); });
  } else if (state.tab === 'cam') {
    pull('image', async () => { drawPacket('img', await bridge('image-left?format=json')); });
    pull('depth', async () => { if (tickN % 2 === 0) drawPacket('depth', await bridge('depth?format=json')); });
  }
}
function onPullError(key, e) {
  const msg = e.body?.error?.code || e.message;
  if (key === 'image' || key === 'depth') banner(key === 'image' ? 'img' : 'depth', 'down', '신호 없음 · ' + msg), clearCanvas(key === 'image' ? 'img' : 'depth');
  else if (key === 'map') banner('map', 'down', '지도 응답 없음 · ' + msg);
}
function banner(id, cls, text) { const el = $('#' + id + '-banner'); el.className = 'banner ' + cls; el.textContent = text; }
function clearCanvas(id) { const c = $('#' + id + '-canvas'); c.getContext('2d').clearRect(0, 0, c.width, c.height); }
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// ---------------------------------------------------------------- map
function drawMap() {
  const m = state.map, cv = $('#map-canvas'), g = cv.getContext('2d');
  g.fillStyle = '#05080b'; g.fillRect(0, 0, cv.width, cv.height);
  if (!m || !m.data) { banner('map', 'down', '지도 없음'); return; }
  const d = m.data, W = d.width, H = d.height, sc = Math.min(cv.width / W, cv.height / H);
  const cells = b64(d.data), img = new ImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let v = cells[j * W + i]; if (v > 127) v -= 256;              // int8
    const o = ((H - 1 - j) * W + i) * 4;                           // +y up
    const c = v < 0 ? [28, 34, 42] : v >= 50 ? [230, 236, 244] : [60, 70, 82];
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  const off = new OffscreenCanvas(W, H); off.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false; g.drawImage(off, 0, 0, W * sc, H * sc);
  const toPx = (x, y) => [((x - d.origin.x) / d.resolution) * sc, (H - (y - d.origin.y) / d.resolution) * sc];
  const p = state.pose?.state === 'fresh' ? state.pose.data : null, sc2 = state.scan?.state === 'fresh' ? state.scan.data : null;
  if (p && sc2) {
    g.fillStyle = '#ffb454';
    sc2.ranges.forEach((r, i) => { if (r == null) return; const a = p.yaw + sc2.angle_min + i * sc2.angle_increment; const [x, y] = toPx(p.x + r * Math.cos(a), p.y + r * Math.sin(a)); g.fillRect(x - 1, y - 1, 2, 2); });
  }
  if (p) {
    const [x, y] = toPx(p.x, p.y); g.save(); g.translate(x, y); g.rotate(-p.yaw); g.fillStyle = '#4ea1ff';
    g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, 7); g.lineTo(-8, -7); g.closePath(); g.fill(); g.restore();
  }
  const worst = ['map', 'scan', 'pose'].map((k) => state[k]?.state).filter(Boolean);
  const bad = worst.includes('down') ? 'down' : worst.includes('stale') ? 'stale' : 'fresh';
  banner('map', bad, bad === 'fresh' ? '실시간' : '일부 신호 정지 · ' + ['map', 'scan', 'pose'].map((k) => `${k}:${state[k]?.state || '?'}`).join(' '));
  $('#map-meta').textContent = `map seq ${m.sequence} (${(m.age_ms / 1000).toFixed(1)}s) · ${W}×${H} @ ${d.resolution}m`;
}

// ---------------------------------------------------------------- camera / depth (9093 packet)
function parsePacket(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), n = dv.getUint32(0, true);
  const hdr = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + n)));
  return { hdr, px: buf.subarray(4 + n) };
}
function drawPacket(id, body) {
  const { hdr, px } = parsePacket(b64(body.packet_b64));
  const cv = $('#' + id + '-canvas'); cv.width = hdr.width; cv.height = hdr.height;
  const g = cv.getContext('2d'), img = g.createImageData(hdr.width, hdr.height), w = hdr.width, h = hdr.height;
  if (hdr.encoding === 'nv12') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const Y = px[y * hdr.step + x], uvi = h * hdr.step + (y >> 1) * hdr.step + (x & ~1), U = px[uvi] - 128, V = px[uvi + 1] - 128, o = (y * w + x) * 4;
      img.data[o] = Y + 1.402 * V; img.data[o + 1] = Y - 0.344 * U - 0.714 * V; img.data[o + 2] = Y + 1.772 * U; img.data[o + 3] = 255;
    }
  } else if (hdr.encoding === 'mono16') {
    const dv = new DataView(px.buffer, px.byteOffset, px.byteLength);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const mm = dv.getUint16(y * hdr.step + x * 2, !hdr.is_bigendian), o = (y * w + x) * 4;
      if (mm === 0 || mm === 65535) { img.data[o + 3] = 255; continue; }       // invalid
      const t = Math.min(1, Math.max(0, (mm - 300) / 3700)), hue = (1 - t) * 240;
      const [r, gg, b] = hsl(hue); img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  banner(id, 'fresh', '실시간');
  $('#' + id + '-meta').textContent = `${hdr.encoding} ${w}×${h} · seq ${hdr.sequence} · stamp ${hdr.stamp.sec}.${String(hdr.stamp.nanosec).padStart(9, '0').slice(0, 3)}`;
}
function hsl(h) { const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; }

// ---------------------------------------------------------------- E-STOP (two-step)
$('#estop-btn').addEventListener('click', async () => {
  const btn = $('#estop-btn'), out = $('#estop-result');
  if (Date.now() > state.armed) {
    state.armed = Date.now() + 3000; btn.textContent = '한 번 더 누르면 전송 (3초)';
    setTimeout(() => { if (Date.now() >= state.armed) btn.textContent = 'E-STOP 요청'; }, 3100);
    return;
  }
  state.armed = 0; btn.disabled = true; btn.textContent = '전송 중...';
  const t0 = performance.now();
  try {
    const r = await bridge('estop', { method: 'POST', body: JSON.stringify({ reason: $('#estop-reason').value || 'operator' }) });
    const ms = Math.round(performance.now() - t0);
    out.style.color = r.delivered ? 'var(--ok)' : 'var(--warn)';
    out.textContent = r.delivered ? `컨트롤러 어댑터가 수신 확인 (seq ${r.seq}, ${ms}ms) — ${r.detail}` : `전달 미확인, 대기열에 있음 (seq ${r.seq}) — ${r.detail}`;
    state.estopLog.unshift(`${new Date().toLocaleTimeString()} seq ${r.seq} delivered=${r.delivered} ${ms}ms`);
  } catch (e) {
    out.style.color = 'var(--bad)'; out.textContent = '요청 실패: ' + e.message + ' — 이 화면의 실패는 로봇이 정지하지 않았다는 뜻일 수 있습니다. 현장 정지 수단을 사용하세요.';
    state.estopLog.unshift(`${new Date().toLocaleTimeString()} FAILED ${e.message}`);
  } finally { btn.disabled = false; btn.textContent = 'E-STOP 요청'; $('#estop-log').textContent = state.estopLog.join('\n'); }
});

// ---------------------------------------------------------------- tabs
$('#tabs').addEventListener('click', (ev) => {
  const t = ev.target.dataset?.tab; if (!t) return;
  state.tab = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== 'tab-' + t; });
  tickN = 0; dataTick();
});
fetch('/config.json').then((r) => r.json()).then((c) => { state.cfg = c; });
