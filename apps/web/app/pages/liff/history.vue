<script setup lang="ts">
import type { AttendanceItem, Paginated } from '~/utils/api'

/**
 * The caller's own attendance history (spec §21 "ดูประวัติการเข้าร่วมกิจกรรม"),
 * moved out of the profile page into its own nav destination. Every row links
 * to the activity detail.
 */
definePageMeta({ layout: 'liff' })

const PAGE_SIZE = 10

const { token } = useLiffSession()
const { request } = useLiffApi()
const toast = useToast()

const attendances = ref<AttendanceItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const loadError = ref<string | null>(null)
const loadingMore = ref(false)

const load = async (): Promise<void> => {
  if (!token.value) return
  loading.value = true
  loadError.value = null
  try {
    const res = await request<Paginated<AttendanceItem>>('/me/attendances', {
      token: token.value,
      query: { page: 1, pageSize: PAGE_SIZE },
    })
    attendances.value = res.items
    total.value = res.total
    page.value = 1
  } catch {
    loadError.value = 'โหลดประวัติการเช็คชื่อไม่สำเร็จ กรุณาลองอีกครั้ง'
  } finally {
    loading.value = false
  }
}

const loadMore = async (): Promise<void> => {
  if (loadingMore.value || !token.value || attendances.value.length >= total.value) return
  loadingMore.value = true
  try {
    const res = await request<Paginated<AttendanceItem>>('/me/attendances', {
      token: token.value,
      query: { page: page.value + 1, pageSize: PAGE_SIZE },
    })
    attendances.value.push(...res.items)
    total.value = res.total
    page.value += 1
  } catch {
    toast.add({ title: 'โหลดเพิ่มไม่สำเร็จ กรุณาลองอีกครั้ง', color: 'error', icon: 'lucide:circle-alert' })
  } finally {
    loadingMore.value = false
  }
}

watch(token, () => { if (token.value) void load() }, { immediate: true })
</script>

<template>
  <LiffPageGate require-linked>
    <h1 class="mb-4 text-base font-semibold text-highlighted">ประวัติการเช็คชื่อ</h1>

    <!-- loading -->
    <div v-if="loading" class="flex flex-col gap-3" role="status" aria-label="กำลังโหลดประวัติการเช็คชื่อ">
      <USkeleton v-for="n in 3" :key="n" class="h-16 w-full" />
    </div>

    <!-- error -->
    <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:circle-alert" class="size-8 text-error" aria-hidden="true" />
      <p class="text-sm text-muted">{{ loadError }}</p>
      <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองใหม่" @click="load" />
    </div>

    <!-- empty -->
    <div v-else-if="attendances.length === 0" class="flex flex-col items-center gap-3 py-12 text-center">
      <Icon name="lucide:calendar-check" class="size-8 text-muted" aria-hidden="true" />
      <p class="text-sm text-muted">ยังไม่มีประวัติการเช็คชื่อ</p>
    </div>

    <!-- list -->
    <template v-else>
      <ul class="flex flex-col gap-3">
        <li v-for="attendance in attendances" :key="attendance.id">
          <NuxtLink
            :to="`/liff/activities/${attendance.activityId}`"
            class="flex items-start justify-between gap-3 rounded-lg border border-default bg-default p-4"
          >
            <div class="min-w-0">
              <p class="font-medium text-highlighted">{{ attendance.activityName }}</p>
              <p class="mt-0.5 text-sm text-muted">เช็คชื่อเมื่อ {{ formatDateTime(attendance.checkInAt) }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <StatusBadge :status="attendance.status" />
              <Icon name="lucide:chevron-right" class="size-4 text-muted" aria-hidden="true" />
            </div>
          </NuxtLink>
        </li>
      </ul>

      <UButton
        v-if="attendances.length < total"
        block
        color="neutral"
        variant="outline"
        icon="lucide:chevron-down"
        label="โหลดเพิ่ม"
        class="mt-4"
        :loading="loadingMore"
        :disabled="loadingMore"
        @click="loadMore"
      />
    </template>
  </LiffPageGate>
</template>
