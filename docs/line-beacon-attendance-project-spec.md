# LINE Beacon Attendance Management System

## 1. Project Overview

### Project Name
**LINE Beacon Attendance Management System**

### Suggested Repository Name
`line-beacon-attendance`

### Project Description
ระบบจัดการกิจกรรมและเช็คชื่อเข้าร่วมกิจกรรมสำหรับใช้งานภายในสาขา โดยใช้ **LINE Beacon** เป็นกลไกหลักในการตรวจจับว่านักศึกษาเข้าสู่พื้นที่ของกิจกรรมหรือไม่

เมื่อ LINE Beacon ตรวจพบนักศึกษาเข้าสู่พื้นที่ ระบบจะได้รับ Webhook Event จาก LINE Platform จากนั้น Backend จะตรวจสอบว่า LINE User ดังกล่าวถูกผูกกับนักศึกษาคนใด, Beacon ที่ตรวจพบถูกผูกกับกิจกรรมใด, กิจกรรมกำลังเปิดให้เช็คชื่อหรือไม่ และนักศึกษาคนนั้นเคยเช็คชื่อแล้วหรือยัง

หากผ่านเงื่อนไข ระบบจะบันทึก Attendance ลงฐานข้อมูล และส่งข้อความแจ้งเตือนกลับไปยังนักศึกษาผ่าน LINE Official Account

ระบบมี Web Dashboard สำหรับผู้จัดกิจกรรมและผู้ดูแลระบบ เพื่อสร้างกิจกรรม, ผูก Beacon, ดูรายชื่อผู้เข้าร่วม, จัดการข้อมูลนักศึกษา, ตรวจสอบประวัติ Beacon Event และ Export รายงาน

---

# 2. Main Objectives

1. ใช้ LINE Beacon สำหรับตรวจจับการเข้าสู่พื้นที่กิจกรรม
2. เชื่อม LINE Account เข้ากับข้อมูลนักศึกษา
3. ให้ผู้จัดกิจกรรมสามารถสร้างและจัดการกิจกรรมได้
4. ผูก Beacon หนึ่งหรือหลายตัวเข้ากับกิจกรรม
5. เช็คชื่อนักศึกษาอัตโนมัติเมื่อเข้าสู่พื้นที่
6. ป้องกันการสร้าง Attendance ซ้ำ
7. รองรับการเช็คชื่อด้วยมือในกรณี Beacon หรือโทรศัพท์มีปัญหา
8. ส่งแจ้งเตือนผลการเช็คชื่อผ่าน LINE
9. ให้ผู้จัดกิจกรรมตรวจสอบรายชื่อและสถานะผู้เข้าร่วมผ่าน Dashboard
10. รองรับการ Export รายงานสำหรับใช้งานภายในสาขา

---

# 3. Scope

ระบบนี้ออกแบบสำหรับใช้งาน **ภายในสาขา** เท่านั้น

ไม่จำเป็นต้องรองรับ:
- หลายมหาวิทยาลัย
- หลายองค์กร
- ระบบชำระเงิน
- ระบบสมัครสมาชิกทั่วไป
- Social Login อื่นนอกจาก LINE
- ระบบ Event Ticket
- ระบบ GPS Attendance
- Face Recognition

ระบบควรเน้น:
- ใช้งานง่าย
- โครงสร้างไม่ซับซ้อนเกินไป
- สามารถ Demo ได้จริง
- สามารถต่อยอดได้
- แยก Business Logic ชัดเจน
- ตรวจสอบย้อนหลังได้

---

# 4. Actors

ระบบมี 3 Actors หลัก

## 4.1 Student

นักศึกษาภายในสาขา

ความสามารถ:
- Add Friend LINE Official Account
- เชื่อม LINE Account กับข้อมูลนักศึกษา
- ดูข้อมูล Profile ของตัวเอง
- ดูกิจกรรม (เฟสถัดไป)
- ดูกิจกรรมที่กำลังจะมาถึง (เฟสถัดไป)
- ดูประวัติการเข้าร่วมกิจกรรม
- รับแจ้งเตือน LINE เมื่อเช็คชื่อสำเร็จ
- รับแจ้งเตือนกรณีมาสาย
- รับแจ้งเตือนเมื่อไม่มี Activity ที่กำลังเปิด
- ไม่สามารถแก้ Attendance ของตัวเอง
- ไม่สามารถสร้างกิจกรรม

---

## 4.2 Organizer

ผู้จัดกิจกรรม เช่น อาจารย์หรือเจ้าหน้าที่ในสาขา

ความสามารถ:
- Login เข้าระบบ
- ดู Dashboard
- สร้างกิจกรรม
- แก้ไขกิจกรรมที่ตนเป็นเจ้าของ
- ยกเลิกกิจกรรม
- กำหนดวันและเวลา
- กำหนดเวลาเปิด Check-in
- กำหนดเวลาสาย
- กำหนดเวลาปิด Check-in
- ผูก Beacon กับ Activity
- ดูรายชื่อผู้เข้าร่วม
- ดูเวลา Check-in
- ดูสถานะ Present / Late / Absent / Excused
- Manual Check-in
- แก้ Attendance ของกิจกรรมที่ตนเป็นเจ้าของ
- Export รายงาน
- ดูสถิติกิจกรรม

โดย Default:
- Organizer จัดการได้เฉพาะ Activity ที่ตนเป็น `created_by` เท่านั้น
- Admin จัดการได้ทุก Activity
- ไม่มีกลไกแบ่งปัน Activity ข้าม Organizer ในเวอร์ชันแรก (สามารถเพิ่มภายหลังได้)

---

## 4.3 Administrator

ผู้ดูแลระบบระดับสาขา

ความสามารถ:
- ทุกความสามารถของ Organizer
- จัดการ Student
- Import รายชื่อนักศึกษา
- จัดการ Organizer
- จัดการ Administrator
- จัดการ Beacon
- ดู Activity ทั้งหมด
- ดู Attendance ทั้งหมด
- ดู Beacon Logs
- ดู Audit Logs
- เปิด/ปิดการใช้งาน User
- เปิด/ปิดการใช้งาน Beacon
- Reset LINE Account Linking หากจำเป็น
- จัดการข้อมูลหลักของระบบ

---

# 5. Recommended Technology Stack

## Frontend
- Nuxt 4
- TypeScript
- Tailwind CSS
- UI Component Library เลือกได้ตามความเหมาะสม

## Backend
- Node.js
- NestJS
- TypeScript

## Database
- PostgreSQL

## ORM
- Prisma

## Authentication
### Admin / Organizer
- Email หรือ Username + Password
- JWT Access Token
- Refresh Token ตามความเหมาะสม

### Student
- LINE Login / LIFF
- ไม่จำเป็นต้องมี Username และ Password แยก

## LINE Integration
- LINE Official Account
- LINE Messaging API
- LINE Login
- LIFF
- LINE Beacon / LINE Simple Beacon

## Deployment
- Docker
- Docker Compose สำหรับ Development
- Environment Variables ผ่าน `.env`

---

# 6. High-Level Architecture

```text
Student
   |
   | LINE App
   v
LINE Platform
   |
   | Beacon Webhook
   v
Backend API
   |
   +----------------------+
   |                      |
   v                      v
Attendance Service    LINE Notification Service
   |
   v
PostgreSQL
   ^
   |
Admin / Organizer Dashboard
```

---

# 7. Core System Workflow

## 7.1 Student Registration / LINE Account Linking

LINE รู้เพียง LINE User ID แต่ไม่รู้ว่าเป็นนักศึกษาคนใด

ดังนั้นต้องมี Account Linking

Flow:

```text
Student
  |
  v
Add LINE Official Account
  |
  v
Open "Register / Link Student Account"
  |
  v
Open LIFF
  |
  v
Authenticate with LINE
  |
  v
Enter Student Code + Birth Date (DDMMYYYY ค.ศ.)
  |
  v
Backend verifies student + birth date
  |
  v
Link LINE User ID <-> Student
```

ตัวอย่าง:

```text
LINE User ID:
U91AFXXXXXXXX

Student Code:
660112230038
```

หลังจากผูกแล้ว:

```text
U91AFXXXXXXXX -> Student 660112230038
```

ข้อกำหนด:
- `line_user_id` ต้อง Unique
- นักศึกษา 1 คนผูก LINE Account ได้ 1 Account
- LINE Account 1 Account ผูกนักศึกษาได้ 1 คน
- ต้องมีวิธี Unlink / Reset โดย Admin
- Backend ต้อง Verify LINE Token/ID Token
- ห้ามเชื่อ `line_user_id` ที่ Client ส่งมาโดยตรงโดยไม่มี Verification
- Student Code อย่างเดียวไม่เพียงพอสำหรับยืนยันตัวตน เพราะเป็นรหัสต่อเนื่องที่เดาได้ง่าย ต้องยืนยันด้วยวันเดือนปีเกิดเสมอ — กรอกเป็นเลข 8 หลัก `DDMMYYYY` ปี ค.ศ. (เช่น เกิด 1 มกราคม 2004 ใส่ `01012004`)
- การเลือกใช้วันเดือนปีเกิดเป็นแนวทางที่เรียบง่ายที่สุด (ไม่ต้องมี SMTP หรือการออก PIN) โดยยอมรับความเสี่ยงว่าเพื่อนร่วมห้องอาจรู้วันเกิดกันได้ สอดคล้องกับ §31 ที่ระบุว่าระบบไม่ Claim ป้องกันการฝากเช็คชื่อได้ 100%
- ต้อง Rate Limit และจำกัดจำนวนครั้งที่ยืนยันผิด (เช่น ไม่เกิน 5 ครั้งต่อรหัสนักศึกษาต่อชั่วโมง) เพื่อกันการลองเดาวันเกิดแบบถี่ ๆ
- Messaging API Channel (Webhook) และ LINE Login Channel (LIFF) ต้องอยู่ภายใต้ Provider เดียวกันใน LINE Developers Console เพราะ LINE User ID ถูกออกให้ต่อ Provider หากสอง Channel อยู่คนละ Provider User ID ของคนเดียวกันจะไม่ตรงกัน และการ Link จะทำงานไม่ได้โดยไม่เกิด Error ชัดเจน

---

# 8. Student Data Import

Admin ควรสามารถ Import รายชื่อนักศึกษาจาก CSV หรือ Excel

ตัวอย่าง:

```csv
student_code,first_name,last_name,birth_date,year,email
660112230038,Somchai,Jaidee,2004-01-01,3,student1@example.com
660112230039,Somsri,Deemak,2005-02-14,2,student2@example.com
```

`birth_date` คือวันเดือนปีเกิด (ค.ศ. รูปแบบ `YYYY-MM-DD` ในไฟล์) ใช้ยืนยันตัวตนตอน Link LINE — ต้องมีในไฟล์ Import เสมอ

ข้อมูลนักศึกษาควรถูกสร้างไว้ก่อนทำ Account Linking

ไม่ควรให้นักศึกษาสร้าง Student Record ใหม่เองโดยอิสระ

---

# 9. LINE Beacon Workflow

เมื่อ Student เข้าใกล้ LINE Beacon:

```text
Student enters Beacon area
        |
        v
LINE detects Beacon
        |
        v
LINE Platform sends Webhook
        |
        v
Backend Webhook Endpoint
```

ตัวอย่างข้อมูลที่ Backend สนใจ:

```json
{
  "type": "beacon",
  "webhookEventId": "01F8PHKJVFYQZR8A4RQXQXZXTV",
  "deliveryContext": {
    "isRedelivery": false
  },
  "replyToken": "nHuyWiB7yP5ZwvFI1skX6b...",
  "source": {
    "type": "user",
    "userId": "U91AFXXXXXXXX"
  },
  "beacon": {
    "hwid": "32af519e88",
    "type": "enter",
    "dm": "303034303032"
  },
  "timestamp": 1755849600000
}
```

Backend ต้องตรวจ:
- LINE Signature
- Event Type = `beacon`
- Beacon Event Type = `enter` (ละเว้น `banner` / `stay`)
- LINE User ID
- Beacon HWID
- Event Timestamp (ใช้เป็นเวลา Check-in ที่เป็นทางการ)
- Webhook Event ID (`webhookEventId`) ซึ่งมีในทุก Event ใช้ทำ Idempotency

หมายเหตุ:
- `timestamp` คือเวลาที่ LINE ตรวจพบ Beacon จริง แม้ Webhook ถูกส่งซ้ำ (Redelivery) ค่านี้ก็ยังเป็นเวลาเดิม ระบบจึงต้องใช้ค่านี้เป็น `check_in_at` ไม่ใช่เวลาที่ Server ได้รับ Webhook
- `replyToken` ใช้ได้ครั้งเดียวและหมดอายุภายในราว 1 นาทีหลังได้รับ Event
- `dm` (Device Message) มีเฉพาะอุปกรณ์ที่รองรับ LINE Simple Beacon

---

# 10. Beacon Processing Logic

เมื่อได้รับ Beacon Enter Event:

```text
Receive Webhook
   |
   v
Verify LINE Signature
   |
   v
Persist Raw Event / Beacon Log (Idempotent ด้วย webhookEventId)
   |
   v
Respond 200 ให้ LINE ทันที
   |
   v
Validate Event
   |
   v
Find Student from LINE User ID
   |
   v
Find Beacon from HWID
   |
   v
Update Beacon Log with Result
   |
   v
Find Active Activity linked to Beacon
   |
   v
Check Check-in Time Window โดยใช้ Event Timestamp
   |
   v
Check Existing Attendance
   |
   +------ Existing ------> Do not create duplicate
   |
   v
Create Attendance
   |
   v
Determine PRESENT / LATE (จาก Event Timestamp)
   |
   v
Send LINE Notification (Reply Token ก่อน, Push เป็น Fallback)
```

ข้อกำหนด:
- ตอบ HTTP 200 ให้ LINE โดยเร็วที่สุด เพราะหากตอบช้าหรือไม่สำเร็จ LINE จะส่ง Webhook ซ้ำ (Redelivery)
- การประมวลผลทั้งหมดต้อง Idempotent โดยใช้ `webhookEventId` เป็นหลัก (มีในทุก Event) ร่วมกับ `deliveryContext.isRedelivery`
- ห้ามให้ Notification Failure ทำให้ตอบ non-200 หรือ Rollback Attendance ที่สร้างสำเร็จ

---

# 11. Activity Management

Organizer สามารถสร้าง Activity

ข้อมูลหลัก:

- Activity Name
- Description
- Location
- Start Date/Time
- End Date/Time
- Check-in Open Date/Time
- Late Date/Time
- Check-in Close Date/Time
- Organizer
- Status
- Beacon
- Optional Notes

ตัวอย่าง:

```text
Activity:
Git & GitHub Workshop

Location:
CS101

Activity Start:
09:00

Activity End:
12:00

Check-in Open:
08:45

Late After:
09:15

Check-in Close:
09:30

Beacon:
CS-BEACON-01
```

---

# 12. Activity Status

แนะนำ Status ที่ Persist:

```text
DRAFT
PUBLISHED
CANCELLED
```

`COMPLETED` ไม่ต้อง Persist เพราะคำนวณจาก DateTime ได้ (ด้านล่าง)

สถานะทางเวลา เช่น UPCOMING / CHECKIN_OPEN / ONGOING / COMPLETED สามารถคำนวณจาก DateTime ได้ ไม่จำเป็นต้อง Persist ทุกสถานะ

ตัวอย่าง:

```text
now < checkin_open_at
=> UPCOMING

checkin_open_at <= now <= checkin_close_at
=> CHECKIN_OPEN

checkin_close_at < now <= end_at
=> ONGOING

now > end_at
=> COMPLETED
```

---

# 13. Beacon Management

Admin จัดการ Beacon

ข้อมูล:

- ID
- HWID
- Name
- Location
- Description
- Status
- Created At
- Updated At

ตัวอย่าง:

```text
Name:
CS Room 101

HWID:
a1b2c3d4e5

Location:
CS101

Status:
ACTIVE
```

Beacon Status:

```text
ACTIVE
INACTIVE
MAINTENANCE
```

ข้อกำหนดสำคัญเกี่ยวกับ HWID:
- HWID ต้องเป็นเลขฐานสิบหก 10 ตัวอักษร (5 bytes) ตามสเปก LINE Simple Beacon
- HWID ไม่สามารถกำหนดเองได้ ต้องขอออกผ่าน LINE Official Account Manager (manager.line.biz/beacon/register) แล้วนำมา Register ในระบบ ห้ามใช้ HWID ที่ออกให้บัญชีอื่น
- อุปกรณ์ Beacon ต้องตั้งค่า Device Message ที่ไม่เป็น 0x00 เสมอ มิฉะนั้น LINE จะไม่ส่ง Event ออกมาเลย

---

# 14. Activity and Beacon Relationship

รองรับ:
- 1 Activity มีหลาย Beacon
- 1 Beacon ถูกนำไปใช้กับหลาย Activity คนละช่วงเวลาได้

ใช้ Junction Table:

```text
activity_beacons
```

Relationship:

```text
Activity N:M Beacon
```

ระบบต้องป้องกันกรณี Beacon เดียวถูกผูกกับหลาย Activity ที่เปิด Check-in ซ้อนกันโดยไม่ตั้งใจ หรืออย่างน้อยต้องมี Validation / Warning

---

# 15. Attendance Logic

Attendance เกิดเมื่อ:
- Student ถูกผูก LINE แล้ว
- Beacon ถูก Register แล้ว
- Beacon ถูกผูกกับ Activity
- Activity Published
- อยู่ในช่วง Check-in
- Student ยังไม่มี Attendance สำหรับ Activity นี้

สถานะ:

```text
PRESENT
LATE
ABSENT
EXCUSED
```

Check-in Method:

```text
BEACON
MANUAL
```

---

# 16. Attendance Time Rules

ตัวอย่าง Activity:

```text
Check-in Open: 08:45
Late After:    09:15
Check-in Close:09:30
```

กรณี:

```text
08:55 => PRESENT
09:20 => LATE
09:40 => ไม่สร้าง Attendance ผ่าน Beacon
```

Rule:

```text
checkin_open_at <= check_in_at <= late_at
=> PRESENT

late_at < check_in_at <= checkin_close_at
=> LATE

check_in_at > checkin_close_at
=> Reject automatic check-in
```

ข้อกำหนดเรื่องเวลา:
- ใช้ `timestamp` จาก Beacon Event ของ LINE เป็น `check_in_at` และเป็นเวลาที่ใช้ตัดสิน PRESENT / LATE เสมอ
- ห้ามใช้เวลาที่ Server ได้รับ Webhook เป็นเวลา Check-in เพราะ Webhook อาจมาถึงช้ากว่าเวลาจริง
- เวลาที่ Server ได้รับ Webhook คือ `beacon_logs.created_at` (Persist ทันทีหลัง Verify Signature) เก็บไว้เพื่อการวิเคราะห์

---

# 17. Duplicate Attendance Prevention

ต้องมี Constraint:

```text
UNIQUE(activity_id, student_id)
```

ดังนั้นแม้ Beacon ส่ง Event ซ้ำ:

```text
09:01 enter
09:02 enter
09:05 enter
```

Attendance ต้องมีเพียง:

```text
Student A
Activity X
Check-in 09:01
PRESENT
```

แต่ Beacon Logs สามารถเก็บ Event ทั้งหมดได้

---

# 18. Beacon Logs

Beacon Log มีไว้สำหรับ:
- Debug
- Audit
- ตรวจสอบ Event ซ้ำ
- ตรวจสอบปัญหา
- วิเคราะห์ย้อนหลัง

เก็บอย่างน้อย:

- ID
- LINE User ID
- Student ID ถ้าระบุได้
- Beacon ID ถ้าระบุได้
- HWID
- Event Type
- Event Timestamp
- Webhook Event ID
- Processing Status
- Raw Payload
- Created At

Processing Status ตัวอย่าง:

```text
RECEIVED
PROCESSED
DUPLICATE
UNKNOWN_USER
UNKNOWN_BEACON
NO_ACTIVE_ACTIVITY
OUTSIDE_CHECKIN_WINDOW
ERROR
```

ควรเก็บ Beacon Log แม้ Event จะไม่สามารถสร้าง Attendance ได้

---

# 19. Manual Check-in

Organizer ต้องสามารถ Manual Check-in ได้

Use Cases:
- Student ปิด Bluetooth
- Student ไม่ได้เปิด LINE Beacon
- Internet มีปัญหา
- มือถือหมดแบต
- Beacon เสีย
- LINE Webhook ล่าช้า
- เหตุผลอื่นที่ Organizer อนุมัติ

Flow:

```text
Organizer
  |
  v
Open Activity
  |
  v
Search Student
  |
  v
Manual Check-in
  |
  v
Select status / reason
  |
  v
Create Attendance
```

Attendance:

```text
checkin_method = MANUAL
```

ควรบันทึก:
- Checked in by Organizer
- Reason
- Timestamp

---

# 20. LINE Notifications

หลัง Check-in สำเร็จ:

ตัวอย่าง:

```text
✅ เช็คชื่อสำเร็จ

กิจกรรม:
Git & GitHub Workshop

เวลา:
08:57 น.

สถานะ:
เข้าร่วม
```

กรณี Late:

```text
⚠️ เช็คชื่อสำเร็จ

กิจกรรม:
Git & GitHub Workshop

เวลา:
09:20 น.

สถานะ:
มาสาย
```

กรณี Beacon พบแต่ไม่มีกิจกรรม:

```text
📍 ตรวจพบว่าคุณเข้าสู่พื้นที่

ขณะนี้ไม่มีกิจกรรมที่เปิดให้เช็คชื่อ
```

ควรพิจารณา Rate Limit / Duplicate Notification เพื่อไม่ให้ส่งข้อความซ้ำถี่เกินไป

ช่องทางการส่ง (Reply ก่อน Push):
- Beacon Event ทุก Event มาพร้อม `replyToken` ที่ใช้ได้ครั้งเดียวและหมดอายุภายในราว 1 นาที
- Reply Message ไม่นับโควตาข้อความ ใช้เป็นช่องทางหลักเมื่อประมวลผลเสร็จภายใน 1 นาที (กรณีปกติของระบบขนาดสาขา)
- กรณี Reply ไม่สำเร็จหรือหมดอายุ ใช้ Push Message เป็น Fallback (นับโควตาตามแผนของ Official Account)
- บันทึกผลการส่งลงตาราง `notifications` เสมอ และห้ามให้การส่งล้มเหลวกระทบผลลัพธ์ Attendance

---

# 21. Student Web / LIFF

Student UI ไม่จำเป็นต้องใหญ่

MVP Pages:

```text
liff/
├── register (ลงทะเบียนเชื่อม LINE Account)
└── profile  (ข้อมูลนักศึกษา + สถานะการเชื่อม + ประวัติ Attendance ของตัวเอง)
```

หน้า Activities / Upcoming Activities แยกเป็นเฟสถัดไป เพราะไม่ได้อยู่ใน MVP Completion Flow

ความสามารถ:
- ดูข้อมูลนักศึกษา
- ดูสถานะการเชื่อม LINE
- ดู Attendance ตัวเอง
- ดู Check-in Time
- ดู Attendance Status

Student ไม่สามารถ:
- แก้ Attendance
- สร้าง Activity
- แก้ Student Code
- ดูข้อมูล Student คนอื่น

---

# 22. LINE Rich Menu

สามารถออกแบบ Rich Menu:

```text
กิจกรรม
ประวัติของฉัน
โปรไฟล์
ติดต่อสาขา
```

แต่ Rich Menu ไม่ใช่ Requirement หลักของ MVP หากยังไม่จำเป็น

---

# 23. Organizer Dashboard

Pages:

```text
/dashboard

/activities
/activities/create
/activities/:id
/activities/:id/edit
/activities/:id/attendance

/beacons

/students

/reports
```

Dashboard แสดง:
- จำนวนกิจกรรมวันนี้
- จำนวนกิจกรรมทั้งหมด
- จำนวนผู้เข้าร่วมวันนี้
- จำนวน Present
- จำนวน Late
- กิจกรรมล่าสุด
- กิจกรรมที่กำลังเปิด Check-in

---

# 24. Activity Detail Page

แสดง:

- Activity Information
- Organizer
- Time
- Location
- Beacon
- Check-in Status
- Total Students
- Present Count
- Late Count
- Absent Count
- Attendance List

การนับ:
- Total Students = จำนวนนักศึกษาที่มี Status เป็น ACTIVE ทั้งหมด
- Absent = นักศึกษา ACTIVE ที่ไม่มีแถว Attendance (คำนวณ ไม่ได้ Persist)

Actions:
- Edit
- Cancel
- Manual Check-in
- Export
- View Beacon Logs เฉพาะ Activity

---

# 25. Attendance Management Page

Table:

```text
Student Code
Name
Check-in Time
Status
Method
Beacon
Updated By
```

Filters:
- Present
- Late
- Absent
- Excused
- Beacon
- Check-in Method

Search:
- Student Code
- Name

---

# 26. Admin Dashboard

Admin Pages:

```text
/admin/students
/admin/organizers
/admin/beacons
/admin/activities
/admin/beacon-logs
/admin/audit-logs
```

---

# 27. Student Management

Admin สามารถ:
- Create Student
- Edit Student
- Disable Student
- Import CSV
- Import Excel
- Search
- Filter by Year
- View LINE Linking Status
- Unlink LINE Account

Student Status:

```text
ACTIVE
INACTIVE
GRADUATED
```

---

# 28. Organizer Management

Admin สามารถ:
- Create Organizer
- Edit Organizer
- Disable Organizer
- Reset Password
- Assign Role

Roles:

```text
ADMIN
ORGANIZER
```

---

# 29. Authentication and Authorization

## Organizer/Admin

JWT Authentication

Backend Guard:

```text
ADMIN
ORGANIZER
```

Authorization ต้องตรวจ Resource Ownership

กฎแบบ Flat:
- Organizer จัดการได้เฉพาะ Activity ที่ตนเป็น `created_by`
- Admin จัดการได้ทุก Activity
- ไม่มีกลไกแบ่งปันข้าม Organizer ในเวอร์ชันแรก

---

# 30. Security Requirements

ต้องมี:

1. Verify `x-line-signature` สำหรับ LINE Webhook
2. Verify LINE ID Token / Access Token ฝั่ง Backend
3. Hash Password ด้วย bcrypt หรือ argon2
4. Validate Input
5. Validate File Import
6. Role-Based Access Control
7. Resource Ownership Check
8. Rate Limit Endpoint สำคัญ
9. Environment Variables สำหรับ Secrets
10. ห้าม Commit `.env`
11. Prisma Parameterized Query / ORM
12. CORS Configuration
13. Error Handling กลาง
14. Audit Log สำหรับ Action สำคัญ
15. ไม่ expose Raw Internal Error ไป Client

---

# 31. Anti-Fraud / Attendance Integrity

ระบบไม่ควร Claim ว่าป้องกันการฝากเช็คชื่อได้ 100%

แต่ต้องมี:

- 1 Student = 1 LINE Account
- 1 LINE Account = 1 Student
- Activity ต้อง Published
- Beacon ต้อง Active
- Beacon ต้องถูกผูกกับ Activity
- Check-in ต้องอยู่ใน Time Window
- Duplicate Attendance Prevention
- Raw Beacon Logs
- Webhook Event ID Tracking
- Organizer สามารถ Audit
- Manual Changes ต้องมี Audit Log
- Attendance Edit ควรบันทึกผู้แก้ไข

---

# 32. Suggested Database Entities

```text
users
students
line_accounts
beacons
activities
activity_beacons
attendances
beacon_logs
notifications
audit_logs
refresh_tokens (optional)
```

---

# 33. Suggested Database Schema

## users

ใช้สำหรับ Admin / Organizer

```text
id
email
username
password_hash
role
status
created_at
updated_at
```

Role:

```text
ADMIN
ORGANIZER
```

Status:

```text
ACTIVE
INACTIVE
```

---

## students

```text
id
student_code
first_name
last_name
birth_date
year
email
status
created_at
updated_at
```

Constraints:
- `student_code` UNIQUE

---

## line_accounts

```text
id
student_id
line_user_id
display_name
picture_url
linked_at
updated_at
```

Constraints:
- `student_id` UNIQUE
- `line_user_id` UNIQUE

Relationship:

```text
Student 1:1 LINE Account
```

---

## beacons

```text
id
hwid
name
location
description
status
created_at
updated_at
```

Constraints:
- `hwid` UNIQUE

---

## activities

```text
id
name
description
location

start_at
end_at

checkin_open_at
late_at
checkin_close_at

status
created_by

created_at
updated_at
```

Relationship:
- `created_by -> users.id`

---

## activity_beacons

```text
id
activity_id
beacon_id
created_at
```

Constraints:
- UNIQUE(activity_id, beacon_id)

---

## attendances

```text
id
activity_id
student_id

check_in_at
status
checkin_method

beacon_id
checked_in_by
manual_reason

created_at
updated_at
```

Constraints:

```text
UNIQUE(activity_id, student_id)
```

Status:

```text
PRESENT
LATE
ABSENT
EXCUSED
```

Check-in Method:

```text
BEACON
MANUAL
```

หมายเหตุ:
- กรณี `checkin_method = BEACON` ค่า `check_in_at` มาจาก `timestamp` ของ LINE Beacon Event
- กรณี `checkin_method = MANUAL` ค่า `check_in_at` คือเวลาที่ Organizer ทำรายการ

---

## beacon_logs

```text
id

line_user_id
student_id
beacon_id
hwid

event_type
event_timestamp
webhook_event_id

processing_status
raw_payload

created_at
```

`student_id` และ `beacon_id` สามารถ Nullable ได้ เพราะอาจเป็น Unknown User / Unknown Beacon

ข้อกำหนด:
- `webhook_event_id` ต้อง UNIQUE เพื่อทำ Idempotency (สร้าง Log ก่อนประมวลผล แล้ว Update ผลลัพธ์ทีหลัง)
- `created_at` คือเวลาที่ Server ได้รับ Webhook ส่วน `event_timestamp` คือเวลาที่ LINE ตรวจพบ Beacon จริง

---

## notifications

```text
id
student_id
activity_id
type
channel
status
message
sent_at
error_message
created_at
```

Channel:

```text
LINE
```

`activity_id` เป็น Nullable เพราะมีข้อความแจ้งเตือนที่ไม่ผูกกับ Activity เช่น กรณีไม่มีกิจกรรมเปิดอยู่

Status:

```text
PENDING
SENT
FAILED
```

---

## audit_logs

```text
id
user_id
action
entity_type
entity_id
old_value
new_value
created_at
```

ตัวอย่าง Action:

```text
ACTIVITY_CREATED
ACTIVITY_UPDATED
ATTENDANCE_MANUAL_CHECKIN
ATTENDANCE_UPDATED
STUDENT_LINE_UNLINKED
BEACON_UPDATED
```

---

# 34. Main Relationships

```text
Student
   |
   +--- 1:1 ---> LINE Account
   |
   +--- 1:N ---> Attendance

User (Organizer)
   |
   +--- 1:N ---> Activity

Activity
   |
   +--- N:M ---> Beacon
   |
   +--- 1:N ---> Attendance

Beacon
   |
   +--- 1:N ---> Beacon Log

Student
   |
   +--- 1:N ---> Beacon Log
```

---

# 35. Suggested API Structure

Base:

```text
/api/v1
```

---

## Auth

```text
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

---

## LINE

```text
POST /line/webhook

POST /line/link
DELETE /line/unlink

GET /line/profile
```

Webhook Endpoint ต้องไม่ใช้ User JWT

ต้อง Verify LINE Signature แทน

## Student (LIFF)

Endpoint สำหรับ Student ผ่าน LIFF ยืนยันตัวด้วย LINE ID Token ไม่ใช้ JWT ของ Admin/Organizer

```text
GET    /me                (ข้อมูลนักศึกษา + สถานะการเชื่อม LINE)
GET    /me/attendances    (ประวัติ Attendance ของตัวเอง)
```

เมื่อมีหน้า Activities ใน LIFF ภายหลัง ค่อยเพิ่ม `GET /me/activities`

---

## Students

```text
GET    /students
GET    /students/:id
POST   /students
PATCH  /students/:id

POST   /students/import
POST   /students/:id/unlink-line
POST   /students/:id/disable
POST   /students/:id/enable
```

ไม่มี Hard Delete เพราะ Student ถูกอ้างโดย Attendance / Beacon Log / Audit Log การ "ลบ" คือการ Disable (เปลี่ยน Status และบันทึก Audit)

---

## Beacons

```text
GET    /beacons
GET    /beacons/:id
POST   /beacons
PATCH  /beacons/:id
POST   /beacons/:id/disable
POST   /beacons/:id/enable
```

ไม่มี Hard Delete เช่นเดียวกับ Students ใช้การ Disable แทน

---

## Activities

```text
GET    /activities
GET    /activities/:id
POST   /activities
PATCH  /activities/:id

POST   /activities/:id/publish
POST   /activities/:id/cancel
```

ไม่มี Hard Delete สำหรับ Activity เพราะถูกอ้างโดย Attendance / Beacon Log / Audit Log การ "ยกเลิก" คือการเปลี่ยน Status เป็น CANCELLED

---

## Activity Beacons

```text
GET    /activities/:id/beacons
POST   /activities/:id/beacons
DELETE /activities/:id/beacons/:beaconId
```

---

## Attendance

```text
GET   /activities/:id/attendances
POST  /activities/:id/attendances/manual
PATCH /activities/:id/attendances/:attendanceId

GET   /students/:id/attendances
```

---

## Beacon Logs

```text
GET /beacon-logs
GET /beacon-logs/:id
```

---

## Reports

```text
GET /reports/activities/:id
GET /reports/activities/:id/export
GET /reports/students/:id
```

---

# 36. LINE Webhook Requirements

Webhook Controller ควรมีหน้าที่น้อยที่สุด

แนะนำ:

```text
LineWebhookController
        |
        v
LineWebhookService
        |
        v
BeaconEventService
        |
        +--> BeaconLogService
        |
        +--> AttendanceService
        |
        +--> LineNotificationService
```

ห้ามใส่ Business Logic ทั้งหมดใน Controller

เพิ่มเติม:
- Controller ต้องตอบ 200 ให้ LINE โดยเร็วที่สุดหลัง Verify Signature และ Persist Event เพราะ LINE จะส่ง Webhook ซ้ำหากตอบช้าหรือไม่สำเร็จ
- การประมวลผลหลังจากนั้นทำแบบ Synchronous ที่เร็ว (เหมาะกับระบบขนาดสาขา) หรือใช้ Queue ก็ได้ แต่ต้อง Idempotent เสมอ

---

# 37. Beacon Event Service Responsibilities

BeaconEventService ต้อง:

1. Parse Event
2. Check Idempotency ด้วย webhookEventId
3. Validate Beacon Event
4. Identify Student
5. Identify Beacon
6. Save / Update Log
7. Find Eligible Activity
8. Validate Time Window (ใช้ Event Timestamp)
9. Check Existing Attendance
10. Create Attendance
11. Send Notification
12. Update Processing Result
13. Handle Errors Gracefully

---

# 38. Activity Matching Logic

เมื่อ Beacon Event เข้ามา:

ค้นหา Activity ที่:

```text
status = PUBLISHED

AND beacon matches hwid

AND event_timestamp >= checkin_open_at

AND event_timestamp <= checkin_close_at
```

ใช้ `event_timestamp` จาก LINE Event ไม่ใช่เวลาปัจจุบันของ Server เพราะ Webhook อาจมาถึงช้ากว่าเวลาที่ตรวจพบ Beacon จริง
```

หากเจอหลาย Activity พร้อมกัน:
- ไม่ควรเลือกแบบสุ่ม
- ต้องมี deterministic rule
- แนะนำป้องกันตั้งแต่ตอนสร้าง Activity ไม่ให้ Beacon เดียวกันมี Check-in Window ซ้อนกัน
- หากยังเกิดขึ้น ให้ Log Error และไม่สร้าง Attendance อัตโนมัติจนกว่าจะ Resolve

---

# 39. Student Not Linked Case

กรณี LINE Beacon ส่ง User ID มา แต่ไม่มีใน `line_accounts`

ต้อง:

```text
Save Beacon Log:
UNKNOWN_USER
```

ไม่สร้าง Attendance

อาจส่ง LINE Notification:

```text
ยังไม่ได้เชื่อมบัญชีนักศึกษา
กรุณาลงทะเบียนก่อนใช้งานระบบเช็คชื่อ
```

---

# 40. Unknown Beacon Case

หาก HWID ไม่อยู่ในฐานข้อมูล:

```text
Save Beacon Log:
UNKNOWN_BEACON
```

ไม่สร้าง Attendance

แจ้ง Admin ผ่าน Log

ไม่ควรสร้าง Beacon อัตโนมัติจาก Webhook

---

# 41. No Active Activity Case

หาก Beacon ถูกต้อง แต่ไม่มีกิจกรรมที่เปิด:

```text
Save Beacon Log:
NO_ACTIVE_ACTIVITY
```

ไม่สร้าง Attendance

อาจส่ง Student Notification แบบ Cooldown เพื่อไม่ให้ Spam

---

# 42. Notification Deduplication

เพื่อป้องกัน Beacon ยิง Event ซ้ำแล้ว LINE ถูก Spam

ควรมี Rule เช่น:

- หาก Attendance ถูกสร้างสำเร็จแล้ว ไม่ส่ง Success Message ซ้ำ
- หาก `NO_ACTIVE_ACTIVITY` ซ้ำจาก Beacon เดิมภายในช่วงเวลาสั้น ๆ ไม่ส่งซ้ำ
- หาก `UNKNOWN_USER` ซ้ำถี่ ๆ ใช้ Cooldown
- หาก `OUTSIDE_CHECKIN_WINDOW` ซ้ำจาก Beacon เดียวกันในช่วงเวลาสั้น ๆ ใช้ Cooldown เช่นเดียวกับ NO_ACTIVE_ACTIVITY

---

# 43. Timezone

ระบบนี้ใช้งานในประเทศไทย

Default Timezone:

```text
Asia/Bangkok
UTC+7
```

แนะนำ:
- Database เก็บ Timestamp เป็น UTC
- Backend Convert ตาม Timezone
- Frontend แสดง Asia/Bangkok

ต้องจัดการ DateTime ให้สม่ำเสมอทั้งระบบ

---

# 44. Reports

Activity Report ควรมี:

```text
Activity Name
Date
Organizer

Total Students
Present
Late
Absent
Excused

Attendance List
```

การนับสำหรับรายงาน:
- Total Students = นักศึกษา Status ACTIVE ทั้งหมด
- Present / Late / Excused = นับจากแถว Attendance
- Absent = Total Students - Present - Late - Excused (คำนวณตอนสร้างรายงาน ไม่ได้ Persist แถว ABSENT)

รองรับ Export:
- CSV
- Excel

PDF เป็น Optional

---

# 45. Dashboard Metrics

ตัวอย่าง Metrics:

```text
Today's Activities
Upcoming Activities
Total Students
Linked LINE Accounts
Attendance Today
Present
Late
```

---

# 46. Search and Filters

ควรมี:

Students:
- Student Code
- Name
- Year
- LINE Linked / Not Linked

Activities:
- Date
- Status
- Organizer

Attendance:
- Status
- Student
- Method
- Time

Beacon Logs:
- HWID
- Student
- Processing Status
- Date Range

---

# 47. Validation Rules

Activity:

```text
start_at < end_at

checkin_open_at <= start_at
late_at >= checkin_open_at
late_at <= checkin_close_at
checkin_close_at <= end_at หรืออนุญาตเกินเล็กน้อยตาม Requirement
```

Student:
- Student Code Unique
- Student Code เป็นตัวเลข 12 หลัก
- Required Name
- Birth Date Required (ค.ศ.)
- Valid Year

Beacon:
- HWID Unique
- Name Required
- HWID เป็นเลขฐานสิบหก 10 ตัวอักษร (`^[0-9a-fA-F]{10}$`) และต้องเป็น HWID ที่ LINE ออกให้

LINE:
- line_user_id Unique

Attendance:
- Activity + Student Unique

---

# 48. Error Handling

Backend Response Format ควรสม่ำเสมอ

ตัวอย่าง:

```json
{
  "success": false,
  "error": {
    "code": "ACTIVITY_NOT_FOUND",
    "message": "Activity not found"
  }
}
```

Success:

```json
{
  "success": true,
  "data": {}
}
```

หมายเหตุ: NestJS มี Error Format Default ของตัวเอง ต้องทำ Global Interceptor / Exception Filter เพื่อให้ทุก Response เป็น Format เดียวกันทั้งระบบ

---

# 49. Logging

ควรมี Application Log สำหรับ:

- LINE Webhook Received
- Invalid Signature
- Beacon Event Processing
- Attendance Created
- Duplicate Attendance
- Notification Failed
- Database Error
- Unauthorized Access

ห้าม Log:
- Password
- JWT Secret
- LINE Channel Secret
- Sensitive Token เต็มค่า

---

# 50. Environment Variables

ตัวอย่าง:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=

JWT_SECRET=
JWT_REFRESH_SECRET=

LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=

LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=

LIFF_ID=

APP_URL=
FRONTEND_URL=
```

ห้าม Commit Secret จริง

สร้าง `.env.example`

ข้อกำหนดการตั้งค่า LINE:
- `LINE_CHANNEL_*` (Messaging API สำหรับ Webhook และแจ้งเตือน) และ `LINE_LOGIN_*` (LINE Login สำหรับ LIFF) ต้องเป็น Channel ที่อยู่ภายใต้ Provider เดียวกันใน LINE Developers Console ไม่เช่นนั้น LINE User ID ของผู้ใช้คนเดียวกันจะไม่ตรงกันระหว่างสอง Channel และการ Link จะทำงานไม่ถูกต้อง

---

# 51. Suggested Backend Modules

NestJS Modules:

```text
AuthModule
UsersModule
StudentsModule
LineModule
BeaconsModule
ActivitiesModule
AttendanceModule
ReportsModule
NotificationsModule
AuditModule
PrismaModule
```

---

# 52. Suggested Frontend Modules / Pages

```text
pages/
├── login.vue
├── dashboard.vue
│
├── activities/
│   ├── index.vue
│   ├── create.vue
│   └── [id]/
│       ├── index.vue
│       ├── edit.vue
│       └── attendance.vue
│
├── students/
│   ├── index.vue
│   └── [id].vue
│
├── beacons/
│   ├── index.vue
│   └── [id].vue
│
├── reports/
│   └── index.vue
│
└── admin/
    ├── organizers.vue
    ├── beacon-logs.vue
    └── audit-logs.vue
```

LIFF (MVP):

```text
liff/
├── register
└── profile
```

หน้า `activities` และ `history` เพิ่มภายหลังพร้อม Endpoint `GET /me/activities`

---

# 53. UI Requirements

Dashboard:
- Responsive
- Desktop First สำหรับ Organizer
- Mobile Usable

Student LIFF:
- Mobile First
- ใช้งานง่ายใน LINE

ควรมี:
- Loading State
- Empty State
- Error State
- Confirmation Dialog
- Toast / Feedback
- Pagination
- Search
- Filter

---

# 54. Core Business Rules

1. Student ต้อง Link LINE ก่อน Check-in อัตโนมัติได้
2. Beacon ต้อง Register ในระบบ
3. Activity ต้อง Published
4. Activity ต้องมี Beacon
5. Event ต้องเป็น Beacon `enter`
6. Event ต้องอยู่ใน Check-in Window
7. Student 1 คนมี Attendance 1 รายการต่อ Activity
8. Beacon Event ทุก Event ควรมี Log
9. Duplicate Event ห้ามสร้าง Attendance ซ้ำ
10. Manual Check-in ต้องบันทึก Organizer
11. Manual Attendance Change ต้อง Audit
12. Admin มี Full Access
13. Organizer จำกัด Resource ตาม Ownership/Permission
14. Student ดูได้เฉพาะข้อมูลตัวเอง
15. LINE Webhook ต้อง Verify Signature
16. เวลา Check-in และการตัดสิน PRESENT / LATE ใช้ Event Timestamp ของ LINE และการประมวลผล Webhook ต้อง Idempotent ด้วย webhookEventId

---

# 55. Important Edge Cases

ต้องรองรับ:

### Duplicate Beacon Event
ไม่สร้าง Attendance ซ้ำ

### LINE User Not Linked
Log และแจ้งให้ลงทะเบียน

### Unknown Beacon
Log และไม่สร้าง Attendance

### No Active Activity
Log และไม่สร้าง Attendance

### Activity Cancelled
ไม่รับ Check-in

### Check-in Too Early
ไม่สร้าง Attendance

### Check-in Too Late
ไม่สร้าง Attendance หรือใช้ Manual ตาม Organizer

### Same Beacon Linked to Overlapping Activities
ต้อง Validate หรือ Reject Configuration

### Notification Failed
Attendance ไม่ควรถูก Rollback เพียงเพราะ LINE Message ส่งไม่สำเร็จ

### Database Failure
ต้อง Log และ Handle อย่างเหมาะสม

### Re-delivered LINE Webhook
ทุก Event มี `webhookEventId` และ `deliveryContext.isRedelivery` อยู่แล้ว ใช้ทำ Idempotency โดย Persist Event ก่อนประมวลผลและกำหนด UNIQUE ที่ `webhook_event_id`

---

# 56. Audit Requirements

Audit Actions สำคัญ:

```text
LOGIN
STUDENT_CREATED
STUDENT_UPDATED
STUDENT_IMPORTED
LINE_ACCOUNT_LINKED
LINE_ACCOUNT_UNLINKED

BEACON_CREATED
BEACON_UPDATED

ACTIVITY_CREATED
ACTIVITY_UPDATED
ACTIVITY_PUBLISHED
ACTIVITY_CANCELLED

ATTENDANCE_MANUAL_CREATED
ATTENDANCE_UPDATED
```

---

# 57. Testing Requirements

ต้องมี:

## Unit Tests
- Attendance Status Calculation
- Activity Time Validation
- Duplicate Attendance Prevention
- Activity Matching
- Permission Logic

## Integration Tests
- Create Activity
- Link Beacon
- Manual Check-in
- Student LINE Linking

## Webhook Tests
- Valid LINE Signature
- Invalid LINE Signature
- Known User
- Unknown User
- Known Beacon
- Unknown Beacon
- Duplicate Event
- Outside Check-in Time
- No Activity
- Successful Attendance

## E2E Critical Flow

```text
Create Student
-> Link LINE
-> Create Beacon
-> Create Activity
-> Link Beacon
-> Publish Activity
-> Receive Beacon Enter
-> Create Attendance
-> Send Notification
-> Attendance visible on Dashboard
```

---

# 58. Development Phases

## Phase 1: Project Foundation
- Setup Monorepo หรือ Separate Repositories
- Setup Nuxt
- Setup NestJS
- Setup PostgreSQL
- Setup Prisma
- Docker Compose
- Environment Configuration
- Base Lint / Format / Test

## Phase 2: Authentication
- Admin / Organizer Authentication
- JWT
- Roles
- Guards

## Phase 3: Student Management
- Student CRUD
- CSV/Excel Import
- Search / Filter

## Phase 4: LINE Integration
- LINE Webhook
- Signature Verification
- LIFF
- Student Account Linking
- LINE Notification Service

## Phase 5: Beacon Management
- Beacon CRUD
- Register HWID
- Beacon Status
- Beacon Logs

## Phase 6: Activity Management
- Activity CRUD
- Date/Time Rules
- Publish/Cancel
- Activity-Beacon Mapping

## Phase 7: Attendance Engine
- Beacon Event Processing
- Activity Matching
- PRESENT / LATE
- Duplicate Protection
- Manual Check-in

## Phase 8: Dashboard
- Activity Dashboard
- Attendance Table
- Student Management
- Beacon Management

## Phase 9: Reports
- Summary
- CSV/Excel Export

## Phase 10: Hardening
- Tests
- Security
- Audit
- Validation
- Error Handling
- Performance
- Documentation

---

# 59. Recommended Repository Structure

สามารถใช้ Monorepo:

```text
line-beacon-attendance/
│
├── apps/
│   ├── web/
│   │   └── Nuxt
│   │
│   └── api/
│       └── NestJS
│
├── docker/
│
├── docs/
│
├── docker-compose.yml
├── .env.example
└── README.md
```

หากไม่ต้องการ Monorepo สามารถแยก Frontend / Backend ได้ แต่ต้องรักษา API Contract ให้ชัดเจน

---

# 60. Definition of Done

Feature ถือว่าเสร็จเมื่อ:

1. Implement ตาม Requirement
2. Validate Input
3. Handle Error
4. Permission ถูกต้อง
5. ไม่มี Duplicate Data ที่ไม่ควรเกิด
6. Test ที่เกี่ยวข้องผ่าน
7. Lint ผ่าน
8. Build ผ่าน
9. Critical Flow ใช้งานได้
10. ไม่แก้ Scope ที่ไม่เกี่ยวข้องโดยไม่จำเป็น

---

# 61. MVP Completion Criteria

ระบบ MVP เต็มรูปแบบถือว่าใช้งานได้เมื่อสามารถทำ Flow นี้สำเร็จ:

```text
Admin imports student data
        |
        v
Student links LINE account
        |
        v
Admin registers Beacon
        |
        v
Organizer creates Activity
        |
        v
Organizer links Beacon
        |
        v
Organizer publishes Activity
        |
        v
Student enters Beacon area
        |
        v
LINE sends Beacon Webhook
        |
        v
Backend identifies Student
        |
        v
Backend identifies Activity
        |
        v
Attendance created
        |
        v
LINE notification sent
        |
        v
Organizer sees attendance on Dashboard
        |
        v
Organizer exports report
```

---

# 62. Non-Goals for Initial Version

ยังไม่ต้องทำ:

- GPS Verification
- Face Recognition
- QR Code Attendance
- Payment
- Multi-Tenant
- Parent Account
- Public Event Registration
- Ticketing
- Complex Approval Workflow
- Advanced Analytics
- Machine Learning
- Mobile Native Application

สามารถต่อยอดภายหลังได้

---

# 63. Future Enhancements

อนาคตสามารถเพิ่ม:

- หน้า Activities / Upcoming Activities เพิ่มเติมใน LIFF (พร้อม `GET /me/activities`)
- QR Code Fallback
- Event Registration
- Activity Capacity
- Activity Approval
- Certificate
- Student Point System
- Required Activity Hours
- LINE Flex Message
- Announcement
- Push Notification
- Multi-Beacon Zone
- Check-out / Leave Tracking
- Attendance Analytics
- Department Activity Calendar
- SSO ของมหาวิทยาลัย
- Student Information System Integration

---

# 64. Instructions for Codex

เมื่อพัฒนาระบบนี้:

1. อ่าน Requirement ทั้งหมดก่อนแก้ Code
2. ทำงานเฉพาะ Scope ที่ได้รับมอบหมาย
3. อย่าเพิ่ม Feature ที่ Requirement ไม่ได้กำหนดโดยไม่จำเป็น
4. รักษา Architecture และ Separation of Concerns
5. Controller ต้องบาง
6. Business Logic อยู่ใน Service
7. Database Constraint ต้องใช้ร่วมกับ Application Validation
8. Webhook Processing ต้อง Idempotent เท่าที่ทำได้
9. Attendance ห้าม Duplicate
10. Security ของ LINE Webhook และ Authentication เป็น Requirement บังคับ
11. ทุก Manual Attendance Change ต้อง Trace ได้
12. ทุก Critical Beacon Event ต้องมี Log
13. ห้ามทำ Notification Failure แล้วลบ Attendance ที่สร้างสำเร็จ
14. ใช้ Transaction เฉพาะจุดที่จำเป็น
15. หลัง Implement ให้ Run:
    - lint
    - typecheck
    - unit tests
    - integration tests ที่เกี่ยวข้อง
    - build
16. หากพบ Error ให้แก้และ Run ซ้ำจนผ่าน
17. ห้าม Refactor ส่วนที่ไม่เกี่ยวข้องโดยไม่มีเหตุผล
18. หาก Requirement ขัดกัน ให้ยึด Core Business Rules ในเอกสารนี้เป็นหลัก

---

# 65. Core Project Summary

ระบบนี้คือ:

> ระบบจัดการกิจกรรมภายในสาขาที่ใช้ LINE Beacon ตรวจจับการเข้าสู่พื้นที่ของนักศึกษา เชื่อม LINE Account กับข้อมูลนักศึกษา บันทึก Attendance อัตโนมัติตามช่วงเวลาของกิจกรรม ส่งผลการเช็คชื่อผ่าน LINE และให้ผู้จัดกิจกรรมจัดการกิจกรรม รายชื่อผู้เข้าร่วม และรายงานผ่าน Web Dashboard

Actors:

```text
Student
Organizer
Administrator
```

Core Components:

```text
LINE Official Account
LINE Login / LIFF
LINE Beacon
LINE Messaging API
Nuxt Web Dashboard
NestJS Backend
PostgreSQL
Prisma
```

Core Principle:

```text
Beacon Event != Attendance

Beacon Event
    |
    v
Beacon Log
    |
    v
Validate User + Beacon + Activity + Time
    |
    v
Attendance
```

ต้องแยก `Beacon Logs` ออกจาก `Attendance` เสมอ เพื่อให้ระบบสามารถตรวจสอบย้อนหลัง ป้องกันข้อมูลซ้ำ และต่อยอดได้ง่าย
