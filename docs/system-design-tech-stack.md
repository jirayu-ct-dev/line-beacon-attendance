# เอกสารออกแบบระบบและเทคโนโลยี — LINE Beacon Attendance Management System

เอกสารนี้แปล Requirement จาก `docs/line-beacon-attendance-project-spec.md` (ฉบับแก้ไขแล้ว) ให้เป็นการตัดสินใจด้านสถาปัตยกรรมและเทคโนโลยีที่พร้อมลงมือสร้างได้ทันที

---

## 1. หลักการออกแบบ

1. **ตรงตามสเปก** — ทุกการเลือกเทคโนโลยีต้องอ้างอิง Requirement ในสเปก ไม่เพิ่ม Feature ที่สเปกไม่ได้กำหนด
2. **เรียบง่ายก่อน** — ระบบขนาดสาขา (ผู้ใช้หลักร้อย คน, Event หลักพันต่อวัน) ไม่ต้องใช้ Infrastructure ระดับ Scale-out
3. **ใช้ของสำเร็จก่อนสร้างเอง** — เลือก Library/Tool ที่ Community ใช้กันทั่วไปเพื่อลดภาระการบำรุงรักษา
4. **ต่อยอดได้** — แยก Business Logic ชัดเจนตาม Module เพื่อรองรับ Future Enhancements ในสเปก
5. **มาตรฐาน UI เดียวทั้งโปรเจกต์** — ยึดตาม `web-ui-coding-standards`: Tailwind CSS, semantic tokens, `useToast()`, `useConfirm()`, Lucide Icons

---

## 2. สรุปสถาปัตยกรรม

```text
นักศึกษา (LINE App)
   |
   | LINE Simple Beacon (BLE)
   v
LINE Platform (Messaging API + LINE Login)
   |
   | 1) Beacon Webhook (POST /api/v1/line/webhook, ตรวจ x-line-signature)
   | 2) LIFF (Web app บนเบรอว์เซอร์ใน LINE)
   v
+-----------------------------------------------------+
| apps/api  (NestJS)                                  |
|                                                     |
|  LineWebhookController (ตอบ 200 เร็ว)               |
|     -> LineWebhookService (persist + idempotency)   |
|     -> BeaconEventService (business logic)          |
|     -> AttendanceService / LineNotificationService  |
|                                                     |
|  REST API /api/v1 (Dashboard + /me สำหรับ LIFF)     |
+-----------------------------------------------------+
   |                        |
   | Prisma ORM             | Reply/Push Message
   v                        v
PostgreSQL 17          LINE Messaging API
   ^
   |
apps/web (Nuxt 4)
   |- Dashboard (Organizer/Admin) — JWT cookie
   |- LIFF pages /liff/* (Student) — LINE ID Token
```

จุดตัดสินใจสำคัญ:

- **ประมวลผล Webhook แบบ in-process หลังตอบ 200 แล้ว** (ไม่ใช้ Queue/Redis) — งานเบา จบในหลักสิบมิลลิวินาที อยู่ในกรอบเวลา replyToken (~1 นาที) สบาย ๆ หากอนาคต Event เยอะจริงค่อยเพิ่ม BullMQ โดย Contract ไม่เปลี่ยน (เพราะ Idempotent อยู่แล้ว)
- **Web แอปเดียวบริบทละ Layout** — Dashboard และ LIFF อยู่ใน Nuxt app เดียวกัน แยกด้วย Layout และ Route prefix ไม่ต้องดูแลสองแอป

---

## 3. เทคโนโลยีที่เลือก

| ด้าน | เลือก | เหตุผล / ทางเลือกที่ปัดตก |
|---|---|---|
| Runtime | **Node.js 24 LTS** | ตรงกับ base image `node:24-alpine` ในทีม, `.nvmrc` กำหนดทั้ง repo |
| ภาษา | **TypeScript (strict)** ทั้งสองแอป | Contract ชัด, ลด runtime error |
| Monorepo | **pnpm workspaces** (ไม่ใช้ Nx/Turbo) | แอปเดียวกัน repo เดียว สอง package พอ — เพิ่ม build cache engine เมื่อมี ≥3 apps จริง |
| Backend | **NestJS 11** | ตรงสเปก §5, Module/Guard/Interceptor ครบ, DI เหมาะกับ Service หลายตัวใน Webhook pipeline |
| ORM | **Prisma 7 + `@prisma/adapter-pg`** | ตรงสเปก, Migration tool ในตัว, type-safe query |
| Database | **PostgreSQL 17** | ตรงสเปก, เก็บ `raw_payload` เป็น JSONB |
| Auth (Dashboard) | **JWT Access (15 นาที) + Refresh Token แบบหมุนเวียน (7 วัน, เก็บ hash ในตาราง `refresh_tokens`)** ใน httpOnly cookie | ตรงสเปก §29; ไม่ใช้ session store แยกเพราะมี Postgres อยู่แล้ว |
| Password Hash | **argon2** | สเปกให้เลือก bcrypt หรือ argon2 — เลือกตัวที่แรงกว่า (ตามคำแนะนำ OWASP ปัจจุบัน) |
| Auth (LIFF) | **LINE ID Token verification ฝั่ง Backend** (verify กับ LINE JWKS ผ่าน LINE Login Channel) | ตรงสเปก §7.1 — ห้ามเชื่อ `line_user_id` ที่ client ส่งมาตรง ๆ |
| LINE SDK | **@line/bot-sdk** (server) + **@line/liff** (client) | Signature verification, reply/push API สำเร็จรูป |
| Frontend | **Nuxt 4** (`<script setup lang="ts">`) | ตรงสเปก |
| CSS | **Tailwind CSS v4** + semantic tokens ผ่าน `@theme inline` | ตามมาตรฐาน `web-ui-coding-standards` |
| UI Library | **Nuxt UI v4** | อิง Tailwind v4, มี Toast/Modal/Table/Form พร้อมใช้, ผูก `@nuxt/icon` ได้กับ Lucide — เติมเฉพาะ `useConfirm()` เอง (ดู §6.4) |
| Icons | **Lucide** ผ่าน `@nuxt/icon` (collection เดียว ไม่ผสม) | ตามมาตรฐาน |
| API Contract | **@nestjs/swagger → OpenAPI JSON → `openapi-typescript`** generate type ให้ฝั่ง web (`pnpm gen:api`) | ไม่สร้าง packages/shared ตามที่ตัดออกจากสเปก แต่ยังได้ type ที่ตรงกันโดยไม่ต้องเขียนมือ |
| Validation | API: **class-validator** ผ่าน `ValidationPipe` / Web forms: **zod** | แต่ละฝั่งใช้ของที่ idiomatic กับ framework นั้น |
| วันที่/เวลา | **dayjs** + `utc` + `timezone` plugins | เก็บ UTC แสดง Asia/Bangkok ตามสเปก §43 |
| Import/Export | **exceljs** (xlsx อ่าน+เขียน) + **csv-parse/csv-stringify** | รองรับ CSV/Excel ตามสเปก §8, §44 |
| Logging | **nestjs-pino** (structured log) | Log ตามหมวด §49, ไม่ log secret |
| Rate Limit | **@nestjs/throttler** | ครอบ `/auth/login`, `/line/link`, `/line/webhook` |
| Test | API: **Jest + supertest** (default ของ NestJS) / Web: **Vitest + @nuxt/test-utils** | ตาม Requirement §57 |
| Lint/Format | **ESLint 9 (flat config) + Prettier** ครอบทั้ง repo | ผ่าน Definition of Done §60 |

---

## 4. โครงสร้าง Repository (pnpm workspaces)

```text
line-beacon-attendance/
├── apps/
│   ├── web/                      # Nuxt 4
│   │   ├── app/
│   │   │   ├── components/       # AppSidebar, PageHeader, StatusBadge, DataTable, ...
│   │   │   ├── composables/      # useAuth, useConfirm, useDataTable, useLiff
│   │   │   ├── layouts/          # default (dashboard), auth, liff
│   │   │   ├── pages/
│   │   │   │   ├── login.vue
│   │   │   │   ├── dashboard.vue
│   │   │   │   ├── activities/…
│   │   │   │   ├── students/…
│   │   │   │   ├── beacons/…
│   │   │   │   ├── reports/index.vue
│   │   │   │   ├── admin/…
│   │   │   │   └── liff/
│   │   │   │       ├── register.vue
│   │   │   │       └── profile.vue
│   │   │   ├── plugins/          # api client ($api), liff initializer
│   │   │   ├── middleware/       # auth (dashboard), guest, liff-ready
│   │   │   └── app.config.ts     # semantic color tokens
│   │   └── nuxt.config.ts
│   │
│   └── api/                      # NestJS 11
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── common/           # guards, interceptors, filters, decorators
│       │   │   ├── auth/         # JwtAuthGuard, RolesGuard, CurrentUser
│       │   │   └── http/         # ResponseInterceptor (envelope §48), GlobalExceptionFilter
│       │   ├── modules/
│       │   │   ├── auth/         # login, refresh, logout, me
│       │   │   ├── users/
│       │   │   ├── students/     # CRUD + import + disable
│       │   │   ├── line/         # webhook, link (รหัสนักศึกษา + วันเกิด), unlink, me
│       │   │   ├── beacons/
│       │   │   ├── activities/   # CRUD + publish/cancel + beacon mapping
│       │   │   ├── attendance/   # list + manual check-in + update
│       │   │   ├── beacon-logs/
│       │   │   ├── reports/      # summary + export CSV/Excel
│       │   │   ├── notifications/
│       │   │   └── audit/
│       │   └── prisma/           # schema.prisma, migrations, PrismaService
│       └── test/
│
├── docker/                       # Dockerfile.api, Dockerfile.web, compose overrides
├── docs/
├── docker-compose.yml
├── .env.example
├── pnpm-workspace.yaml
├── package.json                  # scripts กลาง: dev, lint, test, gen:api, docker:up
└── .nvmrc                        # 24
```

**Port ที่ใช้:** web `3000`, api `4000`, postgres `5432` (ค่า `PORT` ใน `.env` ของ api กำหนดเป็น 4000 — ต่างจากตัวอย่างในสเปก §50 ที่เขียน 3000 เพื่อไม่ให้ชนกับ web)

---

## 5. การออกแบบ Backend

### 5.1 Webhook Pipeline (ตามสเปก §36–§38 ฉบับแก้ไข)

```text
POST /api/v1/line/webhook        (ไม่มี JWT — ตรวจ x-line-signature ด้วย HMAC-SHA256)
  1. RawBodyMiddleware เก็บ body ดิบไว้ตรวจ signature
  2. ตรวจ signature — ไม่ผ่าน: log warning + 401 (ไม่สร้าง log row)
  3. ทุก event:
     a. INSERT beacon_logs (webhook_event_id, raw_payload, status=RECEIVED)
        - ชน UNIQUE(webhook_event_id) = event ซ้ำ (redelivery) -> ข้าม
     b. ตอบ 200 ทันที
     c. ประมวลผลต่อแบบ async ใน process เดิม (setImmediate + try/catch)
  4. BeaconEventService ทำ step 3–13 ตามสเปก §37:
     - ใช้ event.timestamp เป็น check_in_at และตัดสิน PRESENT/LATE
     - หา activity: status=PUBLISHED + beacon ตรง hwid + event_timestamp อยู่ใน window
     - ซ้อนกันหลาย activity -> log error + ไม่สร้าง attendance (ตามสเปก §38)
  5. LineNotificationService:
     - Reply ด้วย replyToken ก่อน (ถ้ายังไม่หมดอายุ ~1 นาที)
     - Fallback เป็น push เมื่อ reply ล้มเหลว
     - บันทึกผลลงตาราง notifications เสมอ
     - Cooldown ข้อความ NO_ACTIVE_ACTIVITY / UNKNOWN_USER / OUTSIDE_CHECKIN_WINDOW
       (เก็บ last-sent key ในแถว notifications ล่าสุด — ไม่ต้องมี Redis)
```

Transaction ใช้เฉพาะ 2 จุดตามสเปก §64: (1) INSERT beacon_log + update ผลลัพธ์, (2) ตรวจ existing attendance + create attendance (ภายใต้ UNIQUE(activity_id, student_id) ซึ่งเป็นด่านสุดท้ายกันซ้ำแม้มี concurrent webhook)

### 5.2 Authentication & Authorization

- **Dashboard:** `POST /auth/login` → argon2 verify → access JWT (sub, role) + refresh token (rotate ทุกครั้ง, เก็บ argon2-hash ใน DB, revoke ตอน logout) ทั้งคู่เป็น httpOnly cookie
- **Route protection:** `JwtAuthGuard` ทั้ง app + `@Roles(ADMIN)` decorator สำหรับหน้า admin; Ownership check ทำใน Service (`activity.created_by === user.id` หรือ role ADMIN) ตามกฎ flat ในสเปก §29
- **LIFF:** `LineAuthGuard` แยกต่างหาก — รับ `Authorization: Bearer <LINE ID Token>`, verify กับ JWKS ของ LINE Login Channel, แล้ว map เป็น student ผ่านตาราง `line_accounts` (ไม่ใช่ user JWT)
- ทุก endpoint ตอบ envelope `{ success, data }` / `{ success, error: { code, message } }` ผ่าน ResponseInterceptor + GlobalExceptionFilter (สเปก §48)

### 5.3 กฎการเปลี่ยนแปลงข้อมูล

- **ไม่มี hard delete** สำหรับ students / beacons / activities (สเปก §35) — ใช้ `POST .../disable|enable` หรือ `POST /activities/:id/cancel` และทุกการเปลี่ยนแปลงสำคัญเขียน `audit_logs` ผ่าน AuditService (เรียกจาก Service layer ไม่ใช่ interceptor แบบถ้วนหน้า เพื่อคุม action name ตาม §56)
- **Beacon overlap validation:** ตอน create/update activity หรือ link beacon ให้ query เช็ค window ทับซ้อนกับ activity อื่นที่ใช้ beacon เดียวกันและ status=PUBLISHED → ปฏิเสธพร้อมระบุ activity ที่ชน (สเปก §14, §38)
- **Manual check-in:** `POST /activities/:id/attendances/manual` — organizer เจ้าของ activity เท่านั้น, บันทึก `checked_in_by` + `manual_reason` + audit

---

## 6. การออกแบบ Frontend (Nuxt 4)

### 6.1 Layouts

| Layout | ใช้กับ | ลักษณะ |
|---|---|---|
| `default` | Dashboard ทั้งหมด | Back-office: **sidebar** ซ้าย (ยุบได้บน desktop, drawer บน mobile) + header มีปุ่ม collapse, user menu เป็น dropdown ท้าย sidebar (เปิดขึ้นบน, ปิดด้วย click-outside/Escape) — ตามมาตรฐาน Layout ของโปรเจกต์ |
| `auth` | `/login` | กลางจอ ไม่มี sidebar |
| `liff` | `/liff/*` | Mobile-first, **sticky header bar + แถบเมนูด้านล่าง (bottom nav)** — แก้จาก "ไม่มี sidebar" เดิมเมื่อ 2026-08-23 ตามคำขอเจ้าของโปรเจกต์: เพิ่มหน้ากิจกรรม/ประวัติ/โปรไฟล์ (ดึงจาก "เฟสถัดไป" ของสเปก §21/§63 มาทำก่อน) เมนู 3 รายการตามแบบ Rich Menu ในสเปก §22 |

โครง sidebar (ซ่อนเมนูที่ไม่มีสิทธิ์ — สิทธิ์จริงตรวจที่ backend เสมอ):

```text
ภาพรวม          /dashboard        (layout-dashboard)
กิจกรรม         /activities       (calendar-days)
นักศึกษา        /students         (users)
Beacons         /beacons          (radio)
รายงาน          /reports          (file-spreadsheet)
──────────────────────────────
เฉพาะ Admin:
ผู้จัดกิจกรรม    /admin/organizers (user-cog)
Beacon Logs     /admin/beacon-logs (scroll-text)
Audit Logs      /admin/audit-logs  (shield-check)
```

### 6.2 Design Tokens (Tailwind v4 + Nuxt UI)

`app/app.config.ts` + `@theme inline` ใน global CSS กำหนด semantic token: `primary`, `secondary`, `success`, `warning`, `error`, `info`, `neutral` — map เป็น CSS variables จุดเดียว ห้าม hard-code palette ใน template และ base layer กำหนด `button:not(:disabled) { cursor: pointer }`

Mapping สถานะ (ใช้ text label คู่กับสีเสมอ ไม่ใช้สีอย่างเดียว):

| Status | Token | Badge |
|---|---|---|
| PRESENT | success | "เข้าร่วม" |
| LATE | warning | "มาสาย" |
| ABSENT | neutral | "ขาด" |
| EXCUSED | info | "ลา" |
| Activity DRAFT/PUBLISHED/CANCELLED | neutral/success/error | ตามลำดับ |

### 6.3 รูปแบบหน้าหลัก

- **Dashboard:** StatCard grid (กิจกรรมวันนี้, ผู้เข้าร่วมวันนี้, Present, Late) + รายการ "กิจกรรมที่กำลังเปิด Check-in" (auto-refresh ทุก 30 วิ)
- **ตาราง (students / attendance / beacon-logs):** server-side ตาม contract เดียว `{ page, pageSize, search, filters, sort }` — สถานะเก็บใน URL (`useDataTable()` composable) เพื่อ share/bookmark ได้, reset กลับหน้า 1 เมื่อเปลี่ยน filter, แยก empty state "ยังไม่มีข้อมูล" กับ "ไม่พบผลลัพธ์"
- **Attendance table บน mobile:** เปลี่ยนเป็น list/card เพราะ task บนมือถืออ่านทีละคน ไม่ได้เทียบข้าม column
- **Activity form:** datetime picker ใช้ timezone Asia/Bangkok แสดงผล / ส่งค่าเป็น ISO UTC; inline validation ด้วย zod ใกล้ field + ปุ่ม submit มี processing state กันกดซ้ำ
- **Manual Check-in dialog:** search รหัสนักศึกษา → เลือก status + reason → ผ่าน `useConfirm()` ก่อนสร้าง
- **Import นักศึกษา:** dialog อัปโหลด CSV/Excel + ตาราง preview ผล validation ก่อนยืนยัน (แสดงแถวที่ error พร้อมเหตุผล)

### 6.4 Toast / Confirm / Icons

- `useToast()` จาก Nuxt UI — success/error/warning/info ตามผลลัพธ์ action
- **`useConfirm()`** — composable เดียวที่เราเขียนเอง (wrapper บน Nuxt UI Modal): ใช้ก่อนทุก destructive/high-impact action เช่น cancel activity, disable, unlink LINE, manual check-in, import ยืนยัน
- Lucide ผ่าน `<Icon name="lucide:calendar-days" />`; icon-only button ต้องมี `aria-label`

### 6.5 LIFF Integration

- plugin `liff.client.ts` เรียก `liff.init({ liffId })` เฉพาะ route `/liff/*` (client-only, ไม่กระทบ SSR)
- ข้อมูลเข้า page: `liff.getIDToken()` → ส่งเป็น Bearer ไปที่ `/api/v1/line/*` และ `/api/v1/me*`
- session กลาง `useLiffSession()` (resolve token + `GET /me` ครั้งเดียว แชร์ระหว่าง layout กับทุกหน้า) + component `LiffPageGate` รวม state ร่วม (initializing/unconfigured/error/ยังไม่ล็อกอิน) และ redirect ผู้ยังไม่ลิงก์ไป `/liff/register`
- `/liff/register`: กรอกรหัสนักศึกษา (12 หลัก) + วันเดือนปีเกิด (8 หลัก `DDMMYYYY` ปี ค.ศ. เช่น `01012004`) → `POST /line/link` — ฟอร์มต้องระบุชัดว่าเป็นปี ค.ศ. มี help text ตัวอย่าง และแสดง inline validation ใกล้ field เมื่อรูปแบบหรือค่าไม่ตรง
- `/liff/activities` + `/liff/activities/:id`: รายการกิจกรรม PUBLISHED + รายละเอียดพร้อมสถานะเช็คชื่อของตัวเอง (`GET /me/activities` — endpoint ที่สเปก §35 จองไว้; ดึงจาก "เฟสถัดไป" มาทำก่อนตามคำขอเจ้าของโปรเจกต์ 2026-08-23)
- `/liff/history`: ประวัติ attendance ของตัวเอง (`GET /me/attendances`) แยกออกจาก profile
- `/liff/profile`: ข้อมูลนักศึกษา, สถานะการเชื่อม, ยกเลิกการเชื่อม (`GET /me`, `POST /line/unlink`)

### 6.6 API Client

- plugin `$api` = `$fetch.create` ชี้ `API_BASE_URL` + interceptor:
  - แนบ access cookie (same-site) / Bearer ID Token (LIFF)
  - 401 → พยายาม `POST /auth/refresh` หนึ่งครั้งแล้ว retry, ล้มเหลว → redirect `/login`
  - error แปลงเป็นข้อความไทยที่ผู้ใช้แก้ต่อได้ (จาก `error.code`)

---

## 7. Database (Prisma)

- `apps/api/prisma/schema.prisma` — model ตามสเปก §33 ทุกตาราง: `users, students, line_accounts, beacons, activities, activity_beacons, attendances, beacon_logs, notifications, audit_logs, refresh_tokens`
- ข้อบังคับสำคัญที่ต้องมีใน schema:
  - `UNIQUE(activity_id, student_id)` บน attendances
  - `UNIQUE(webhook_event_id)` บน beacon_logs
  - `UNIQUE(student_id)` + `UNIQUE(line_user_id)` บน line_accounts
  - `UNIQUE(hwid)` บน beacons (validate `^[0-9a-fA-F]{10}$` ที่ application ด้วย)
- Timestamp ทุกตารางเป็น `timestamp(3)` UTC; การแสดงผลแปลงที่ presentation layer เท่านั้น (สเปก §43)
- Migration: `prisma migrate dev` ใน dev, `prisma migrate deploy` ใน container แบบ one-shot service (ดู §9)

---

## 8. การตั้งค่า LINE (ข้อกำหนดตอน Setup — พลาดแล้วระบบเงียบ)

1. สร้าง **Provider เดียว** ใน LINE Developers Console แล้วสร้าง **Messaging API channel + LINE Login channel ภายใต้ provider เดียวกัน** (มิฉะนั้น user ID ไม่ตรงกัน — สเปก §7.1)
2. ขอออก **HWID** ผ่าน LINE Official Account Manager แล้ว Register ในระบบ; อุปกรณ์ beacon ต้องตั้ง Device Message ไม่เป็น 0x00
3. ตั้ง Webhook URL = `https://<APP_URL>/api/v1/line/webhook` (HTTPS เท่านั้น)
4. สร้าง LIFF app ใน LINE Login channel: Endpoint URL = `https://<APP_URL>/liff/register`, scope = `openid profile`
5. ใน dev ใช้ **cloudflared tunnel** ให้ได้ HTTPS public URL ก่อนตั้งค่า webhook/LIFF (สคริปต์ `pnpm dev:tunnel`)

ตัวแปร environment ทั้งหมดอ้างอิง `.env.example` ตามสเปก §50 (เพิ่ม `API_BASE_URL` สำหรับ web)

---

## 9. Docker & Deployment

ยึดมาตรฐานของโปรเจกต์ทั้งหมด:

- **Dockerfile แยก 2 ตัว** (`docker/Dockerfile.api`, `Dockerfile.web`) — multi-stage: stage build (deps เต็มชุด + `prisma generate` + build) → stage run (คัดเฉพาะ output: web = Nitro `.output`, api = dist + prisma client + migrations)
- Base image ตรึง `node:24-alpine`, ติดตั้งด้วย `pnpm install --frozen-lockfile` ผ่าน corepack, COPY manifest ก่อน source เพื่อ cache layer
- `.dockerignore` ตัด `node_modules, .env, .git, dist, .output, coverage`
- **docker-compose.yml (prod-like):**

```text
services:
  postgres   : postgres:17-alpine, healthcheck pg_isready
  migrate    : api image, prisma migrate deploy, restart "no",
               depends_on postgres(service_healthy)
  api        : depends_on migrate(service_completed_successfully),
               healthcheck GET /api/v1/health, non-root user
  web        : depends_on api(service_healthy), non-root user
```

- Secret ส่งผ่าน `environment`/`env_file` เท่านั้น ไม่ฝังใน image; `DATABASE_URL` ใน compose ใช้ชื่อ service `postgres:5432`
- การพัฒนาประจำวัน: run postgres ใน compose (`docker compose up -d postgres`) แล้วรัน `pnpm dev` ทั้งสองแอปบนเครื่อง (hot reload เร็วกว่า volume mount)

---

## 10. การทดสอบ (ตามสเปก §57)

| ชั้น | เครื่องมือ | เคสหลัก |
|---|---|---|
| Unit (API) | Jest | `computeAttendanceStatus(open, late, close, ts)`, activity time validation, beacon overlap validation, ownership logic |
| Integration (API) | Jest + supertest + Testcontainers (postgres) | login/refresh, link LINE (รหัสนักศึกษา + วันเกิด), create activity + link beacon, manual check-in, UNIQUE กันซ้ำ |
| Webhook | supertest | signature ถูก/ผิด, known/unknown user, known/unknown beacon, duplicate `webhookEventId`, นอก window, หลาย activity ซ้อน, happy path + notification ถูกเรียก |
| E2E flow หลัก | supertest | Import student → link → register beacon → create + publish activity → ยิง webhook จำลอง → attendance เกิด → export report |
| Web | Vitest + @nuxt/test-utils | composable (`useDataTable`), ฟอร์ม validation, หน้าหลัก render สถานะ loading/empty/error |

การจำลอง Webhook ใน test ใช้ helper ที่ generate event จริงตามโครงสร้างในสเปก §9 พร้อมคำนวณ signature ด้วย channel secret ปลอม

---

## 11. Decision Log (สรุปการตัดสินใจสำคัญ)

| # | การตัดสินใจ | เหตุผล | ทางเลือกที่ปัดตก |
|---|---|---|---|
| D1 | ประมวลผล webhook in-process ไม่ใช้ queue | งานเบา จบใน ms, replyToken ยังใช้ได้, idempotent อยู่แล้วจึงสลับเป็น BullMQ ภายหลังได้โดยไม่แก้ contract | BullMQ + Redis (เพิ่ม infra โดยยังไม่จำเป็น) |
| D2 | Web แอปเดียว (dashboard + LIFF ใน Nuxt เดียว) | แชร์ tooling/token/component, LIFF มีแค่ 2 หน้าตาม MVP | แยก LIFF app (ภาระดูแลสองแอป) |
| D3 | Nuxt UI v4 เป็น component library | อิง Tailwind v4, useToast ในตัว, เข้ากับมาตรฐานโปรเจกต์โดยตรง | shadcn-vue / เขียนเองทั้งหมด |
| D4 | Refresh token หมุนเวียนเก็บใน Postgres | ไม่ต้องมี Redis, revoke ได้ทันทีตอน logout | Stateless refresh JWT (เพิกถอนยาก) |
| D5 | OpenAPI codegen แทน shared package | ได้ type ตรงกันโดยไม่เพิ่ม packages/shared (ตามที่ตัดออกจากสเปก) | packages/shared (overhead สำหรับ 2 แอป) |
| D6 | ยืนยันตอน Link ด้วยรหัสนักศึกษา + วันเดือนปีเกิด (`DDMMYYYY` ค.ศ.) | เจ้าของโครงการเลือกแนวทางง่ายสุด — ไม่ต้องมี SMTP, ไม่ต้องออก PIN, นักศึกษากรอก 2 ช่องจบ; ยอมรับความเสี่ยงว่าเพื่อนอาจรู้วันเกิดกันได้ (สเปก §31 ระบุอยู่แล้วว่าไม่ Claim 100%) และกันการลองเดาด้วย rate limit 5 ครั้ง/ชม./รหัส | OTP อีเมล (ต้องพึ่งอีเมลทะเบียนที่นักศึกษาอาจไม่ได้เช็ค + SMTP), PIN จาก Admin (ภาระการออก/กระจาย) |
| D7 | pnpm workspaces ไม่ใช้ Nx/Turbo | สองแอปหนึ่ง repo ยังไม่ถึงจุดที่ build graph ช่วยประหยัดเวลา | Nx (complexity ไม่คุ้ม ณ ขนาดนี้) |

---

## 12. ลำดับการลงมือ (map กับ Development Phases ในสเปก §58)

1. **Phase 1 — Foundation:** monorepo scaffold, Docker Compose (postgres), Prisma schema + migrate, lint/format, CI script → *ตรวจ: `pnpm lint` + `docker compose up -d postgres && pnpm dev` ได้ทั้งสองแอป*
2. **Phase 2 — Auth:** login/refresh/logout/me + guards + web `/login` + middleware → *ตรวจ: integration test ผ่าน, เข้า dashboard ได้*
3. **Phase 3 — Students:** CRUD + import CSV/Excel + disable + ตาราง server-side → *ตรวจ: import ไฟล์จริง + validation error แสดงครบ*
4. **Phase 4 — LINE:** webhook endpoint + signature + beacon_logs + LIFF register (link + ยืนยันวันเกิด) + notification service → *ตรวจ: webhook test ทั้ง 10 เคสของสเปก §57*
5. **Phase 5 — Beacons:** CRUD + disable + hwid validation + logs viewer
6. **Phase 6 — Activities:** CRUD + publish/cancel + beacon mapping + overlap validation
7. **Phase 7 — Attendance:** BeaconEventService เต็ม flow + manual check-in + audit → *ตรวจ: E2E flow หลักของสเปก §57*
8. **Phase 8 — Dashboard/UI ครบ:** stat cards, attendance table, admin pages
9. **Phase 9 — Reports:** summary + export CSV/Excel
10. **Phase 10 — Hardening:** throttler, pino log ครบหมวด, audit ครบ action, prod compose, `.env.example`

แต่ละ phase จบต้องผ่าน `lint → typecheck → test → build` ตาม Definition of Done §60 ก่อนขึ้น phase ถัดไป
