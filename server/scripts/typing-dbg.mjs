import { io } from 'socket.io-client';
const BASE = 'http://127.0.0.1:4000';
async function login(phone, password) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
  return (await res.json()).data;
}
function connect(token) {
  const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
  return new Promise((resolve, reject) => { s.on('connect', () => resolve(s)); s.on('connect_error', reject); });
}
const waitEvent = (socket, event, timeout = 15000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(event, handler); reject(new Error('timeout ' + event)); }, timeout);
  const handler = (data) => { clearTimeout(timer); socket.off(event, handler); resolve(data); };
  socket.on(event, handler);
});
const u1 = await login('+998900000001', '1234');
const u2 = await login('+998900000002', '1234');
const s1 = await connect(u1.token);
const s2 = await connect(u2.token);
const hostedP = waitEvent(s1, 'typing:hosted');
s1.emit('typing:host', { lang: 'uz' });
const hosted = await hostedP;
console.log('hosted code:', hosted.code, 'players:', hosted.players?.length);
const joinedP = waitEvent(s2, 'typing:joined');
s2.emit('typing:join', { code: hosted.code });
const joined = await joinedP;
console.log('joined players:', joined.session.players.length, JSON.stringify(joined.session.players.map(p => p.full_name)));
s1.disconnect(); s2.disconnect();
process.exit(0);
