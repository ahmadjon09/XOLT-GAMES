import { createClient } from 'redis';

let client = null;
let ready = false;
const memory = new Map();

export async function initCache() {
  try {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      socket: { connectTimeout: 3000, reconnectStrategy: false },
    });
    client.on('error', () => { ready = false; });
    await client.connect();
    ready = true;
    console.log('[cache] Redis ulandi');
  } catch (e) {
    client = null;
    ready = false;
    console.log('[cache] Redis mavjud emas, xotira rejimida ishlaydi');
  }
}

export async function cacheGet(key) {
  if (ready && client) {
    try {
      const v = await client.get(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }
  const m = memory.get(key);
  if (!m) return null;
  if (m.exp < Date.now()) {
    memory.delete(key);
    return null;
  }
  return m.val;
}

export async function cacheSet(key, val, ttlSec) {
  if (ready && client) {
    try {
      await client.set(key, JSON.stringify(val), { EX: ttlSec });
      return;
    } catch (e) { /* ignore */ }
  }
  memory.set(key, { val, exp: Date.now() + ttlSec * 1000 });
}

export async function cacheDel(key) {
  if (ready && client) {
    try { await client.del(key); } catch (e) { /* ignore */ }
  }
  memory.delete(key);
}

export async function cacheDelPrefix(prefix) {
  if (ready && client) {
    try {
      const keys = await client.keys(`${prefix}*`);
      if (keys.length) await client.del(keys);
    } catch (e) { /* ignore */ }
  }
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
}
