<script setup lang="ts">
// Status → Thai label + semantic color (design doc §6.2). Always a text label
// with the color, never color alone. Unknown statuses fall back to a neutral
// badge with the raw value so new backend statuses still render.
const props = defineProps<{
  status: string
}>()

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'

const STATUS_CONFIG: Record<string, { label: string; color: BadgeColor }> = {
  // Student / Beacon
  ACTIVE: { label: 'ใช้งาน', color: 'success' },
  INACTIVE: { label: 'ปิดใช้งาน', color: 'neutral' },
  MAINTENANCE: { label: 'ซ่อมบำรุง', color: 'warning' },
  // Beacon log processing (spec §18)
  RECEIVED: { label: 'รับเข้าแล้ว', color: 'info' },
  PROCESSED: { label: 'ประมวลผลแล้ว', color: 'success' },
  DUPLICATE: { label: 'อีเวนต์ซ้ำ', color: 'neutral' },
  UNKNOWN_USER: { label: 'ไม่พบผู้ใช้', color: 'warning' },
  UNKNOWN_BEACON: { label: 'ไม่พบบีคอน', color: 'warning' },
  NO_ACTIVE_ACTIVITY: { label: 'ไม่มีกิจกรรมเปิดรับ', color: 'neutral' },
  OUTSIDE_CHECKIN_WINDOW: { label: 'นอกเวลาเช็คชื่อ', color: 'warning' },
  ERROR: { label: 'ผิดพลาด', color: 'error' },
  // Attendance (§6.2)
  PRESENT: { label: 'เข้าร่วม', color: 'success' },
  LATE: { label: 'มาสาย', color: 'warning' },
  ABSENT: { label: 'ขาด', color: 'neutral' },
  EXCUSED: { label: 'ลา', color: 'info' },
  // Activity (§6.2)
  DRAFT: { label: 'ฉบับร่าง', color: 'neutral' },
  PUBLISHED: { label: 'เผยแพร่', color: 'success' },
  CANCELLED: { label: 'ยกเลิก', color: 'error' },
  // Activity time state (computed, spec §12)
  UPCOMING: { label: 'ยังไม่เริ่ม', color: 'info' },
  CHECKIN_OPEN: { label: 'เปิดเช็คชื่อ', color: 'success' },
  ONGOING: { label: 'กำลังดำเนินการ', color: 'primary' },
  COMPLETED: { label: 'จบแล้ว', color: 'neutral' },
}

const config = computed(() => STATUS_CONFIG[props.status] ?? { label: props.status, color: 'neutral' as BadgeColor })
</script>

<template>
  <UBadge :color="config.color" variant="subtle" :label="config.label" />
</template>
