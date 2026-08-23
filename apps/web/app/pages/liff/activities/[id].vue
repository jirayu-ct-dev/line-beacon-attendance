<script setup lang="ts">
import type { MyActivityItem } from '~/utils/api'
import type { FetchError } from 'ofetch'
import type { ApiErrorEnvelope } from '~/utils/api'

/**
 * Activity detail for students: times, location, check-in window and the
 * caller's own attendance (GET /me/activities/:id). Drafts/cancelled answer
 * 404 — students never see unpublished activities.
 */
definePageMeta({ layout: 'liff' })

const route = useRoute()
const { token } = useLiffSession()
const { request } = useLiffApi()

const activity = ref<MyActivityItem | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const notFound = ref(false)

const load = async (): Promise<void> => {
  if (!token.value) return
  loading.value = true
  loadError.value = null
  notFound.value = false
  try {
    activity.value = await request<MyActivityItem>(`/me/activities/${route.params.id}`, {
      token: token.value,
    })
  } catch (error) {
    const fetchError = error as FetchError<ApiErrorEnvelope>
    if (fetchError?.response?.status === 404) notFound.value = true
    else loadError.value = 'โหลดข้อมูลกิจกรรมไม่สำเร็จ กรุณาลองอีกครั้ง'
  } finally {
    loading.value = false
  }
}

watch(token, () => { if (token.value) void load() }, { immediate: true })

const infoRows = computed(() => {
  if (!activity.value) return []
  return [
    { label: 'สถานที่', value: activity.value.location ?? 'ไม่ระบุ' },
    { label: 'เริ่มกิจกรรม', value: formatDateTime(activity.value.startAt) },
    { label: 'สิ้นสุดกิจกรรม', value: formatDateTime(activity.value.endAt) },
    { label: 'เปิดเช็คชื่อ', value: formatDateTime(activity.value.checkinOpenAt) },
    { label: 'เกณฑ์มาสาย', value: formatDateTime(activity.value.lateAt) },
    { label: 'ปิดเช็คชื่อ', value: formatDateTime(activity.value.checkinCloseAt) },
  ]
})

const checkinMethodLabel = computed(() =>
  activity.value?.myAttendance?.checkinMethod === 'MANUAL' ? 'บันทึกโดยผู้ดูแล' : 'ผ่าน LINE Beacon',
)
</script>

<template>
  <LiffPageGate require-linked>
    <UButton
      to="/liff/activities"
      color="neutral"
      variant="ghost"
      icon="lucide:arrow-left"
      label="กลับไปรายการกิจกรรม"
      class="-ms-3 mb-4"
      :padded="false"
    />

    <!-- loading -->
    <div v-if="loading" class="flex flex-col gap-3" role="status" aria-label="กำลังโหลดข้อมูลกิจกรรม">
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-44 w-full" />
      <USkeleton class="h-24 w-full" />
    </div>

    <!-- not found (unknown / draft / cancelled) -->
    <UCard v-else-if="notFound">
      <div class="flex flex-col items-center gap-3 py-8 text-center">
        <Icon name="lucide:search-x" class="size-10 text-muted" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่พบกิจกรรม</h2>
        <p class="max-w-sm text-sm text-muted">กิจกรรมนี้อาจถูกยกเลิกหรือไม่ได้เปิดเผยแพร่อีกต่อไป</p>
        <UButton to="/liff/activities" color="neutral" variant="outline" icon="lucide:arrow-left" label="กลับไปรายการกิจกรรม" />
      </div>
    </UCard>

    <!-- error -->
    <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:circle-alert" class="size-8 text-error" aria-hidden="true" />
      <p class="text-sm text-muted">{{ loadError }}</p>
      <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองใหม่" @click="load" />
    </div>

    <!-- detail -->
    <template v-else-if="activity">
      <div class="mb-4 flex items-start justify-between gap-3">
        <h1 class="text-lg font-bold text-highlighted">{{ activity.name }}</h1>
        <StatusBadge :status="activity.timeState" />
      </div>

      <p v-if="activity.description" class="mb-4 text-sm text-muted">{{ activity.description }}</p>

      <UCard>
        <h2 class="mb-4 text-base font-semibold text-highlighted">รายละเอียด</h2>
        <dl class="grid gap-x-6 gap-y-3">
          <div v-for="row in infoRows" :key="row.label" class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted">{{ row.label }}</dt>
            <dd class="font-medium text-highlighted">{{ row.value }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard class="mt-4">
        <h2 class="mb-4 text-base font-semibold text-highlighted">การเช็คชื่อของฉัน</h2>

        <div v-if="activity.myAttendance" class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm text-muted">เช็คชื่อเมื่อ {{ formatDateTime(activity.myAttendance.checkInAt) }}</p>
            <p class="mt-0.5 text-sm text-muted">{{ checkinMethodLabel }}</p>
          </div>
          <StatusBadge :status="activity.myAttendance.status" />
        </div>

        <div v-else class="flex items-start gap-3">
          <Icon name="lucide:radio" class="size-5 shrink-0 text-muted" aria-hidden="true" />
          <p class="text-sm text-muted">
            ยังไม่ได้เช็คชื่อกิจกรรมนี้ — ระบบจะเช็คชื่อให้อัตโนมัติเมื่อคุณอยู่ใกล้บีคอนในช่วงเวลาเช็คชื่อ
          </p>
        </div>
      </UCard>
    </template>
  </LiffPageGate>
</template>
