# LIFF และ LINE Login (ฝั่งผู้ใช้: LINE ID Token)

อ่านไฟล์นี้เมื่อแตะ LIFF, การเชื่อมบัญชี LINE กับผู้ใช้ของระบบ, หรือการ verify
LINE ID token ที่ backend

## 1. สายข้อมูล LIFF

```text
เบราว์เซอร์ใน LINE (หรือ external browser)
  liff.init({ liffId })
  liff.isLoggedIn() ? liff.getIDToken() : liff.login({ redirectUri })
        |
        | Authorization: Bearer <ID token>          (ไม่ใช่ cookie ของ dashboard!)
        v
Backend: verify กับ LINE JWKS → เคลม sub = lineUserId ที่เชื่อถือได้
```

- LIFF id อยู่ในหน้า **LINE Login channel → LIFF tab** (รูป `<channelId>-<random>`)
  และเปิดผ่าน `https://liff.line.me/<liffId>` (อย่าใช้ `line://app/...` — เลิกใช้แล้ว)
- LIFF id เป็นค่า public — ใส่ใน runtime config ของเว็บ (repo นี้: `NUXT_PUBLIC_LIFF_ID`
  ซึ่ง Nuxt map เป็น `runtimeConfig.public.liffId`)
- โหลด SDK แบบ lazy + client-only (`await import('@line/liff')`) เพื่อไม่ให้กระทบ SSR
  และหน้าอื่นที่ไม่เกี่ยว

## 2. Backend: verify ID token (jose)

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://access.line.org/.well-known/openid-configuration/JWKS'),
)

const { payload } = await jwtVerify(idToken, JWKS, {
  issuer: ['https://access.line.org', 'https://api.line.org'],
  audience: LINE_LOGIN_CHANNEL_ID, // Channel ID ของ LINE Login channel — ไม่ใช่ LIFF id!
  algorithms: ['ES256'],
})
// ใช้ได้: payload.sub (lineUserId), payload.name, payload.picture
```

ข้อผิดพลาดที่พบบ่อย:
- **ใส่ LIFF id เป็น audience** → ตรวจไม่ผ่านเสมอ; audience ต้องเป็น Channel ID ตัวเลข
- เชื่อ `userId` ที่หน้าเว็บส่งมาเองโดยไม่ verify token — ห้าม; lineUserId ต้องได้จาก
  `sub` ของ token ที่ verify แล้วเท่านั้น
- token หมดอายุ/ถูก revoke → ตอบ 401 ให้หน้าเว็บเปิดใหม่ (LIFF flow ไม่มี refresh token)
- ใช้ `LINE_LOGIN_CHANNEL_SECRET` กับ ID token ไม่ได้ — secret ใช้เรื่องอื่นของ OAuth
  ส่วนการ verify นี้ใช้ JWKS สาธารณะ

## 3. Guard และ routing ฝั่ง backend (repo นี้)

- Endpoint ฝั่งผู้ใช้ (`/me*`, `/line/link`, `/line/unlink`) ต้อง opt-out จาก guard หลัก
  ของ dashboard (`@Public()` ใน Nest) แล้วใช้ guard ของ LINE token แทน — สองโลก
  (JWT dashboard vs LINE ID token) แยกกันชัดเจน ห้ามปน
- การเชื่อมบัญชี: รับข้อมูลธุรกิจมาจากผู้ใช้ (เช่น รหัสนักศึกษา + วันเกิด) **คู่กับ** ID token
  ที่ verify แล้ว — เชื่อม `line_accounts.line_user_id` (UNIQUE ทั้งสองทิศ: หนึ่ง LINE =
  หนึ่งผู้ใช้) พร้อม rate limit การลองผิด (กันการเดาวันเกิด)
- ค่า `name`/`picture` จาก token ใช้ refresh ข้อมูลโปรไฟล์ที่แสดงได้

## 4. หน้าเว็บ (pattern ของ repo นี้)

- State machine ของ LIFF: `initializing → ready | error | unconfigured`
  (`unconfigured` = ยังไม่ตั้ง LIFF id — แสดงการ์ดบอกวิธีตั้งค่าแทน crash)
- ผู้ใช้เปิดจาก external browser และยังไม่ login → `getIDToken()` คืน null → แสดงปุ่ม
  "เข้าสู่ระบบด้วย LINE" ที่เรียก `liff.login({ redirectUri: window.location.href })`
- หลัง login กลับมา หน้าจะถูกโหลดใหม่ — ทุก state ต้องทน route reload ได้
- Session กลาง (composable `useLiffSession`): resolve token + `GET /me` ครั้งเดียว
  แชร์ระหว่าง layout กับทุกหน้า; component `LiffPageGate` รวม state ร่วมและ redirect
  ผู้ยังไม่ลิงก์ไปหน้าลงทะเบียน
- API client ของ LIFF แยกจาก client ของ dashboard: Bearer ID token, **401 ต้องไม่**
  จุดชนกับ flow refresh/redirect ของ dashboard (ไม่งั้นนักศึกษาจะถูกดันไปหน้า login ของ admin)
- Frontend test: mock `@line/liff` ทั้งโมดูล (init/isInClient/isLoggedIn/getIDToken/login)
  และ mock endpoint ด้วย `registerEndpoint` ของ @nuxt/test-utils

## 5. การตั้งค่าใน LINE Developers Console (เช็คลิสต์)

ใน **LINE Login channel**:

| ฟิลด์ | ใส่ค่าอะไร |
|---|---|
| LIFF → Endpoint URL | URL สาธารณะของหน้าเข้า (เช่น `https://<host>/liff/register`) |
| LIFF → Scope | `openid` + `profile` |
| LIFF → Bot link | ตามต้องการ (เชื่อม OA อัตโนมัติเมื่อเปิด LIFF) |
| LINE Login → Callback URL | ใส่ให้ตรงกับ endpoint URL (ใช้ตอน `liff.login()` บน external browser กลับมาหน้าเดิม) |

ข้อควรระวัง:
- dev ผ่าน tunnel: ทุกครั้งที่ URL เปลี่ยน ต้องอัพเดตทั้ง Endpoint และ Callback
- เปิด LIFF ผิด channel/ผิดโปรเจกต์ (มีหลาย LIFF app ใน account เดียว) จะโหลดหน้า
  คนละแอป — เช็ค endpoint URL ที่หน้า interstitial ของ `liff.line.me/<id>` ก่อน
- LINE Login channel กับ Messaging API channel ควรอยู่ Provider เดียวกัน
  (สเปกของระบบเช็คชื่อกำหนดไว้เช่นนั้น เพราะ lineUserId ต้องใช้ร่วมได้ทั้งสองทาง)
