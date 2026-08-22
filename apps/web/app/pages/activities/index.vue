<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ApiEnvelope, Activity, Paginated } from '~/utils/api'

definePageMeta({ middleware: 'auth' })

const nuxtApp = useNuxtApp()
const searchId = useId()

const table = useDataTable({
  filters: { status: '' },
  defaultSort: 'created_at',
  defaultOrder: 'desc',
})

const items = ref<Activity[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref<string | null>(null)

// §29: the API already scopes organizers to their own activities, so this
// page needs no role-specific state — every signed-in user sees a valid list.
const fetchActivities = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<Activity>>>('/activities', {
      query: table.queryParams.value,
    })
    items.value = res.data.items
    total.value = res.data.total
  } catch (error) {
    loadError.value = getApiErrorMessage(error, 'โหลดรายการกิจกรรมไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    loading.value = false
  }
}

onMounted(fetchActivities)
watch(() => table.queryParams.value, () => void fetchActivities())

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

const columns: TableColumn<Activity>[] = [
  { accessorKey: 'name', header: 'ชื่อกิจกรรม' },
  { accessorKey: 'startAt', header: 'เริ่มกิจกรรม' },
  { id: 'checkinWindow', header: 'ช่วงเช็คชื่อ' },
  { accessorKey: 'beaconCount', header: 'บีคอน' },
  { accessorKey: 'status', header: 'สถานะ' },
  { accessorKey: 'timeState', header: 'ช่วงเวลา' },
  { id: 'actions', header: 'จัดการ' },
]

// reka-ui does not allow empty-string item values; 'all' is the unset sentinel
// mapped to an empty filter value.
const ALL = 'all'
const toFilterValue = (value: string | undefined): string => (value == null || value === ALL ? '' : value)
const fromFilterValue = (value: string | undefined): string => (value == null || value === '' ? ALL : value)

const statusItems = [
  { label: 'ทุกสถานะ', value: ALL },
  { label: 'ฉบับร่าง', value: 'DRAFT' },
  { label: 'เผยแพร่', value: 'PUBLISHED' },
  { label: 'ยกเลิก', value: 'CANCELLED' },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="กิจกรรม" subtitle="จัดการกิจกรรมและช่วงเวลาเช็คชื่อของสาขา">
      <template #actions>
        <UButton icon="lucide:plus" label="สร้างกิจกรรม" to="/activities/create" />
      </template>
    </PageHeader>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label :for="searchId" class="text-sm font-medium text-highlighted">ค้นหา</label>
        <UInput
          :id="searchId"
          v-model="table.searchInput.value"
          icon="lucide:search"
          placeholder="ชื่อกิจกรรม หรือสถานที่"
          :disabled="loading"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-highlighted">สถานะ</span>
        <USelect
          :model-value="fromFilterValue(table.filters.status)"
          :items="statusItems"
          aria-label="กรองตามสถานะ"
          :disabled="loading"
          @update:model-value="(value: string | undefined) => table.setFilter('status', toFilterValue(value))"
        />
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
      caption="รายการกิจกรรม"
      @update:page="table.setPage"
      @update:page-size="table.setPageSize"
      @retry="fetchActivities"
      @clear="table.resetFilters"
    >
      <template #startAt-header>
        <UButton
          variant="ghost"
          size="sm"
          color="neutral"
          label="เริ่มกิจกรรม"
          :trailing-icon="sortIcon('start_at')"
          :aria-label="sortAriaLabel('เริ่มกิจกรรม', 'start_at')"
          @click="table.sortBy('start_at')"
        />
      </template>

      <template #startAt-cell="{ row }">
        {{ formatDateTime(row.original.startAt) }}
      </template>

      <template #checkinWindow-cell="{ row }">
        {{ formatDateTime(row.original.checkinOpenAt) }} – {{ formatDateTime(row.original.checkinCloseAt) }}
      </template>

      <template #beaconCount-cell="{ row }">
        <span class="inline-flex items-center gap-1.5">
          <Icon name="lucide:radio" class="size-4 text-muted" aria-hidden="true" />
          {{ row.original.beaconCount }}
        </span>
      </template>

      <template #status-cell="{ row }">
        <StatusBadge :status="row.original.status" />
      </template>

      <template #timeState-cell="{ row }">
        <StatusBadge :status="row.original.timeState" />
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end">
          <UButton
            icon="lucide:eye"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`ดูรายละเอียดกิจกรรม ${row.original.name}`"
            :to="`/activities/${row.original.id}`"
          />
        </div>
      </template>
    </DataTable>
  </div>
</template>
