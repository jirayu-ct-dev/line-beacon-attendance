<script setup lang="ts">
import type { MyActivityItem } from '~/utils/api'
import type { Paginated } from '~/utils/api'

/**
 * Student activities list (spec §21/§63 — pulled forward from the future
 * phase by the project owner, on the GET /me/activities endpoint spec §35
 * reserved for it). PUBLISHED activities only, newest start first, with the
 * caller's own attendance merged per item.
 */
definePageMeta({ layout: 'liff' })

const PAGE_SIZE = 10

const { token } = useLiffSession()
const { request } = useLiffApi()
const toast = useToast()

const activities = ref<MyActivityItem[]>([])
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
    const res = await request<Paginated<MyActivityItem>>('/me/activities', {
      token: token.value,
      query: { page: 1, pageSize: PAGE_SIZE },
    })
    activities.value = res.items
    total.value = res.total
    page.value = 1
  } catch {
    loadError.value = 'โหลดรายการกิจกรรมไม่สำเร็จ กรุณาลองอีกครั้ง'
  } finally {
    loading.value = false
  }
}

const loadMore = async (): Promise<void> => {
  if (loadingMore.value || !token.value || activities.value.length >= total.value) return
  loadingMore.value = true
  try {
    const res = await request<Paginated<MyActivityItem>>('/me/activities', {
      token: token.value,
      query: { page: page.value + 1, pageSize: PAGE_SIZE },
    })
    activities.value.push(...res.items)
    total.value = res.total
    page.value += 1
  } catch {
    // Keep what is already shown; the button stays for another try.
    toast.add({ title: 'โหลดเพิ่มไม่สำเร็จ กรุณาลองอีกครั้ง', color: 'error', icon: 'lucide:circle-alert' })
  } finally {
    loadingMore.value = false
  }
}

watch(token, () => { if (token.value) void load() }, { immediate: true })
</script>

<template>
  <LiffPageGate require-linked>
    <h1 class="mb-4 text-base font-semibold text-highlighted">กิจกรรม</h1>

    <!-- loading -->
    <div v-if="loading" class="flex flex-col gap-3" role="status" aria-label="กำลังโหลดรายการกิจกรรม">
      <USkeleton v-for="n in 3" :key="n" class="h-24 w-full" />
    </div>

    <!-- error -->
    <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:circle-alert" class="size-8 text-error" aria-hidden="true" />
      <p class="text-sm text-muted">{{ loadError }}</p>
      <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองใหม่" @click="load" />
    </div>

    <!-- empty -->
    <div v-else-if="activities.length === 0" class="flex flex-col items-center gap-3 py-12 text-center">
      <Icon name="lucide:calendar-days" class="size-8 text-muted" aria-hidden="true" />
      <p class="text-sm text-muted">ยังไม่มีกิจกรรมที่เปิดเผยแพร่</p>
    </div>

    <!-- list -->
    <template v-else>
      <ul class="flex flex-col gap-3">
        <li v-for="activity in activities" :key="activity.id">
          <NuxtLink
            :to="`/liff/activities/${activity.id}`"
            class="flex flex-col gap-2 rounded-lg border border-default bg-default p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <p class="min-w-0 font-medium text-highlighted">{{ activity.name }}</p>
              <StatusBadge :status="activity.timeState" />
            </div>
            <div class="flex flex-col gap-0.5 text-sm text-muted">
              <p>{{ formatDate(activity.startAt) }}</p>
              <p v-if="activity.location" class="flex items-center gap-1.5">
                <Icon name="lucide:map-pin" class="size-4 shrink-0" aria-hidden="true" />
                {{ activity.location }}
              </p>
            </div>
            <p v-if="activity.myAttendance" class="flex items-center gap-1.5 text-xs font-medium text-success">
              <Icon name="lucide:circle-check" class="size-4 shrink-0" aria-hidden="true" />
              เช็คชื่อแล้ว
            </p>
          </NuxtLink>
        </li>
      </ul>

      <UButton
        v-if="activities.length < total"
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
