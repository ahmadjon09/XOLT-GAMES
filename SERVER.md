# XOLT Games — Serverni kuchaytirish (Scaling) qo'llanmasi

Bu hujjat 10 000+ foydalanuvchini ko'tara oladigan ishlab chiqarish (production) serverini
sozlash bo'yicha to'liq qo'llanma.

## 1. Joriy arxitektura (allaqachon qilingan)

```
Brauzer (React SPA)
   │
   ├── /api/*        → Express (REST)
   ├── /socket.io/*  → Socket.IO (WebSocket)
   └── /uploads/*    → Statik fayllar
        │
        ▼
     Nginx (reverse proxy, TLS, rate-limit)
        │
        ▼
     Node.js (Express + Socket.IO)  ── Redis (cache)
        │
        ▼
     PostgreSQL (Prisma ORM)
```

Optimallashtirishlar allaqachon o'rnatilgan:
- **Redis cache**: shop katalogi (60s), leaderboard (30s), stats (60s) — DB so'rovlar kamayadi
- **compression (gzip)**: barcha JSON javoblar siqiladi
- **Rate limiting**: auth 30/15min, global 800/15min, socket 15 ulanish/daq/IP
- **Prisma connection pool**: `?connection_limit=10`
- **JWT auth** (30 kun), bcrypt parollar, zod validatsiya
- **Rol himoyasi**: teacher faqat o'z guruhlaridagi o'quvchilarni ko'radi, user faqat o'z ma'lumotlariga kira oladi (barcha `/api/user/*` req.user.id ishlatadi)
- **SWR frontend cache**: bir xil so'rov 20s ichida qayta yuborilmaydi (deduping), sahifa almashganda xotirada saqlanadi (localStorage emas)
- **Pagination**: leaderboard, users ro'yxatlari

## 2. Boshlang'ich server tavsiyasi

| Foydalanuvchilar | CPU | RAM | Disk | Tavsif |
|---|---|---|---|---|
| < 500 | 2 vCPU | 4 GB | 40 GB SSD | Bitta VPS yetarli |
| 500 – 5 000 | 4 vCPU | 8 GB | 80 GB SSD | Bitta kuchli VPS (Hetzner/DO) |
| 5 000 – 20 000 | 8 vCPU | 16 GB | 160 GB SSD | 2 ta node + Redis + PostgreSQL alohida |
| 20 000+ | 16+ vCPU | 32+ GB | — | Klaster, load balancer |

Operatsion tizim: **Ubuntu 22.04/24.04 LTS** yoki Debian 12.

## 3. Node.js optimallashtirish

### PM2 (process manager + cluster)
```bash
npm i -g pm2
pm2 start src/index.js -i max --name xolt-api   # barcha CPU yadrolarida ishlaydi
pm2 save
pm2 startup
```
Cluster rejimida har bir yadro uchun alohida process ishlaydi. Socket.IO uchun sticky
sessions kerak (nginx `ip_hash` quyida ko'rsatilgan).

### Node flags (cluster ichida)
```bash
NODE_OPTIONS="--max-old-space-size=4096"   # 4GB heap
```
`.ecosystem.config.js`:
```js
module.exports = {
  apps: [{
    name: 'xolt-api',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    env: { NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=4096' },
  }],
};
```

## 4. Redis — to'liq sozlash

```bash
apt install redis-server
# /etc/redis/redis.conf
maxmemory 1gb
maxmemory-policy allkeys-lru
save ""            # persistensiya kerak emas (cache uchun)
appendonly no
```
Redis **cache uchun** ishlatiladi (shop/leaderboard/stats), DB emas — ma'lumot yo'qolsa
muammo yo'q, faqat qayta yuklanadi.

### Yana qaysi so'rovlarni cache qilish mumkin
- `/api/user/groups` — 15s (tez o'zgaradi)
- `/api/user/payments` — 30s
- `/api/staff/groups` — 15s
- `/api/user/typing/leaderboard` — 60s

## 5. PostgreSQL optimallashtirish

```sql
-- postgresql.conf
shared_buffers = 4GB          -- RAMning 25%
effective_cache_size = 12GB
work_mem = 32MB
maintenance_work_mem = 1GB
max_connections = 200
```

Prisma connection limitini moslang:
```
DATABASE_URL="postgresql://user:pass@host:5432/xolt?connection_limit=20"
```

### PgBouncer (ko'p ulanish uchun)
```bash
apt install pgbouncer
# pgbouncer.ini: pool_mode = transaction
```
10 000+ o'quvchi bir vaqtda kirganda Node ulanishlarini PgBouncer orqali yuboring.

## 6. Nginx — to'liq konfig (production)

`nginx/xolt-games.conf` fayli tayyor. Cluster rejimida socket uchun sticky:

```nginx
upstream xolt_api {
    ip_hash;                              # Socket.IO sticky session
    server 127.0.0.1:4001;
    server 127.0.0.1:4002;
    server 127.0.0.1:4003;
}
```

### TLS (Let's Encrypt)
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d xolt.uz -d www.xolt.uz
```

### Nginx worker tuning
```nginx
worker_processes auto;
worker_rlimit_nofile 65535;
events { worker_connections 16384; }
```

## 7. Socket.IO kengayishi (10 000+ ulanish)

Socket.IO 2 ta adapter bilan vertikal (bir serverda) ishlaydi:

### 1) Redis adapter — ko'p node'da socket eventlar sinxronlanadi
```bash
npm i @socket.io/redis-adapter
```
```js
import { createAdapter } from '@socket.io/redis-adapter';
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```
Bu bilan 2-3 ta server socket o'yinlarini birgalikda o'tkaza oladi (math/quiz/typing).

### 2) Socket.IO redis adapter bilan o'yin holatlari
O'yin holatlari (games Map) hozir har node'da alohida. Redis adapter bilan
`io.to(room).emit()` barcha node'larda ishlaydi, lekin `games` Map faqat o'sha node'da
saqlanadi. Katta hajmda o'yin holatini Redis'ga ko'chirish yoki sticky sessions yetarli
(nginx ip_hash bilan bir user doim bir node'ga tushadi).

## 8. Sig'im qo'riqchisi — "server band" (crash o'rniga)

Server RAM/CPU ko'tara olmaydigan holatga yaqinlashganda Node process OOM bilan
**crash** bo'lardi va HAMMA foydalanuvchi birdan uzilardi. Endi o'rnatilgan
himoya bor (`server/src/utils/capacity.js`):

| Daraja | Qachon | Nima bo'ladi |
|---|---|---|
| `ok` | RAM < 75%, event loop < 150 ms | Hammasi normal |
| `warn` | RAM ≥ 75% yoki loop ≥ 150 ms | **Faqat eng og'ir o'yin — 3D poyga** yangi xona ochmaydi. Qolgan o'yinlar ishlaydi |
| `busy` | RAM ≥ 88%, loop ≥ 400 ms, socket/xona limiti | **Hech qanday yangi o'yin ochilmaydi**: client'ga `SERVER_BUSY` javobi. Ketayotgan o'yinlar to'xtatilmaydi |

Qanday ishlaydi:

1. **O'lchash** — har 1 s da: `rss`/cgroup RAM limiti, V8 heap, event loop kechikishi,
   socket soni, aktiv xona soni. Docker/PaaS'da cgroup limiti avtomatik aniqlanadi
   (`/sys/fs/cgroup/memory.max`), kerak bo'lsa `SERVER_MEM_LIMIT_MB` bilan qo'lda beriladi.
2. **Socket qo'riqchisi** (`socket/capacityGuard.js`) — `*:create`, `*:host`, `*:join`,
   `r3:c` kabi og'ir event'lar handler'ga YETIB BORMAYDI: client darhol
   `{ ok:false, error:'SERVER_BUSY' }` ack + `server:busy` event oladi.
   O'yin ichidagi trafik (yurish, javob, poyga inputlari) **bloklanmaydi**.
3. **HTTP qo'riqchisi** (`middleware/capacity.js`) — `busy` holatida `/api/*` og'ir
   so'rovlari `503 SERVER_BUSY` qaytaradi. `/health`, `/auth/login`, `/auth/me` doim ochiq.
4. **Yukni kamaytirish (load shedding)** — bosim ostida bo'sh/tugagan 3D poyga xonalari
   darhol yopiladi, `--expose-gc` bo'lsa GC chaqiriladi.
5. **Crash himoyasi** — `uncaughtException` / `unhandledRejection` log qilinadi,
   process **o'chmaydi**; har bir o'yin moduli alohida `try/catch` bilan ulanadi,
   3D poyga moduli yuklanmasa faqat o'sha o'yin o'chadi (server ishlashda davom etadi).

Frontend buni ko'rsatadi: `GET /api/health` + `server:status`/`server:busy` socket
event'lari orqali. Bosh sahifada o'yin kartalari "Server band" bo'lib o'chadi,
3D poyga sahifasida sariq banner chiqadi — foydalanuvchi "TIMEOUT" o'rniga aniq
sabab ko'radi.

```bash
# Holatni ko'rish
curl -s https://api.v2.xolt.uz/api/health | jq
# {"success":true,"data":{"level":"ok","busy":false,"memoryPct":41,"activeGames":3,...}}

# Sun'iy "band" rejimda sinash (chegarani 0 ga tushirish)
CAP_MEM_BUSY_PCT=0.0001 npm --prefix server start
```

Sozlamalar `server/.env.example` da: `SERVER_MEM_LIMIT_MB`, `CAP_MEM_WARN_PCT`,
`CAP_MEM_BUSY_PCT`, `CAP_LOOP_LAG_*`, `CAP_MAX_SOCKETS`, `CAP_MAX_ACTIVE_GAMES`,
`CAP_RACE3D_ROOM_MB`, `RACE_DB_TIMEOUT_MS`.

> Muhim: `pm2` da `max_memory_restart: '1G'` qo'yilsa, u qo'riqchi chegarasidan
> YUQORI bo'lishi kerak — aks holda process qayta ishga tushib, qo'riqchi
> foydasi ko'rinmaydi.

## 9. Monitoring

```bash
# PM2 monitoring
pm2 monit

# Node.js APM
npm i @pm2/io        # yoki New Relic / Sentry
```

**Sentry** — xatolar uchun:
```js
npm i @sentry/node
Sentry.init({ dsn: process.env.SENTRY_DSN });
```

**Uptime monitor**: UptimeRobot / HetrixTools — `/health` endpoint'ini 1 daqiqada tekshiradi.

## 10. Ma'lumotlar bazasi backup

```bash
# Har kechada backup (cron)
0 3 * * * pg_dump -Fc xolt_games > /backups/xolt_$(date +\%F).dump
# Oxirgi 7 kunni saqlash
find /backups -name '*.dump' -mtime +7 -delete
```

## 11. Tezlikni sinash

```bash
# REST
ab -n 1000 -c 100 https://xolt.uz/api/user/leaderboard?period=all

# Socket.IO
npm i -g artillery
artillery run socket-test.yml
```

### Maqsadli ko'rsatkichlar
| Ko'rsatkich | Maqsad |
|---|---|
| REST javob vaqti (p95) | < 150ms (Redis cache bilan) |
| Socket ulanish | 10 000+ bir vaqtda |
| Yuzaki yuk (page load) | < 2s |
| Uptime | 99.9% |

## 12. Xavfsizlik checklist

- [x] JWT + bcrypt, email yo'q (telefon login)
- [x] Role access: user faqat o'z data; teacher faqat o'z guruhlari; admin hamma
- [x] Rate limiting (auth, global, upload, socket)
- [x] Helmet security headers + CORS strict
- [x] Zod validatsiya barcha kirishlarda
- [x] Fayl yuklash: turi + hajm chegarasi (5MB)
- [x] Upload papkasiga ruxsat (faqat rasmlar)
- [ ] Fail2ban (SSH himoya)
- [ ] `JWT_SECRET` — uzun tasodifiy string (32+ belgi)
- [ ] `IMGBB_API_KEY` — imgbb.com dan oling

## 13. Deployment checklist

1. `npm install --omit=dev` server'da
2. `npx prisma migrate deploy`
3. `npm run build` client'da
4. `pm2 start` + `pm2 save`
5. Nginx konfig + certbot
6. Redis ishlamoqda (`redis-cli ping` → PONG)
7. `/health` tekshirish
8. `.env` barcha kalitlar bilan (JWT_SECRET almashtiring!)

## 14. Xato bo'lsa

```bash
pm2 logs xolt-api --lines 100
journalctl -u nginx --lines 50
redis-cli info memory
```
