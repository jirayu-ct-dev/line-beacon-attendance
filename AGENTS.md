# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

**หมายเหตุ:** หัวข้อ 1–4 เป็นหลักการพฤติกรรมสากล (คงต้นฉบับไว้) ส่วนหัวข้อ 5 เป็นต้นไปเป็นกฎเฉพาะของ repository นี้ — LINE Beacon Attendance

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. บริบทโปรเจกต์และเอกสารหลัก

ระบบเช็คชื่อนักศึกษาด้วย LINE Beacon สำหรับใช้งานภายในสาขา — pnpm workspaces monorepo:

- `apps/web` — Nuxt 4 + TypeScript + Tailwind CSS v4 + Nuxt UI v4 + Lucide (Dashboard สำหรับ Organizer/Admin + หน้า LIFF สำหรับนักศึกษา)
- `apps/api` — NestJS 11 + Prisma 7 + PostgreSQL 17

เอกสารหลักใน `docs/` — อ่านส่วนที่เกี่ยวข้องก่อนเริ่มงานทุกครั้ง:

- `docs/line-beacon-attendance-project-spec.md` — Requirement ต้นทาง หากข้อกำหนดขัดกันให้ยึด Core Business Rules (§54) ของเอกสารนี้เป็นหลัก
- `docs/system-design-tech-stack.md` — สถาปัตยกรรม เทคโนโลยี และ Decision Log (D1–D7) การเปลี่ยนแปลงที่ขัดกับ Decision Log ต้องแจ้งและอธิบายก่อน ห้ามเปลี่ยนเงียบ ๆ

## 6. กฎธุรกิจที่ห้ามละเมิด (สรุปจากสเปก)

- **Attendance ห้ามซ้ำ** — `UNIQUE(activity_id, student_id)` คือด่านสุดท้าย แม้ application logic จะผ่านแล้ว
- **Webhook LINE** — ตรวจ signature ก่อนทุกอย่าง → persist event (UNIQUE `webhook_event_id`) → ตอบ 200 ทันที → ค่อยประมวลผล และทุก path ต้อง idempotent
- **เวลา Check-in** — ใช้ `event timestamp` จาก LINE เป็น `check_in_at` และตัดสิน PRESENT/LATE เสมอ ห้ามใช้เวลาที่ server ได้รับ webhook
- **ไม่มี hard delete** — students / beacons / activities ใช้ disable / cancel แทน และทุกการเปลี่ยนแปลงสำคัญต้องเขียน audit log
- **Notification** — ใช้ reply token ก่อน push; การส่งล้มเหลวห้ามทำให้ attendance ที่สร้างสำเร็จถูก rollback
- **Ownership** — organizer จัดการได้เฉพาะ activity ที่ตนเป็น `created_by`, admin ได้ทุกอย่าง; ตรวจสิทธิ์ที่ backend เสมอ การซ่อน UI ไม่ใช่มาตรการความปลอดภัย
- **การ Link LINE** — ยืนยันด้วยรหัสนักศึกษา 12 หลัก + วันเดือนปีเกิด (`DDMMYYYY` ปี ค.ศ.) พร้อม rate limit กันการลองเดา
- **วันเวลา** — เก็บและส่งเป็น UTC, แสดงผลเป็น Asia/Bangkok ทุกหน้า

## 7. งาน UI — ยึด skill `web-ui-coding-standards` เป็นข้อบังคับ

ทุกงานที่แตะ `apps/web` (component, page, layout, composable, การแสดงผลทุกชนิด) ต้องทำตาม skill **`web-ui-coding-standards`** (`.agents/skills/web-ui-coding-standards/SKILL.md`) — ไม่ใช่แค่แนวทางเลือกได้ จุดที่ถูกละเมิดบ่อยที่สุด:

- `<script setup lang="ts">` + Vue Composition API เท่านั้น
- **Tailwind utilities เท่านั้น** — ใช้ semantic tokens (`bg-primary`, `text-error-700`, `border-warning-200`) ห้าม hard-code palette (`amber-600`) ใน template; การเปลี่ยนสีทั้งระบบทำที่ `app.config.ts` / `@theme inline` จุดเดียว
- **แจ้งผลด้วย `useToast()`** — ห้ามใช้ browser `alert()` และห้ามสร้างระบบแจ้งเตือนซ้ำ (เช่น `useNotify()`)
- **ยืนยัน action สำคัญด้วย `useConfirm()`** ก่อนเสมอ — cancel activity, disable, unlink LINE, manual check-in, import ยืนยัน; ห้ามใช้ browser `confirm()`
- **Icon ใช้ Lucide ผ่าน `@nuxt/icon`** เท่านั้น — ห้ามผสมหลาย icon library ห้ามใช้ emoji แทน functional icon; icon-only button ต้องมี `aria-label`
- ทุก list/table ต้องมีครบ 3 state: loading, empty (แยก "ยังไม่มีข้อมูล" ออกจาก "ไม่พบผลลัพธ์จากการค้นหา"), error พร้อมวิธีแก้
- ตารางใช้ pattern เดิมของโปรเจกต์ (`useDataTable()` — state ใน URL, reset กลับหน้า 1 เมื่อ filter เปลี่ยน) อย่าประดิษฐ์ state management ซ้อนขึ้นมาเอง
- ฟอร์ม: label มองเห็นได้ (ห้ามใช้ placeholder แทน label), validation inline ใกล้ field พร้อมบอกวิธีแก้ (ไม่ใช่ toast), ปุ่ม submit มี processing state กันกดซ้ำ
- ข้อความ UI เป็นภาษาไทย; สถานะ (เข้าร่วม/มาสาย/ขาด/ลา) แสดง text label คู่กับสีเสมอ ห้ามใช้สีอย่างเดียว
- ก่อนสร้าง component ใหม่ ค้นหา `components/`, `composables/`, `layouts/` ที่มีอยู่ก่อน — ยึด pattern ของโปรเจกต์ก่อนเสมอ (ตามลำดับการตัดสินใจใน skill)

## 8. คำสั่งและเกณฑ์ความสำเร็จ

```bash
pnpm lint          # ทั้ง repo
pnpm typecheck
pnpm test          # unit + integration ที่เกี่ยวข้องกับงาน
pnpm build
pnpm gen:api       # regenerate types ฝั่ง web เมื่อแก้ API contract
```

(script กลางตามเอกสารออกแบบ §4 — ใช้ได้เมื่อ Phase 1 scaffold เสร็จ)

งานถือว่าเสร็จเมื่อผ่าน **lint → typecheck → test ที่เกี่ยวข้อง → build** และไม่แตะ scope ที่ไม่เกี่ยวข้อง ตาม Definition of Done (สเปก §60)

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
