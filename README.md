# LINE Beacon Attendance

ระบบเช็คชื่อนักศึกษาด้วย **LINE Beacon** สำหรับใช้งานภายในสาขา — นักศึกษาเดินเข้าพื้นที่ติดตั้งบีคอนแล้วระบบบันทึกการเข้าร่วมอัตโนมัติผ่าน LINE Messaging API ส่วน Organizer/Admin จัดการนักศึกษา บีคอน กิจกรรม และรายงานผ่าน Dashboard

## สถาปัตยกรรม

pnpm workspaces monorepo (รายละเอียดใน [`docs/system-design-tech-stack.md`](docs/system-design-tech-stack.md)):

```
apps/web   Nuxt 4 + TypeScript + Tailwind CSS v4 + Nuxt UI v4 + Lucide
           (Dashboard สำหรับ Organizer/Admin + หน้า LIFF สำหรับนักศึกษา)
apps/api   NestJS 11 + Prisma 7 + PostgreSQL 17
           (REST API ที่ /api/v1, LINE webhook + LIFF backend)
docker/    Dockerfile.api, Dockerfile.web, compose.prod.yml (production stack)
docs/      สเปกโปรเจกต์ + เอกสารออกแบบ (อ่านก่อนเริ่มงานทุกครั้ง)
```

- **API contract** — `@nestjs/swagger` เปิด Swagger UI ที่ `/api/v1/docs` และ `pnpm gen:api` generate type ให้ฝั่ง web (`apps/web/openapi.d.ts`) ด้วย `openapi-typescript`
- **Ports** — web `3000`, api `4000`, postgres `5432` (dev ใช้ web proxy `/api` → api จึงไม่มีปัญหา CORS/cookie)

## สิ่งที่ต้องมี

- Node.js 24+, pnpm 11 (`corepack enable`)
- Docker Desktop (Postgres สำหรับ dev + รัน test ผ่าน Testcontainers + production stack)

## เริ่มต้น (Development)

```bash
pnpm install                      # ครั้งแรก: ต้องมี DATABASE_URL สำหรับ prisma generate
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/dev' pnpm install

pnpm docker:up                    # postgres 17 บน localhost:5432

cp .env.example apps/api/.env     # ตั้ง JWT_SECRET (อย่างน้อย 16 ตัวอักษร) ก่อนรัน
pnpm --filter api exec prisma migrate deploy
pnpm seed:api                     # สร้าง admin แรก (ADMIN_* ใน .env)

pnpm dev                          # api :4000 + web :3000 (ขนานกัน)
```

หน้า Dashboard: http://localhost:3000 · Swagger UI: http://localhost:4000/api/v1/docs

การทดสอบ LINE webhook จากเครื่องตัวเองใช้ tunnel (`cloudflared`) — `pnpm dev:tunnel` แล้วชี้ Webhook URL ใน LINE Developers Console มาที่ `<tunnel-url>/api/v1/line/webhook` (design doc §8)

## คำสั่งหลัก

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `pnpm dev` | รัน api + web พร้อมกัน (watch mode) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript ทั้ง repo |
| `pnpm test` | test ทั้งหมด (api: Jest + Testcontainers Postgres จริง, web: Vitest) |
| `pnpm build` | build ทั้ง repo |
| `pnpm gen:api` | regenerate `apps/web/openapi.d.ts` จาก API ปัจจุบัน (แก้ contract เมื่อไหร่รันเมื่อนั้น) |
| `pnpm seed:api` | seed admin user |
| `pnpm docker:up` | Postgres สำหรับ dev |
| `pnpm docker:prod` | รัน production stack ทั้งหมด (ด้านล่าง) |
| `pnpm dev:tunnel` | cloudflared tunnel สำหรับทดสอบ webhook/LIFF |

## Production (Docker)

Stack ตาม design doc §9 — `postgres → migrate (prisma migrate deploy) → api (healthcheck) → web`:

```bash
cp .env.example .env       # ตั้งค่าจริง: JWT_SECRET, LINE_*, COOKIE_SECURE=true, FRONTEND_URL, APP_URL
pnpm docker:prod
```

- Image แยก `docker/Dockerfile.api` / `docker/Dockerfile.web` — multi-stage `node:24-alpine`, ติดตั้งด้วย `pnpm install --frozen-lockfile`, runtime ไม่รันด้วย root
- Secret ส่งผ่าน root `.env` (env_file) เท่านั้น — ไม่ฝังใน image; compose วาง `DATABASE_URL` ให้อัตโนมัติเป็นชื่อ service `postgres`
- web :3000 (proxy `/api` ไปหา api ใน network), api :4000 (สำหรับ LINE webhook), healthcheck ที่ `/api/v1/health`
- LINE webhook URL ที่ลงทะเบียนกับ LINE ต้องชี้มาที่ `<public-host>/api/v1/line/webhook`

## การตั้งค่า LINE (สรุป)

 LINE Provider เดียว (spec §50) ประกอบด้วย:

1. **Messaging API channel** — ใช้ `LINE_CHANNEL_SECRET` (ตรวจ signature ของ webhook) + `LINE_CHANNEL_ACCESS_TOKEN` (ส่ง notification), เปิด "Use webhook" และเพิ่มบีคอน (Hardware ID) ผ่าน LINE Beacon ใน LINE Developers Console
2. **LINE Login channel (LIFF)** — ใช้ `LINE_LOGIN_CHANNEL_ID/SECRET` + `LIFF_ID`/`NUXT_PUBLIC_LIFF_ID`; endpoint ของ LIFF app ชี้ที่หน้า `/liff/*` ของ web

## การทดสอบ

- **API** — integration tests รันกับ Postgres จริงใน Testcontainers (`pnpm test:api`, ต้องมี Docker) — ครอบทุก module รวมถึง business rules สำคัญ (เช็คชื่อไม่ซ้ำ, webhook idempotency, ownership)
- **Web** — Vitest + @nuxt/test-utils (`pnpm test:web`)
- งานเสร็จตาม Definition of Done (สเปก §60) เมื่อผ่าน `lint → typecheck → test → build`

## เอกสารอ้างอิง

- [`docs/line-beacon-attendance-project-spec.md`](docs/line-beacon-attendance-project-spec.md) — requirement ต้นทาง (ข้อขัดกันยึด Core Business Rules §54)
- [`docs/system-design-tech-stack.md`](docs/system-design-tech-stack.md) — สถาปัตยกรรม + Decision Log (D1–D7)
