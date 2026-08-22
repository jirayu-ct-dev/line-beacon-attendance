<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ApiEnvelope, Beacon } from '~/utils/api'

// Profile + edit (reuses BeaconFormDialog) + a link to this beacon's webhook
// logs for debugging (spec §18 — organizers see logs per activity in Phase 6).
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const nuxtApp = useNuxtApp()
const toast = useToast()
const { user } = useAuth()
const { confirm } = useConfirm()

// Mutations and the logs link (admin page) are admin-only (spec §13).
const canManage = computed(() => user.value?.role !== 'ORGANIZER')

const beacon = ref<Beacon | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const notFound = ref(false)

const fetchBeacon = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Beacon>>(`/beacons/${route.params.id}`)
    beacon.value = res.data
    notFound.value = false
  } catch (error) {
    const fetchError = error as FetchError
    notFound.value = fetchError?.status === 404
    beacon.value = null
    if (!notFound.value) {
      loadError.value = getApiErrorMessage(error, 'โหลดข้อมูลบีคอนไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchBeacon)

const editOpen = ref(false)

const infoRows = computed(() => [
  { label: 'HWID', value: beacon.value?.hwid ?? '' },
  { label: 'สถานที่', value: beacon.value?.location || '—' },
  { label: 'คำอธิบาย', value: beacon.value?.description || '—' },
  { label: 'สร้างเมื่อ', value: beacon.value ? formatDateTime(beacon.value.createdAt) : '' },
  { label: 'อัปเดตล่าสุด', value: beacon.value ? formatDateTime(beacon.value.updatedAt) : '' },
])

// --- enable / disable (the project's "delete" — spec §35) ----------------------

const updating = ref(false)

const setStatus = async (target: 'ACTIVE' | 'INACTIVE'): Promise<void> => {
  if (!beacon.value || updating.value) return
  const disabling = target === 'INACTIVE'
  const confirmed = await confirm({
    title: disabling ? 'ปิดใช้งานบีคอน' : 'เปิดใช้งานบีคอน',
    description: disabling
      ? `${beacon.value.name} (${beacon.value.hwid}) จะไม่ถูกใช้เช็คชื่อจนกว่าจะเปิดใช้งานอีกครั้ง`
      : `${beacon.value.name} (${beacon.value.hwid}) จะกลับมาถูกใช้เช็คชื่อได้ตามปกติ`,
    confirmText: disabling ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
    tone: disabling ? 'error' : 'default',
  })
  if (!confirmed) return
  updating.value = true
  try {
    await nuxtApp.$api<ApiEnvelope<Beacon>>(`/beacons/${beacon.value.id}/${disabling ? 'disable' : 'enable'}`, {
      method: 'POST',
    })
    toast.add({
      title: disabling ? 'ปิดใช้งานบีคอนสำเร็จ' : 'เปิดใช้งานบีคอนสำเร็จ',
      color: 'success',
      icon: 'lucide:circle-check',
    })
    await fetchBeacon()
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    updating.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="รายละเอียดบีคอน">
      <template #actions>
        <UButton
          v-if="canManage && beacon"
          :to="{ path: '/admin/beacon-logs', query: { hwid: beacon.hwid } }"
          color="neutral"
          variant="outline"
          icon="lucide:scroll-text"
          label="ดู Beacon Logs"
        />
        <UButton to="/beacons" color="neutral" variant="outline" icon="lucide:arrow-left" label="กลับไปรายการ" />
      </template>
    </PageHeader>

    <div v-if="loading" class="flex flex-col gap-4" role="status" aria-label="กำลังโหลดข้อมูล">
      <USkeleton class="h-8 w-64" />
      <USkeleton class="h-40 w-full" />
    </div>

    <UCard v-else-if="notFound" class="py-16">
      <div class="flex flex-col items-center gap-3 text-center">
        <Icon name="lucide:search-x" class="size-10 text-muted" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่พบบีคอน</h2>
        <p class="text-sm text-muted">รายการบีคอนนี้อาจถูกลบไปแล้ว หรือรหัสอ้างอิงไม่ถูกต้อง</p>
        <UButton to="/beacons" color="neutral" variant="outline" icon="lucide:arrow-left" label="กลับไปรายการ" />
      </div>
    </UCard>

    <UCard v-else-if="loadError">
      <div class="flex flex-col items-center gap-3 py-10 text-center">
        <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
        <p class="text-sm text-muted">{{ loadError }}</p>
        <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองอีกครั้ง" @click="fetchBeacon" />
      </div>
    </UCard>

    <template v-else-if="beacon">
      <UCard>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <h2 class="text-lg font-semibold text-highlighted">{{ beacon.name }}</h2>
            <p class="font-mono text-sm text-muted">{{ beacon.hwid }}</p>
          </div>
          <div class="flex items-center gap-2">
            <StatusBadge :status="beacon.status" />
            <template v-if="canManage">
              <UButton
                icon="lucide:pencil"
                color="neutral"
                variant="outline"
                label="แก้ไข"
                :disabled="updating"
                @click="editOpen = true"
              />
              <UButton
                v-if="beacon.status === 'ACTIVE'"
                icon="lucide:circle-off"
                color="error"
                variant="outline"
                label="ปิดใช้งาน"
                :disabled="updating"
                @click="setStatus('INACTIVE')"
              />
              <UButton
                v-else
                icon="lucide:circle-check"
                color="success"
                variant="outline"
                label="เปิดใช้งาน"
                :disabled="updating"
                @click="setStatus('ACTIVE')"
              />
            </template>
          </div>
        </div>

        <dl class="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div v-for="row in infoRows" :key="row.label" class="flex flex-col gap-1">
            <dt class="text-sm text-muted">{{ row.label }}</dt>
            <dd class="text-sm font-medium text-highlighted">{{ row.value }}</dd>
          </div>
        </dl>
      </UCard>

      <BeaconFormDialog v-model:open="editOpen" :beacon="beacon" @saved="fetchBeacon" />
    </template>
  </div>
</template>
