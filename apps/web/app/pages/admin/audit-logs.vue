<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { TableColumn } from '@nuxt/ui'
import type { ApiEnvelope, AuditLog, AuditLogDetail, Paginated } from '~/utils/api'

// Admin-only audit-log viewer (spec §26, §56).
definePageMeta({ middleware: 'auth' })

const nuxtApp = useNuxtApp()
const searchId = useId()
const actionId = useId()
const entityId = useId()
const fromId = useId()
const toId = useId()

const table = useDataTable({
  filters: { action: '', entityType: '', from: '', to: '' },
  defaultSort: 'created_at',
  defaultOrder: 'desc',
})

const items = ref<AuditLog[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref<string | null>(null)
const forbidden = ref(false)

const fetchLogs = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<AuditLog>>>('/audit-logs', {
      query: table.queryParams.value,
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
      loadError.value = getApiErrorMessage(error, 'โหลดรายการ audit log ไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchLogs)
watch(() => table.queryParams.value, () => void fetchLogs())

const columns: TableColumn<AuditLog>[] = [
  { accessorKey: 'createdAt', header: 'เวลา' },
  { accessorKey: 'user', header: 'ผู้ทำรายการ', cell: ({ row }) => row.original.user?.username ?? '— (นักศึกษา)' },
  { accessorKey: 'action', header: 'การกระทำ' },
  { accessorKey: 'entityType', header: 'ชนิด' },
  { accessorKey: 'entityId', header: 'รหัสรายการ' },
  { id: 'actions', header: 'จัดการ' },
]

const ALL = 'all'
const toFilterValue = (value: string | undefined): string => (value == null || value === ALL ? '' : value)
const fromFilterValue = (value: string | undefined): string => (value == null || value === '' ? ALL : value)

const ACTION_ITEMS = [
  { label: 'ทุกการกระทำ', value: ALL },
  { label: 'เข้าสู่ระบบ (LOGIN)', value: 'LOGIN' },
  { label: 'นักศึกษา', value: 'STUDENT_CREATED' },
  { label: 'บีคอน', value: 'BEACON_CREATED' },
  { label: 'กิจกรรม', value: 'ACTIVITY_CREATED' },
  { label: 'เช็คชื่อ', value: 'ATTENDANCE_MANUAL_CREATED' },
  { label: 'ผู้ใช้', value: 'USER_CREATED' },
  { label: 'LINE', value: 'LINE_ACCOUNT_LINKED' },
]

// --- detail (old/new snapshots, spec §56) ------------------------------------------

const detailOpen = ref(false)
const detail = ref<AuditLogDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const selectedLog = ref<AuditLog | null>(null)

const openDetail = async (log: AuditLog): Promise<void> => {
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
    const res = await nuxtApp.$api<ApiEnvelope<AuditLogDetail>>(`/audit-logs/${selectedLog.value.id}`)
    detail.value = res.data
  } catch (error) {
    detailError.value = getApiErrorMessage(error, 'โหลดรายละเอียดไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    detailLoading.value = false
  }
}

const jsonText = (value: unknown): string => (value === null || value === undefined ? '—' : JSON.stringify(value, null, 2))
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Audit Logs"
      subtitle="ประวัติการเปลี่ยนแปลงสำคัญทั้งหมดของระบบเพื่อการตรวจสอบย้อนหลัง (spec §56)"
    />

    <UCard v-if="forbidden" class="py-16">
      <div class="flex flex-col items-center gap-3 text-center">
        <Icon name="lucide:shield-x" class="size-10 text-error" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่มีสิทธิ์เข้าถึง</h2>
        <p class="max-w-md text-sm text-muted">การดู Audit Logs เปิดให้ผู้ดูแลระบบ (Admin) เท่านั้น</p>
        <UButton to="/dashboard" color="neutral" variant="outline" icon="lucide:layout-dashboard" label="กลับไปหน้าภาพรวม" />
      </div>
    </UCard>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div class="flex flex-col gap-1.5">
          <label :for="searchId" class="text-sm font-medium text-highlighted">ค้นหา</label>
          <UInput
            :id="searchId"
            v-model="table.searchInput.value"
            icon="lucide:search"
            placeholder="การกระทำ หรือรหัสรายการ"
            :disabled="loading"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label :for="actionId" class="text-sm font-medium text-highlighted">การกระทำ</label>
          <USelect
            :id="actionId"
            :model-value="fromFilterValue(table.filters.action)"
            :items="ACTION_ITEMS"
            :disabled="loading"
            @update:model-value="(value: string | undefined) => table.setFilter('action', toFilterValue(value))"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label :for="entityId" class="text-sm font-medium text-highlighted">ชนิดรายการ</label>
          <UInput
            :id="entityId"
            :model-value="table.filters.entityType"
            placeholder="เช่น STUDENT"
            :disabled="loading"
            @update:model-value="(value: string | undefined) => table.setFilter('entityType', value ?? '')"
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
        caption="รายการ audit log"
        @update:page="table.setPage"
        @update:page-size="table.setPageSize"
        @retry="fetchLogs"
        @clear="table.resetFilters"
      >
        <template #createdAt-cell="{ row }">
          {{ formatDateTime(row.original.createdAt) }}
        </template>

        <template #action-cell="{ row }">
          <UBadge color="neutral" variant="subtle" :label="row.original.action" />
        </template>

        <template #entityId-cell="{ row }">
          <span class="font-mono text-xs">{{ row.original.entityId }}</span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end">
            <UButton
              icon="lucide:eye"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`ดูรายละเอียด ${row.original.action}`"
              @click="openDetail(row.original)"
            />
          </div>
        </template>
      </DataTable>
    </template>

    <UModal v-model:open="detailOpen" title="รายละเอียดการเปลี่ยนแปลง">
      <template #body>
        <div v-if="detailLoading" role="status" aria-label="กำลังโหลดรายละเอียด">
          <USkeleton class="h-40 w-full" />
        </div>

        <div v-else-if="detailError" class="flex flex-col items-center gap-3 py-8 text-center">
          <Icon name="lucide:circle-alert" class="size-8 text-error" aria-hidden="true" />
          <p class="text-sm text-muted">{{ detailError }}</p>
          <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองอีกครั้ง" @click="loadDetail" />
        </div>

        <div v-else-if="detail" class="flex flex-col gap-4">
          <dl class="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div class="flex flex-col gap-0.5">
              <dt class="text-xs text-muted">การกระทำ</dt>
              <dd class="text-sm font-medium text-highlighted">{{ detail.action }}</dd>
            </div>
            <div class="flex flex-col gap-0.5">
              <dt class="text-xs text-muted">ผู้ทำรายการ</dt>
              <dd class="text-sm font-medium text-highlighted">{{ detail.user?.username ?? '— (นักศึกษา)' }}</dd>
            </div>
            <div class="flex flex-col gap-0.5">
              <dt class="text-xs text-muted">ชนิด / รหัสรายการ</dt>
              <dd class="break-all font-mono text-xs text-highlighted">{{ detail.entityType }} / {{ detail.entityId }}</dd>
            </div>
            <div class="flex flex-col gap-0.5">
              <dt class="text-xs text-muted">เวลา</dt>
              <dd class="text-sm font-medium text-highlighted">{{ formatDateTime(detail.createdAt) }}</dd>
            </div>
          </dl>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <span class="text-xs text-muted">ค่าก่อนเปลี่ยน (old_value)</span>
              <pre class="max-h-48 overflow-auto rounded-md bg-elevated p-3 text-xs text-default">{{ jsonText(detail.oldValue) }}</pre>
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs text-muted">ค่าหลังเปลี่ยน (new_value)</span>
              <pre class="max-h-48 overflow-auto rounded-md bg-elevated p-3 text-xs text-default">{{ jsonText(detail.newValue) }}</pre>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
