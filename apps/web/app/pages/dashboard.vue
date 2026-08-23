<script setup lang="ts">
import type { ApiEnvelope, DashboardStats } from '~/utils/api'

definePageMeta({ middleware: 'auth' })

const { user } = useAuth()
const nuxtApp = useNuxtApp()

const roleLabel = computed(() => (user.value?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'ผู้จัดกิจกรรม'))

const stats = ref<DashboardStats | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)

const fetchDashboard = async (): Promise<void> => {
  try {
    const res = await nuxtApp.$api<ApiEnvelope<DashboardStats>>('/dashboard')
    stats.value = res.data
    loadError.value = null
  } catch (error) {
    loadError.value = getApiErrorMessage(error, 'โหลดข้อมูลภาพรวมไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    loading.value = false
  }
}

onMounted(fetchDashboard)

// The open-check-in list is the live section — refresh it every 30s
// (design doc §6.3). Pauses when the tab is hidden.
let refreshTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void fetchDashboard()
  }, 30_000)
})
onUnmounted(() => clearInterval(refreshTimer))

const statCards = computed(() => [
  {
    label: 'กิจกรรมวันนี้',
    value: stats.value?.today.activities ?? 0,
    icon: 'lucide:calendar-check',
  },
  {
    label: 'ผู้เข้าร่วมวันนี้',
    value: stats.value?.today.checkins ?? 0,
    icon: 'lucide:user-check',
  },
  {
    label: 'เข้าร่วม (Present)',
    value: stats.value?.today.present ?? 0,
    icon: 'lucide:circle-check',
  },
  {
    label: 'มาสาย (Late)',
    value: stats.value?.today.late ?? 0,
    icon: 'lucide:clock-alert',
  },
  {
    label: 'กิจกรรมทั้งหมด',
    value: stats.value?.totalActivities ?? 0,
    icon: 'lucide:calendar-days',
  },
])
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="ภาพรวม" subtitle="สรุปกิจกรรมและการเช็คชื่อล่าสุดของสาขา" />

    <UCard>
      <div class="flex items-center gap-4">
        <div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon name="lucide:circle-user" class="size-6 text-primary" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-highlighted">ยินดีต้อนรับ{{ user ? `, ${user.username}` : '' }}</p>
          <p class="text-sm text-muted">
            บทบาท: {{ roleLabel }}<span v-if="user"> · {{ user.email }}</span>
          </p>
        </div>
      </div>
    </UCard>

    <div v-if="loading" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" role="status" aria-label="กำลังโหลดสถิติ">
      <USkeleton v-for="n in 5" :key="n" class="h-24" />
    </div>

    <UCard v-else-if="loadError">
      <div class="flex flex-col items-center gap-3 py-8 text-center">
        <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
        <p class="text-sm text-muted">{{ loadError }}</p>
        <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองอีกครั้ง" @click="fetchDashboard" />
      </div>
    </UCard>

    <template v-else-if="stats">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <UCard v-for="card in statCards" :key="card.label">
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-sm text-muted">{{ card.label }}</span>
              <span class="text-3xl font-semibold text-highlighted">{{ card.value }}</span>
            </div>
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon :name="card.icon" class="size-5 text-primary" aria-hidden="true" />
            </div>
          </div>
        </UCard>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <UCard>
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-base font-semibold text-highlighted">กิจกรรมที่กำลังเปิดเช็คชื่อ</h2>
            <span class="inline-flex items-center gap-1.5 text-xs text-muted">
              <Icon name="lucide:refresh-cw" class="size-3.5" aria-hidden="true" />
              อัปเดตอัตโนมัติทุก 30 วินาที
            </span>
          </div>

          <ul v-if="stats.openCheckinActivities.length > 0" class="mt-4 flex flex-col divide-y divide-default">
            <li
              v-for="activity in stats.openCheckinActivities"
              :key="activity.id"
              class="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div class="flex min-w-0 flex-col gap-0.5">
                <NuxtLink
                  :to="`/activities/${activity.id}`"
                  class="truncate text-sm font-medium text-highlighted hover:underline"
                >
                  {{ activity.name }}
                </NuxtLink>
                <span class="text-xs text-muted">
                  ปิดเช็คชื่อ {{ formatDateTime(activity.checkinCloseAt) }}
                </span>
              </div>
              <div class="flex shrink-0 items-center gap-2 text-xs">
                <UBadge color="success" variant="subtle">เข้าร่วม {{ activity.present }}</UBadge>
                <UBadge color="warning" variant="subtle">มาสาย {{ activity.late }}</UBadge>
              </div>
            </li>
          </ul>
          <p v-else class="mt-4 text-sm text-muted">ขณะนี้ไม่มีกิจกรรมที่เปิดรับเช็คชื่อ</p>
        </UCard>

        <UCard>
          <h2 class="text-base font-semibold text-highlighted">กิจกรรมล่าสุด</h2>
          <ul v-if="stats.recentActivities.length > 0" class="mt-4 flex flex-col divide-y divide-default">
            <li
              v-for="activity in stats.recentActivities"
              :key="activity.id"
              class="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div class="flex min-w-0 flex-col gap-0.5">
                <NuxtLink
                  :to="`/activities/${activity.id}`"
                  class="truncate text-sm font-medium text-highlighted hover:underline"
                >
                  {{ activity.name }}
                </NuxtLink>
                <span class="text-xs text-muted">เริ่ม {{ formatDateTime(activity.startAt) }}</span>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <StatusBadge :status="activity.status" />
                <StatusBadge :status="activity.timeState" />
              </div>
            </li>
          </ul>
          <p v-else class="mt-4 text-sm text-muted">ยังไม่มีกิจกรรม — สร้างกิจกรรมแรกได้จากหน้ากิจกรรม</p>
        </UCard>
      </div>
    </template>
  </div>
</template>
