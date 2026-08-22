---
name: web-ui-coding-standards
description: Build, edit, or review Nuxt web interfaces using consistent coding and UI/UX standards with Vue Composition API, Tailwind CSS, the project's Toast/Confirm system, and Lucide Icons. Use for Nuxt websites, web applications, admin panels, dashboards, CRUD flows, forms, navigation, sidebars, and data tables. Adapt implementation to the existing Nuxt project, design system, product context, accessibility needs, and responsive behavior.
---

# Web UI Coding Standards

สร้าง Nuxt UI ที่ชัดเจน สม่ำเสมอ responsive และ accessible โดยใช้ Tailwind CSS, Toast/Confirm ของโปรเจกต์ และ Lucide Icons พร้อมยึดรูปแบบของโปรเจกต์เดิมก่อนสร้างของใหม่

## ลำดับการตัดสินใจ

ใช้ลำดับต่อไปนี้เมื่อแนวทางขัดกัน:

1. ทำตาม requirement และ scope ของผู้ใช้
2. รักษา architecture, conventions และ design system ของโปรเจกต์
3. นำ component, utility, token และ interaction pattern เดิมกลับมาใช้
4. ใช้ Nuxt, Tailwind CSS, Toast/Confirm และ Lucide ตามมาตรฐานใน skill นี้
5. ใช้แนวทางทั่วไปใน skill นี้เติมเฉพาะส่วนที่โปรเจกต์ยังไม่ได้กำหนด

อย่าเพิ่ม library, เปลี่ยน API contract, refactor นอก scope หรือสร้าง abstraction ใหม่โดยไม่มีเหตุผลชัดเจน

## Technology Defaults

ใช้เทคโนโลยีต่อไปนี้เป็นค่าเริ่มต้น เว้นแต่ requirement หรือโครงสร้างโปรเจกต์ระบุรูปแบบที่เจาะจงกว่า:

- ใช้ Nuxt และ Vue Composition API ตาม version และ conventions ของโปรเจกต์
- ใช้ `<script setup lang="ts">` และ TypeScript เมื่อโปรเจกต์รองรับ
- ใช้ arrow functions เป็นหลัก โดยรักษารูปแบบเดิมของไฟล์เมื่อความสม่ำเสมอสำคัญกว่า
- ใช้ Tailwind CSS utilities สำหรับ layout, spacing, responsive, theme และ component styling
- ใช้ `useToast()` สำหรับข้อความแจ้งผล และใช้ `useConfirm()` สำหรับการยืนยัน Action สำคัญ
- ใช้ Lucide Icons เป็น icon set หลัก และอย่าผสมหลาย icon libraries โดยไม่จำเป็น

ก่อนสร้าง implementation ใหม่ ให้ค้นหา `components/`, `composables/`, `layouts/`, `middleware/`, `plugins/`, `stores/`, `utils/`, `server/api/` และ configuration ที่เกี่ยวข้องก่อน

## Workflow

ก่อนแก้โค้ด:

- อ่านไฟล์ที่เกี่ยวข้องและตรวจเส้นทางข้อมูลตั้งแต่ UI ถึง API
- ค้นหา component, layout, hook/composable, store, service, validation, notification และ test ที่นำกลับมาใช้ได้
- ระบุ states และ edge cases ที่ได้รับผลกระทบ
- เลือกการเปลี่ยนแปลงที่เล็กที่สุดซึ่งแก้ requirement ได้ครบ

ระหว่างพัฒนา:

- รักษาพฤติกรรมเดิมที่อยู่นอก scope
- แก้ root cause แทน timing hack, duplicated state หรือ CSS override ที่เปราะบาง
- ตรวจ loading, empty, error, permission และ responsive states ไปพร้อมกับ happy path
- ใช้ข้อมูลจริงและข้อความที่เหมาะกับโดเมน อย่าสร้าง action หรือเมนูที่ยังทำงานไม่ได้

ก่อนส่งมอบ:

- รัน formatter, type check, lint และ test ที่โปรเจกต์มีและเกี่ยวข้อง
- ตรวจ interaction สำคัญด้วย keyboard และ viewport หลัก
- สรุปสิ่งที่เปลี่ยน ผลการตรวจสอบ และข้อจำกัดที่ยังเหลือ

## Coding

- ทำให้แต่ละ function และ component มีหน้าที่ชัดเจน
- แยก business/data logic ออกจาก presentation เมื่อช่วยให้ทดสอบและ reuse ได้ง่ายขึ้น
- ใช้ชื่อที่สื่อความหมายและชนิดข้อมูลที่ชัดเจนตามภาษาหรือ framework
- ลด duplication แต่หลีกเลี่ยงการ componentize ทุก element หรือสร้าง generic abstraction ก่อนมี use case
- จัดการ async errors ที่ boundary ที่เหมาะสม และแสดงข้อความที่ผู้ใช้แก้ปัญหาต่อได้
- ป้องกัน duplicate submission และ race condition ใน action ที่เปลี่ยนข้อมูล
- อย่า mutate source data หากยังต้องใช้ค่าเดิมสำหรับ reset, compare หรือ derived state
- ตรวจ permission และ validation ที่ backend ด้วยเสมอ; การซ่อน UI ไม่ใช่มาตรการความปลอดภัย

สำหรับ Nuxt:

- ใช้ `useFetch`, `useAsyncData`, `$fetch`, route middleware และ server routes ตามหน้าที่และ pattern เดิมของโปรเจกต์
- รักษา SSR compatibility; อย่าเรียก browser-only API โดยไม่ตรวจ environment หรือ lifecycle ที่เหมาะสม
- ใช้ composable สำหรับ stateful logic ที่ reuse จริง และใช้ utility สำหรับ pure logic
- ใช้ runtime config สำหรับค่าที่ขึ้นกับ environment และอย่าเปิดเผย server-only secrets ฝั่ง client
- ใช้ `try/catch` ใน async action ที่ต้องจัดการผลลัพธ์เอง พร้อมแสดงข้อความที่ผู้ใช้เข้าใจได้
- อย่าซ้อน loading/error state หลายแหล่งโดยไม่จำเป็น; กำหนด source of truth ให้ชัดเจน

## Tailwind CSS

- ใช้ utility classes เป็นหลัก รวมถึง responsive variants และ `dark:` เมื่อโปรเจกต์รองรับ dark mode
- นิยามสีแบรนด์และสถานะเป็น semantic token ที่ `app.config.ts` (เช่น `primary`, `secondary`, `success`, `warning`, `error`, `info`, `neutral`) และ map เป็น CSS variables ผ่าน `@theme inline` ใน global CSS แล้วเขียน utility แบบ semantic เช่น `bg-primary` / `text-error-700` / `border-warning-200` แทนชื่อ palette ตรง ๆ (`amber-600`); เปลี่ยนธีมทั้งระบบให้แก้ที่ config จุดเดียว — อย่า hard-code ชื่อ palette ใน template และอย่าให้สีของสถานะ (เช่น warning) กับสีแบรนด์ (primary) ชนกันจนแยกไม่ได้
- กำหนด `cursor: pointer` ให้ปุ่มที่กดได้ทุกตัวผ่าน base layer ของ global CSS (เพราะ Tailwind v4 preflight ตั้ง button เป็น `cursor: default`) แทนการใส่ `cursor-pointer` รายปุ่ม; ยกเว้น `:disabled` เพื่อให้แสดง `not-allowed`/default ตาม utility ของจุดนั้น
- ใช้ design tokens, theme variables และ utility pattern เดิมก่อน hard-coded arbitrary values
- ใช้ `flex`, `grid`, `gap`, padding และ width constraints เพื่อแก้ layout ที่ต้นเหตุ
- หลีกเลี่ยง inline styles และ custom CSS เมื่อ Tailwind ทำได้ชัดเจน
- ใช้ custom CSS เมื่อจำเป็นต่อ animation, third-party override หรือ behavior ที่ utility อธิบายได้ไม่เหมาะสม
- รวม class ที่ซ้ำและเป็น component pattern จริงไว้ใน component หรือ helper ที่โปรเจกต์ใช้อยู่ แต่อย่าสร้าง abstraction เพียงเพื่อลด class string
- รักษาลำดับและรูปแบบ class ตาม formatter/plugin ของโปรเจกต์

## useToast, useConfirm และ Lucide Icons

- ใช้ `useToast()` สำหรับข้อความแจ้งผลประเภท `success`, `error`, `warning` และ `info`
- ใช้ `useConfirm()` ก่อน Delete, Bulk Delete, Reset, Revoke, Disable หรือ Action สำคัญที่มีผลกระทบสูงหรือย้อนกลับยาก
- ใช้ inline validation สำหรับข้อผิดพลาดของ field; อย่าใช้ Toast แทน validation message
- ใช้ API และ component implementation เดิมที่อยู่เบื้องหลัง `useToast()` และ `useConfirm()` ของโปรเจกต์
- อย่าสร้างหรือใช้ `useNotify()` และอย่าสร้างระบบแจ้งเตือนซ้ำ เว้นแต่ requirement ระบุให้เปลี่ยนมาตรฐานนี้อย่างชัดเจน
- อย่าใช้ browser `alert()` หรือ `confirm()` เมื่อระบบมี UI component รองรับ
- เลือก Lucide icon ให้ตรงกับความหมายของ action และใช้ขนาดกับ stroke ที่สม่ำเสมอ
- ใช้ icon จาก integration/package ที่โปรเจกต์มีอยู่แล้วก่อนเพิ่ม dependency ใหม่
- ให้ icon-only button มี `aria-label`, `title` หรือ tooltip ที่เหมาะสม
- อย่าใช้ emoji แทน functional icon และอย่าใส่ icon ในทุกข้อความโดยไม่มีประโยชน์

## Visual System

- ใช้ design tokens หรือ scale เดิมสำหรับสี typography spacing radius border และ shadow
- รักษา visual hierarchy: ชื่อหน้า → action หลัก → controls → content → metadata
- ให้หนึ่งบริเวณมี primary action เด่นเพียงพอ และจัด secondary/destructive actions ให้ลำดับต่ำกว่า
- ใช้สีเพื่อเสริมความหมาย ไม่ใช้สีเพียงอย่างเดียวในการสื่อ status หรือ error
- ใช้ whitespace อย่างสม่ำเสมอและเหมาะกับงาน; dashboard ควร dense พอให้ scan ได้ แต่ไม่อัดแน่น
- หลีกเลี่ยง decoration ที่ไม่ช่วยงาน เช่น shadow หนัก gradient หรือ animation มากเกินบริบท
- รองรับ light/dark theme เมื่อโปรเจกต์รองรับ โดยใช้ semantic tokens แทน hard-coded colors

## Layout, Header และ Sidebar

ออกแบบโครงสร้างตามชนิดของผลิตภัณฑ์ ไม่บังคับ sidebar กับเว็บไซต์ที่ top navigation เหมาะกว่า

สำหรับ dashboard หรือ back-office:

- วาง page title, context/breadcrumb และ primary action ให้ค้นพบได้ง่าย
- ทำให้ content width, page padding และ header alignment สม่ำเสมอข้ามหน้า
- ใช้ sidebar เมื่อมี navigation หลายหมวดหรือผู้ใช้สลับส่วนงานบ่อย
- แสดง active, hover, focus, expanded และ collapsed states ให้ต่างกันชัดเจน
- จัดกลุ่ม submenu ตาม mental model ของผู้ใช้และใช้ระดับ nesting เท่าที่จำเป็น
- ซ่อนเมนูที่ไม่มี permission และอย่าแสดง dead menu
- วาง user/help/logout ไว้ส่วนรองหรือด้านล่างเมื่อสอดคล้องกับระบบ
- ทำ user menu เป็น dropdown — วางขวาบนของ header เมื่อต้องใช้ร่วมหลาย layout (public + dashboard) หรือที่ footer ของ sidebar เมื่อเป็น back-office ที่ header แน่น; เมนูเปิดลงด้านล่างเมื่ออยู่บน header และเปิดขึ้นด้านบนเมื่ออยู่ที่ footer; trigger ต้องมี `aria-expanded`, ปิดด้วย click-outside และ Escape, คืน focus ให้ trigger เมื่อปิด, ปิดอัตโนมัติเมื่อเปลี่ยนหน้า และใช้ component เดียวกันทุก layout เพื่อความสม่ำเสมอ
- navbar ของหน้า public แบ่ง 3 โซน — ซ้าย logo/ชื่อเว็บ, กลาง menu หลัก, ขวาส่วน auth (ปุ่มเข้าสู่ระบบเมื่อยังไม่ login หรือ user menu เมื่อ login แล้ว) โดยแสดงสถานะตาม session จริง; บนจอแคบซ่อน menu กลางเป็น hamburger แต่คงส่วน auth ให้เข้าถึงได้เสมอ
- ให้ header มีปุ่ม collapse/expand sidebar บน desktop เมื่อ sidebar เป็นโครงหลักของ layout; เก็บ state ผ่าน composable กลางเพื่อให้ sidebar, layout และ header ใช้ค่าเดียวกัน พร้อม transition width/padding ให้สอดคล้องกัน
- เมื่อ sidebar ยุบเป็น icon-only ให้รักษา accessible name ของแต่ละเมนู (เช่น `sr-only` ตาม breakpoint หรือ `aria-label`) และเพิ่ม tooltip ช่วยการค้นพบ; ซ่อน badge หรือป้ายรองที่ไม่จำเป็นออกในโหมดยุบ
- ใช้ sidebar search เฉพาะเมื่อจำนวนเมนูทำให้ค้นหายากจริง

Responsive behavior:

- รักษา sidebar บน desktop, ย่อเมื่อพื้นที่จำกัด และเปลี่ยนเป็น drawer/sheet บน mobile เมื่อเหมาะสม
- ให้ mobile drawer มี trigger, close control, overlay, focus management และ scroll lock
- รักษา page title และ primary action ให้เข้าถึงได้บนจอแคบ; ย่อ label เป็น icon เฉพาะเมื่อความหมายยังชัดและมี accessible name
- ป้องกัน horizontal overflow ที่เกิดจาก flex/grid child, long text หรือ fixed width โดยแก้ที่ layout constraint

## Components และ Interaction

- ใช้ component เดิมสำหรับ button, input, select, dialog, popover, tooltip, toast และ icon
- แสดง hover, active, focus-visible, disabled และ loading states ให้ครบตาม interaction
- ใช้ disabled เมื่อ action ใช้ไม่ได้จริงหรือกำลังประมวลผล; หากผู้ใช้ยังแก้เงื่อนไขได้ ให้แจ้งข้อผิดพลาดที่ชัดเจนใกล้จุด action
- ให้ destructive action มีคำยืนยันเมื่อผลกระทบรุนแรง ย้อนกลับไม่ได้ หรือมี scope กว้าง
- ใช้ toast สำหรับผลลัพธ์ระดับ action และใช้ inline error สำหรับปัญหาที่ผูกกับ field หรือ section
- อย่าใช้ browser `alert`/`confirm`; ใช้ feedback component ของโปรเจกต์
- ใช้ icon ที่ความหมายชัด ขนาดและ visual weight สม่ำเสมอ; icon-only control ต้องมี accessible name และ tooltip เมื่อช่วยการค้นพบ

## Forms และ Dialogs

- ใช้ label ที่มองเห็นได้; อย่าใช้ placeholder แทน label
- วาง validation message ใกล้ field และบอกวิธีแก้ ไม่ใช่เพียงบอกว่าไม่ถูกต้อง
- ทำ required, optional, help text และ format expectations ให้ชัดเจน
- รักษาค่าที่ผู้ใช้กรอกเมื่อ submit ล้มเหลว และ focus ไปยัง error แรกเมื่อเหมาะสม
- ใช้ dialog สำหรับงานสั้นและมีขอบเขต; ใช้หน้าแยกสำหรับ flow ยาว หลายขั้น หรือมีข้อมูลหนาแน่น
- ใน dialog ให้จัด focus, trap keyboard, รองรับ Escape ตามบริบท และคืน focus ให้ trigger เมื่อปิด
- แสดง processing state และป้องกันการ submit ซ้ำโดยไม่ทำให้ผู้ใช้สับสน

## Loading, Empty และ Error States

ออกแบบ state ตามระดับของ content:

- ใช้ skeleton เมื่อโครงสร้างคงที่และช่วยลด layout shift
- ใช้ spinner/progress สำหรับ action หรือบริเวณเล็กที่ไม่มีโครงสร้างให้ preview
- แยก “ยังไม่มีข้อมูล” ออกจาก “ไม่พบผลลัพธ์จากการค้นหา/ตัวกรอง”
- เสนอ next action ที่เหมาะสม เช่น สร้างรายการแรก ล้างตัวกรอง หรือลองใหม่
- แสดง error ใกล้บริเวณที่ล้มเหลว และรักษาส่วนอื่นของหน้าให้ใช้งานได้ถ้าเป็นไปได้
- ใช้ข้อความสั้น ชัดเจน และไม่เปิดเผยรายละเอียดระบบหรือข้อมูลอ่อนไหว

## Data Tables

เริ่มจากงานที่ผู้ใช้ต้องทำและจำนวนข้อมูลจริง อย่าเพิ่ม search, filter, sort, selection, bulk action หรือ pagination ทุกอย่างโดยอัตโนมัติ

### โครงสร้างและการอ่านข้อมูล

- ใช้ column เฉพาะข้อมูลที่ช่วยตัดสินใจหรือทำงาน; ย้ายรายละเอียดรองไป detail view, popover หรือ expandable content
- จัด text ชิดซ้ายและตัวเลข/จำนวนเงินชิดขวาตาม locale
- แยก primary และ secondary text ภายใน cell ด้วยน้ำหนักและสีที่เหมาะสม
- ใช้ status label พร้อมข้อความ; อย่าพึ่งสีเพียงอย่างเดียว
- ใช้ date, number, currency และ identifier format ให้สม่ำเสมอทั้งระบบ
- วาง row actions ด้านท้ายและรวม action รองใน menu เมื่อพื้นที่แน่น
- ให้ header เด่นจาก row พอประมาณ และรักษา row density ที่ scan ได้ง่าย

### Search, Filter, Sort และ Pagination

- วาง search เป็น control หลักและจัด filter/action ให้เป็นกลุ่มตามลำดับการใช้งาน
- แสดง active filters และวิธี clear เมื่อผู้ใช้อาจลืมว่ากรองอะไรอยู่
- ทำ sortable column ให้มี label, direction และ keyboard semantics ที่ชัดเจน
- ใช้ single-column sort เป็นค่าเริ่มต้น เว้นแต่ requirement ต้องใช้หลาย column
- ประมวลผล client-side ตามลำดับ `source → search/filter → sort → paginate → display`
- ใช้ server-side query เมื่อข้อมูลมากหรือ backend เป็นผู้กำหนดผลลัพธ์ และส่ง state ทั้งหมดผ่าน contract เดียวกัน
- reset ไปหน้าแรกเมื่อ search/filter เปลี่ยน และปรับหน้าปัจจุบันเมื่อ deletion ทำให้ page ว่าง
- เก็บ state ใน URL เมื่อผู้ใช้ควร share, bookmark หรือกลับมายังมุมมองเดิมได้

### Selection และ Bulk Actions

- ใช้ selection เฉพาะเมื่อมี bulk workflow จริง
- เก็บ selection ด้วย stable unique ID ไม่ใช่ index หรือตำแหน่งหน้า
- ระบุให้ชัดว่า “เลือกทั้งหมด” หมายถึงหน้าปัจจุบันหรือผลลัพธ์ทั้งหมด
- รองรับ checked, unchecked และ indeterminate state ที่ header checkbox
- แสดงจำนวนที่เลือกและ bulk actions เฉพาะเมื่อมี selection
- หลัง mutation ให้จัดการ selection, pagination และ refreshed data อย่างคาดเดาได้; รักษา selection เมื่อ error หากผู้ใช้ยังควร retry ได้

### Responsive Tables

เลือกวิธีตามข้อมูลและงาน ไม่ใช้วิธีเดียวกับทุกตาราง:

- ใช้ horizontal scroll เมื่อผู้ใช้ต้องเปรียบเทียบหลาย column
- ซ่อนหรือย้าย column รองเมื่อ mobile task ใช้ข้อมูลหลักเพียงบางส่วน
- เปลี่ยนเป็น list/card เมื่อความสัมพันธ์แบบ row สำคัญกว่า column comparison
- รักษา action, selection และข้อมูลระบุตัวรายการให้เข้าถึงได้เสมอ
- ทดสอบ long content, empty values, localization และ viewport แคบจริง

## Accessibility

- ใช้ semantic HTML ก่อนเพิ่ม ARIA
- เชื่อม label, description และ validation error กับ form control
- ทำให้ทุก interactive element ใช้ keyboard ได้และมี focus-visible ที่เห็นชัด
- รักษาลำดับ heading และ landmark ให้สอดคล้องกับโครงสร้างหน้า
- ให้ target size และ contrast เพียงพอ รวมถึง disabled, muted และ dark states
- ประกาศ async result หรือ dynamic change ผ่านวิธีที่ screen reader รับรู้เมื่อจำเป็น
- รองรับ reduced motion และหลีกเลี่ยง animation ที่ขัดขวางการใช้งาน

## Responsive และ Content Resilience

- ออกแบบจากข้อจำกัดของ content ไม่ใช่ device รุ่นใดรุ่นหนึ่ง
- ใช้ fluid sizing และ breakpoint ตามจุดที่ layout เริ่มเสีย ไม่ใช่ตามชื่ออุปกรณ์อย่างเดียว
- ทดสอบข้อความยาว ภาษาอื่น ค่า null จำนวนมาก และระดับ zoom
- ไม่ตัดข้อความที่สำคัญต่อการแยกรายการหรือทำ action โดยไม่มีวิธีดูค่าครบ
- หลีกเลี่ยง fixed heights ในพื้นที่ที่ content เปลี่ยนได้ เว้นแต่มี overflow behavior ที่ตั้งใจไว้

## Docker และ Deployment

เมื่อโปรเจกต์มี Dockerfile หรือ docker-compose ให้รักษาหลักการเดียวกันทั้งทีม:

- ใช้ **multi-stage build** เสมอ — stage สร้าง (dependencies เต็มชุด + generate ORM client + framework build) แยกจาก stage รัน (คัดลอกเฉพาะ build output ไป base image เปล่า) เพื่อไม่พา devDependencies และ source ขึ้น production image
- **ตรึง version ของ base image** เช่น `node:24-alpine` — ห้ามใช้ `latest`; ติดตั้ง dependencies ด้วย lockfile (`pnpm install --frozen-lockfile`) และใช้ corepack อ่าน `packageManager` จาก package.json
- จัด layer ให้ cache ได้: COPY manifest (package.json, lockfile) → install → COPY source → build; เมื่อแก้แค่โค้ด ไม่ต้องติดตั้ง dependencies ใหม่
- ใช้ **`.dockerignore`** ตัด `node_modules`, build outputs, `.env`, `.git`, `storage/` และ test artifacts ออกจาก build context — ทั้งเร็วขึ้นและกัน secret หลุดเข้า image
- **ห้ามฝัง secret ใน image** — ส่งค่า runtime ผ่าน compose `environment`/`env_file`; ค่าที่ต่างกันระหว่าง host กับ container network (เช่น `DATABASE_URL` ใช้ชื่อ service `postgres:5432` ไม่ใช่ `localhost`) ให้ override ใน compose โดย `environment` ชนะ `env_file`
- **รัน migration เป็น one-shot service** ที่ `depends_on` DB แบบ `service_healthy` และให้ app `depends_on` migrate แบบ `service_completed_successfully` — ได้ลำดับ DB พร้อม → migrate จบ → app start ด้วยคำสั่งเดียว (`docker compose up -d --build`)
- ใน container รัน **production build** (เช่น Nitro `.output`) เท่านั้น ไม่รัน dev server ใน image; bind `0.0.0.0` และ map host port ตามที่โปรเจกต์กำหนด (เลี่ยงชนกับ service อื่นบนเครื่อง)
- ใส่ **healthcheck** ให้ทุก service ระยะยาว (DB ใช้ readiness command ของตัวเอง, app ใช้ HTTP endpoint เบา), รันด้วย **user ที่ไม่ใช่ root** และตั้ง restart policy ตามความเหมาะสม (`migrate` ต้องเป็น `restart: "no"`)

## Scope-based Review

ตรวจเฉพาะหัวข้อที่เกี่ยวข้องกับงาน แต่ต้องไม่พลาดผลกระทบข้างเคียง:

- Functionality: happy path, validation, error, retry และ duplicate action
- Data: source/derived state, stale response, empty/null และ formatting
- UI: hierarchy, spacing, states, theme และ content overflow
- Responsive: desktop, narrow viewport และ touch interaction
- Accessibility: semantics, keyboard, focus, labels และ contrast
- Safety: permission, destructive scope และ sensitive data
- Regression: flow เดิมที่ใช้ component, route หรือ state ร่วมกัน

อย่าเปลี่ยนงานให้กลายเป็นการ redesign ทั้งระบบเมื่อ requirement ต้องการแก้เฉพาะจุด แต่ให้รายงานปัญหานอก scope ที่มีความเสี่ยงสูงอย่างกระชับ
