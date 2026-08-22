<script setup lang="ts">
// Status → Thai label + semantic color (design doc §6.2). Always a text label
// with the color, never color alone. Unknown statuses fall back to a neutral
// badge with the raw value so new backend statuses still render.
const props = defineProps<{
  status: string
}>()

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'

const STATUS_CONFIG: Record<string, { label: string; color: BadgeColor }> = {
  // Student
  ACTIVE: { label: 'ใช้งาน', color: 'success' },
  INACTIVE: { label: 'ปิดใช้งาน', color: 'neutral' },
  // Attendance (§6.2)
  PRESENT: { label: 'เข้าร่วม', color: 'success' },
  LATE: { label: 'มาสาย', color: 'warning' },
  ABSENT: { label: 'ขาด', color: 'neutral' },
  EXCUSED: { label: 'ลา', color: 'info' },
  // Activity (§6.2)
  DRAFT: { label: 'ฉบับร่าง', color: 'neutral' },
  PUBLISHED: { label: 'เผยแพร่', color: 'success' },
  CANCELLED: { label: 'ยกเลิก', color: 'error' },
}

const config = computed(() => STATUS_CONFIG[props.status] ?? { label: props.status, color: 'neutral' as BadgeColor })
</script>

<template>
  <UBadge :color="config.color" variant="subtle" :label="config.label" />
</template>
