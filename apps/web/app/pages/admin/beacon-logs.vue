<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { TableColumn } from '@nuxt/ui'
import type { ApiEnvelope, BeaconLog, BeaconLogDetail, Paginated } from '~/utils/api'

// Admin-only beacon-log viewer (spec §18, §26) for debugging and audit.
definePageMeta({ middleware: 'auth' })

const nuxtApp = useNuxtApp()
const searchId = useId()
const hwidId = useId()
const fromId = useId()
const toId = useId()

const table = useDataTable({
  filters: { status: '', hwid: '', from: '', to: '' },
  defaultSort: 'created_at',
  defaultOrder: 'desc',
})

const items = ref<BeaconLog[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref<string | null>(null)
const forbidden = ref(false)

// The API is the authority (spec §4.3): organizers get 403 and see an
// informative state instead of a broken table.
const fetchLogs = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    // from/to are date inputs — widen them to full UTC days for the event-
    // timestamp range filter (spec §46).
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<BeaconLog>>>('/beacon-logs', {
      query: {
        ...table.queryParams.value,
        ...(table.filters.from && { from: `${table.filters.from}T00:00:00.000Z` }),
        ...(table.filters.to && { to: `${table.filters.to}T23:59:59.999Z` }),
      },
    })
    items.value = res.data.items
    total.value = res.data.total
    forbidden.value = false
  } catch (error) {
    const fetchError = error as FetchError
    if (fetchError?.status === 403) {
      forbidden.value = true
      items.value = []
      total.value = 0
    } else {
      loadError.value = getApiErrorMessage(error, 'โหลดรายการบันทึกบีคอนไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchLogs)
watch(() => table.queryParams.value, () => void fetchLogs())

// --- table -------------------------------------------------------------------

const sortIcon = (field: string): string =>
  table.sort.value !== field
    ? 'lucide:chevrons-up-down'
    : table.order.value === 'asc'
      ? 'lucide:arrow-up-narrow-wide'
      : 'lucide:arrow-down-wide-narrow'

const sortAriaLabel = (label: string, field: string): string =>
  table.sort.value !== field
    ? `เรียงตาม${label}`
    : `เรียงตาม${label} (${table.order.value === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'})`

const EVENT_TYPE_LABELS: Record<string, string> = {
  enter: 'เข้าพื้นที่',
  stay: 'อยู่ในพื้นที่',
  banner: 'แบนเนอร์',
}

const columns: TableColumn<BeaconLog>[] = [
  { accessorKey: 'eventTimestamp', header: 'เวลาที่เกิดเหตุการณ์' },
  { accessorKey: 'hwid', header: 'HWID' },
  { id: 'student', header: 'นักศึกษา' },
  { id: 'beacon', header: 'บีคอน' },
  { accessorKey: 'eventType', header: 'เหตุการณ์' },
  { accessorKey: 'processingStatus', header: 'สถานะ' },
  { accessorKey: 'createdAt', header: 'เวลาที่รับ' },
  { id: 'actions', header: 'จัดการ' },
]

// reka-ui does not allow empty-string item values; 'all' is the unset sentinel
// mapped to an empty filter value.
const ALL = 'all'
const toFilterValue = (value: string | undefined): string => (value == null || value === ALL ? '' : value)
const fromFilterValue = (value: string | undefined): string => (value == null || value === '' ? ALL : value)

const statusItems = [
  { label: 'ทุกสถานะ', value: ALL },
  { label: 'รับเข้าแล้ว', value: 'RECEIVED' },
  { label: 'ประมวลผลแล้ว', value: 'PROCESSED' },
  { label: 'อีเวนต์ซ้ำ', value: 'DUPLICATE' },
  { label: 'ไม่พบผู้ใช้', value: 'UNKNOWN_USER' },
  { label: 'ไม่พบบีคอน', value: 'UNKNOWN_BEACON' },
  { label: 'ไม่มีกิจกรรมเปิดรับ', value: 'NO_ACTIVE_ACTIVITY' },
  { label: 'นอกเวลาเช็คชื่อ', value: 'OUTSIDE_CHECKIN_WINDOW' },
  { label: 'ผิดพลาด', value: 'ERROR' },
]

// --- detail (raw payload per spec §18) ----------------------------------------

const detailOpen = ref(false)
const detail = ref<BeaconLogDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const selectedLog = ref<BeaconLog | null>(null)

const openDetail = async (log: BeaconLog): Promise<void> => {
  selectedLog.value = log
  detailOpen.value = true
  await loadDetail()
}

const loadDetail = async (): Promise<void> => {
  if (!selectedLog.value) return
  detailLoading.value = true
  detailError.value = null
  detail.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<BeaconLogDetail>>(`/beacon-logs/${selectedLog.value.id}`)
    detail.value = res.data
  } catch (error) {
    detailError.value = getApiErrorMessage(error, 'โหลดรายละเอียดไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    detailLoading.value = false
  }
}

const detailRows = computed(() =>
  detail.value
    ? [
        { label: 'Webhook Event ID', value: detail.value.webhookEventId },
        { label: 'LINE User ID', value: detail.value.lineUserId },
        { label: 'นักศึกษา', value: detail.value.student ? `${detail.value.student.studentCode} (${detail.value.student.name})` : '—' },
        { label: 'บีคอน', value: detail.value.beacon?.name ?? '— (ไม่ได้ลงทะเบียน)' },
        { label: 'HWID', value: detail.value.hwid },
        { label: 'เหตุการณ์', value: EVENT_TYPE_LABELS[detail.value.eventType] ?? detail.value.eventType },
        { label: 'เวลาที่เกิดเหตุการณ์', value: formatDateTime(detail.value.eventTimestamp) },
        { label: 'เวลาที่รับ', value: formatDateTime(detail.value.createdAt) },
      ]
    : [],
)

const rawPayloadText = computed(() =>
  detail.value ? JSON.stringify(detail.value.rawPayload, null, 2) : '',
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Beacon Logs"
      subtitle="บันทึกเหตุการณ์บีคอนทุกเหตุการณ์ที่ได้รับจาก LINE เพื่อการดีบั๊กและตรวจสอบย้อนหลัง"
    />

    <UCard v-if="forbidden" class="py-16">
      <div class="flex flex-col items-center gap-3 text-center">
        <Icon name="lucide:shield-x" class="size-10 text-error" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่มีสิทธิ์เข้าถึง</h2>
        <p class="max-w-md text-sm text-muted">
          การดู Beacon Logs เปิดให้ผู้ดูแลระบบ (Admin) เท่านั้น
          หากคุณควรมีสิทธิ์ในส่วนนี้ กรุณาติดต่อผู้ดูแลระบบของสาขา
        </p>
        <UButton to="/dashboard" color="neutral" variant="outline" icon="lucide:layout-dashboard" label="กลับไปหน้าภาพรวม" />
      </div>
    </UCard>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="flex flex-col gap-1.5">
          <label :for="searchId" class="text-sm font-medium text-highlighted">ค้นหา</label>
          <UInput
            :id="searchId"
            v-model="table.searchInput.value"
            icon="lucide:search"
            placeholder="LINE User ID หรือ Webhook Event ID"
            :disabled="loading"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label :for="hwidId" class="text-sm font-medium text-highlighted">HWID</label>
          <UInput
            :id="hwidId"
            :model-value="table.filters.hwid"
            placeholder="เช่น 32af519e88"
            class="font-mono"
            :disabled="loading"
            @update:model-value="(value: string | undefined) => table.setFilter('hwid', value ?? '')"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-highlighted">สถานะ</span>
          <USelect
            :model-value="fromFilterValue(table.filters.status)"
            :items="statusItems"
            aria-label="กรองตามสถานะการประมวลผล"
            :disabled="loading"
            @update:model-value="(value: string | undefined) => table.setFilter('status', toFilterValue(value))"
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1.5">
            <label :for="fromId" class="text-sm font-medium text-highlighted">จากวันที่</label>
            <UInput
              :id="fromId"
              :model-value="table.filters.from"
              type="date"
              :disabled="loading"
              @update:model-value="(value: string | undefined) => table.setFilter('from', value ?? '')"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label :for="toId" class="text-sm font-medium text-highlighted">ถึงวันที่</label>
            <UInput
              :id="toId"
              :model-value="table.filters.to"
              type="date"
              :disabled="loading"
              @update:model-value="(value: string | undefined) => table.setFilter('to', value ?? '')"
            />
          </div>
        </div>
      </div>

      <DataTable
        :data="items"
        :columns="columns"
        :loading="loading"
        :error="loadError"
        :has-active-filters="table.hasActiveFilters.value"
        :total="total"
        :page="table.page.value"
        :page-size="table.pageSize.value"
        caption="รายการบันทึกเหตุการณ์บีคอน"
        @update:page="table.setPage"
        @update:page-size="table.setPageSize"
        @retry="fetchLogs"
        @clear="table.resetFilters"
      >
        <template #eventTimestamp-header>
          <UButton
            variant="ghost"
            size="sm"
            color="neutral"
            label="เวลาที่เกิดเหตุการณ์"
            :trailing-icon="sortIcon('event_timestamp')"
            :aria-label="sortAriaLabel('เวลาที่เกิดเหตุการณ์', 'event_timestamp')"
            @click="table.sortBy('event_timestamp')"
          />
        </template>

        <template #createdAt-header>
          <UButton
            variant="ghost"
            size="sm"
            color="neutral"
            label="เวลาที่รับ"
            :trailing-icon="sortIcon('created_at')"
            :aria-label="sortAriaLabel('เวลาที่รับ', 'created_at')"
            @click="table.sortBy('created_at')"
          />
        </template>

        <template #eventTimestamp-cell="{ row }">
          {{ formatDateTime(row.original.eventTimestamp) }}
        </template>

        <template #hwid-cell="{ row }">
          <span class="font-mono text-sm">{{ row.original.hwid }}</span>
        </template>

        <template #student-cell="{ row }">
          <span v-if="row.original.student">
            {{ row.original.student.studentCode }} ({{ row.original.student.name }})
          </span>
          <span v-else class="text-muted">—</span>
        </template>

        <template #beacon-cell="{ row }">
          <span v-if="row.original.beacon">{{ row.original.beacon.name }}</span>
          <span v-else class="text-muted">—</span>
        </template>

        <template #eventType-cell="{ row }">
          {{ EVENT_TYPE_LABELS[row.original.eventType] ?? row.original.eventType }}
        </template>

        <template #processingStatus-cell="{ row }">
          <StatusBadge :status="row.original.processingStatus" />
        </template>

        <template #createdAt-cell="{ row }">
          {{ formatDateTime(row.original.createdAt) }}
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end">
            <UButton
              icon="lucide:eye"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`ดูรายละเอียดเหตุการณ์ ${row.original.webhookEventId}`"
              @click="openDetail(row.original)"
            />
          </div>
        </template>
      </DataTable>
    </template>

    <UModal v-model:open="detailOpen" title="รายละเอียดเหตุการณ์บีคอน">
      <template #body>
        <div v-if="detailLoading" role="status" aria-label="กำลังโหลดรายละเอียด">
          <USkeleton class="h-40 w-full" />
        </div>

        <div v-else-if="detailError" class="flex flex-col items-center gap-3 py-8 text-center">
          <Icon name="lucide:circle-alert" class="size-8 text-error" aria-hidden="true" />
          <p class="text-sm text-muted">{{ detailError }}</p>
          <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองอีกครั้ง" @click="loadDetail" />
        </div>

        <div v-else-if="detail" class="flex flex-col gap-6">
          <div class="flex items-center gap-2">
            <StatusBadge :status="detail.processingStatus" />
          </div>

          <dl class="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div v-for="row in detailRows" :key="row.label" class="flex flex-col gap-0.5">
              <dt class="text-xs text-muted">{{ row.label }}</dt>
              <dd class="break-all text-sm font-medium text-highlighted">{{ row.value }}</dd>
            </div>
          </dl>

          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-muted">Raw Payload (ตามที่ได้รับจาก LINE)</span>
            <pre
              class="max-h-64 overflow-auto rounded-md bg-elevated p-3 text-xs text-default"
            >{{ rawPayloadText }}</pre>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
