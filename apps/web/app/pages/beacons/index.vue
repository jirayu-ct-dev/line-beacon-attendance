<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ApiEnvelope, Beacon, Paginated } from '~/utils/api'

definePageMeta({ middleware: 'auth' })

const toast = useToast()
const { user } = useAuth()
const { confirm } = useConfirm()
const nuxtApp = useNuxtApp()
const searchId = useId()

// Beacon registration/management is admin-only (spec §13); organizers can
// read the list because they pick beacons when linking activities (§23–§24).
// The API is the authority — mutations below are hidden, not protected, by this flag.
const canManage = computed(() => user.value?.role !== 'ORGANIZER')

const table = useDataTable({
  filters: { status: '' },
  defaultSort: 'created_at',
  defaultOrder: 'desc',
})

const items = ref<Beacon[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref<string | null>(null)

const fetchBeacons = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<Beacon>>>('/beacons', {
      query: table.queryParams.value,
    })
    items.value = res.data.items
    total.value = res.data.total
  } catch (error) {
    loadError.value = getApiErrorMessage(error, 'โหลดรายการบีคอนไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    loading.value = false
  }
}

onMounted(fetchBeacons)
watch(() => table.queryParams.value, () => void fetchBeacons())

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

const columns: TableColumn<Beacon>[] = [
  { accessorKey: 'hwid', header: 'HWID' },
  { accessorKey: 'name', header: 'ชื่อบีคอน' },
  { accessorKey: 'location', header: 'สถานที่', cell: ({ row }) => row.original.location ?? '—' },
  { accessorKey: 'status', header: 'สถานะ' },
  { accessorKey: 'createdAt', header: 'วันที่สร้าง', cell: ({ row }) => formatDate(row.original.createdAt) },
  { id: 'actions', header: 'จัดการ' },
]

// reka-ui does not allow empty-string item values; 'all' is the unset sentinel
// mapped to an empty filter value.
const ALL = 'all'
const toFilterValue = (value: string | undefined): string => (value == null || value === ALL ? '' : value)
const fromFilterValue = (value: string | undefined): string => (value == null || value === '' ? ALL : value)

const statusItems = [
  { label: 'ทุกสถานะ', value: ALL },
  { label: 'ใช้งาน', value: 'ACTIVE' },
  { label: 'ปิดใช้งาน', value: 'INACTIVE' },
  { label: 'ซ่อมบำรุง', value: 'MAINTENANCE' },
]

// --- dialogs -------------------------------------------------------------------

const formOpen = ref(false)
const editingBeacon = ref<Beacon | null>(null)

const openCreate = (): void => {
  editingBeacon.value = null
  formOpen.value = true
}

const openEdit = (beacon: Beacon): void => {
  editingBeacon.value = beacon
  formOpen.value = true
}

// --- enable / disable (the project's "delete" — spec §35) ----------------------

const updatingId = ref<string | null>(null)

const setStatus = async (beacon: Beacon, target: 'ACTIVE' | 'INACTIVE'): Promise<void> => {
  if (updatingId.value) return
  const disabling = target === 'INACTIVE'
  const confirmed = await confirm({
    title: disabling ? 'ปิดใช้งานบีคอน' : 'เปิดใช้งานบีคอน',
    description: disabling
      ? `${beacon.name} (${beacon.hwid}) จะไม่ถูกใช้เช็คชื่อจนกว่าจะเปิดใช้งานอีกครั้ง`
      : `${beacon.name} (${beacon.hwid}) จะกลับมาถูกใช้เช็คชื่อได้ตามปกติ`,
    confirmText: disabling ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
    tone: disabling ? 'error' : 'default',
  })
  if (!confirmed) return
  updatingId.value = beacon.id
  try {
    await nuxtApp.$api<ApiEnvelope<Beacon>>(`/beacons/${beacon.id}/${disabling ? 'disable' : 'enable'}`, {
      method: 'POST',
    })
    toast.add({
      title: disabling ? 'ปิดใช้งานบีคอนสำเร็จ' : 'เปิดใช้งานบีคอนสำเร็จ',
      color: 'success',
      icon: 'lucide:circle-check',
    })
    await fetchBeacons()
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    updatingId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="Beacons" subtitle="ลงทะเบียนบีคอน LINE Simple Beacon ของสาขาและจัดการสถานะ">
      <template v-if="canManage" #actions>
        <UButton icon="lucide:plus" label="ลงทะเบียนบีคอน" @click="openCreate" />
      </template>
    </PageHeader>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label :for="searchId" class="text-sm font-medium text-highlighted">ค้นหา</label>
        <UInput
          :id="searchId"
          v-model="table.searchInput.value"
          icon="lucide:search"
          placeholder="HWID ชื่อ หรือสถานที่"
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
      caption="รายการบีคอน"
      @update:page="table.setPage"
      @update:page-size="table.setPageSize"
      @retry="fetchBeacons"
      @clear="table.resetFilters"
    >
      <template #hwid-header>
        <UButton
          variant="ghost"
          size="sm"
          color="neutral"
          label="HWID"
          :trailing-icon="sortIcon('hwid')"
          :aria-label="sortAriaLabel('HWID', 'hwid')"
          @click="table.sortBy('hwid')"
        />
      </template>

      <template #createdAt-header>
        <UButton
          variant="ghost"
          size="sm"
          color="neutral"
          label="วันที่สร้าง"
          :trailing-icon="sortIcon('created_at')"
          :aria-label="sortAriaLabel('วันที่สร้าง', 'created_at')"
          @click="table.sortBy('created_at')"
        />
      </template>

      <template #status-cell="{ row }">
        <StatusBadge :status="row.original.status" />
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-1">
          <UButton
            v-if="canManage"
            icon="lucide:pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`แก้ไขบีคอน ${row.original.name}`"
            :disabled="updatingId !== null"
            @click="openEdit(row.original)"
          />
          <UButton
            v-if="canManage && row.original.status === 'ACTIVE'"
            icon="lucide:circle-off"
            color="error"
            variant="ghost"
            size="sm"
            :aria-label="`ปิดใช้งานบีคอน ${row.original.name}`"
            :disabled="updatingId !== null"
            @click="setStatus(row.original, 'INACTIVE')"
          />
          <UButton
            v-else-if="canManage"
            icon="lucide:circle-check"
            color="success"
            variant="ghost"
            size="sm"
            :aria-label="`เปิดใช้งานบีคอน ${row.original.name}`"
            :disabled="updatingId !== null"
            @click="setStatus(row.original, 'ACTIVE')"
          />
          <UButton
            icon="lucide:eye"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`ดูรายละเอียดบีคอน ${row.original.name}`"
            :to="`/beacons/${row.original.id}`"
          />
        </div>
      </template>
    </DataTable>

    <BeaconFormDialog v-model:open="formOpen" :beacon="editingBeacon" @saved="fetchBeacons" />
  </div>
</template>
