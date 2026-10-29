// Logs terra.events.v1 frames with wall-clock offsets. usage: node events_probe.mjs <seconds> [tokenFile]
import { readFileSync } from 'node:fs';
const secs = Number(process.argv[2] || 60);
const token = readFileSync(process.argv[3] || new URL('../run/master.token', import.meta.url), 'utf8').trim();
const t0 = Date.now();
const ws = new WebSocket('ws://127.0.0.1:28080/ws/events');
const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', protocol: 'terra.events.v1', signals: ['terra.nodes.liveness', 'terra.nodes.changed', 'terra.modules.changed', 'terra.svi.resources.changed', 'terra.node.signal'], authorization: { scheme: 'Bearer', token } }));
ws.onmessage = (m) => { const f = JSON.parse(m.data); log(f.type === 'event' ? `${f.event} ${JSON.stringify(f.data)}` : f.type); };
ws.onclose = () => log('closed');
setTimeout(() => process.exit(0), secs * 1000);
