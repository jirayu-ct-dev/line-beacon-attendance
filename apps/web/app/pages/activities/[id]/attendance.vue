<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { TableColumn } from '@nuxt/ui'
import type { ActivityDetail, ApiEnvelope, AttendanceRow, Paginated } from '~/utils/api'

// Attendance management page (spec §25): stats + table + manual check-in +
// manual status change. Reached from the activity detail page.
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const nuxtApp = useNuxtApp()
const toast = useToast()
const { confirm } = useConfirm()
const searchId = useId()

// --- activity (header + §24 summary) --------------------------------------------

const activity = ref<ActivityDetail | null>(null)
const activityLoading = ref(true)
const activityError = ref<string | null>(null)
const notFound = ref(false)

const fetchActivity = async (): Promise<void> => {
  try {
    const res = await nuxtApp.$api<ApiEnvelope<ActivityDetail>>(`/activities/${route.params.id}`)
    activity.value = res.data
    notFound.value = false
    activityError.value = null
  } catch (error) {
    const fetchError = error as FetchError
    notFound.value = fetchError?.status === 404
    if (!notFound.value) {
      activityError.value = getApiErrorMessage(error, 'โหลดข้อมูลกิจกรรมไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  } finally {
    activityLoading.value = false
  }
}

onMounted(fetchActivity)

const summaryCards = computed(() => [
  { label: 'นักศึกษาทั้งหมด (ACTIVE)', value: activity.value?.attendanceSummary.totalStudents ?? 0 },
  { label: 'เข้าร่วม', value: activity.value?.attendanceSummary.present ?? 0 },
  { label: 'มาสาย', value: activity.value?.attendanceSummary.late ?? 0 },
  { label: 'ลา', value: activity.value?.attendanceSummary.excused ?? 0 },
  { label: 'ขาด (คำนวณ)', value: activity.value?.attendanceSummary.absent ?? 0 },
])

// --- attendance table (spec §25) --------------------------------------------------

const table = useDataTable({
  filters: { status: '', method: '' },
  defaultSort: 'check_in_at',
  defaultOrder: 'desc',
})

const items = ref<AttendanceRow[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref<string | null>(null)

const fetchRows = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<AttendanceRow>>>(
      `/activities/${route.params.id}/attendances`,
      { query: table.queryParams.value },
    )
    items.value = res.data.items
    total.value = res.data.total
  } catch (error) {
    loadError.value = getApiErrorMessage(error, 'โหลดรายการเช็คชื่อไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    loading.value = false
  }
}

onMounted(fetchRows)
watch(() => table.queryParams.value, () => void fetchRows())

const columns: TableColumn<AttendanceRow>[] = [
  { accessorKey: 'student.studentCode', header: 'รหัสนักศึกษา' },
  { id: 'name', accessorFn: (row) => row.student.name, header: 'ชื่อ-สกุล' },
  { accessorKey: 'checkInAt', header: 'เวลาเช็คชื่อ' },
  { accessorKey: 'status', header: 'สถานะ' },
  { accessorKey: 'checkinMethod', header: 'ช่องทาง' },
  { id: 'beacon', header: 'Beacon' },
  { id: 'updatedBy', header: 'ผู้บันทึก' },
  { id: 'actions', header: 'จัดการ' },
]

const ALL = 'all'
const toFilterValue = (value: string | undefined): string => (value == null || value === ALL ? '' : value)
const fromFilterValue = (value: string | undefined): string => (value == null || value === '' ? ALL : value)

const statusItems = [
  { label: 'ทุกสถานะ', value: ALL },
  { label: 'เข้าร่วม', value: 'PRESENT' },
  { label: 'มาสาย', value: 'LATE' },
  { label: 'ลา', value: 'EXCUSED' },
]
const methodItems = [
  { label: 'ทุกช่องทาง', value: ALL },
  { label: 'Beacon', value: 'BEACON' },
  { label: 'เช็คชื่อแทน', value: 'MANUAL' },
]

const METHOD_LABELS: Record<string, string> = { BEACON: 'Beacon', MANUAL: 'เช็คชื่อแทน' }

// --- manual check-in + status change -----------------------------------------------

const checkinOpen = ref(false)
const onCreated = async (): Promise<void> => {
  await Promise.all([fetchActivity(), fetchRows()])
}

const editOpen = ref(false)
const editRow = ref<AttendanceRow | null>(null)
const editStatus = ref<'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED' | undefined>(undefined)
const editSaving = ref(false)

const EDIT_STATUS_ITEMS = [
  { label: 'เข้าร่วม (Present)', value: 'PRESENT' },
  { label: 'มาสาย (Late)', value: 'LATE' },
  { label: 'ขาด (Absent — ยกเลิกการเช็คชื่อ)', value: 'ABSENT' },
  { label: 'ลา (Excused)', value: 'EXCUSED' },
]

const openEdit = (row: AttendanceRow): void => {
  editRow.value = row
  editStatus.value = row.status
  editOpen.value = true
}

const saveEdit = async (): Promise<void> => {
  if (!editRow.value || !editStatus.value || editSaving.value) return
  if (editStatus.value === editRow.value.status) {
    editOpen.value = false
    return
  }
  const confirmed = await confirm({
    title: 'ยืนยันการแก้ไขสถานะ',
    description: `${editRow.value.student.studentCode} (${editRow.value.student.name}) จะเปลี่ยนสถานะเป็น "${EDIT_STATUS_ITEMS.find((s) => s.value === editStatus.value)?.label}" และบันทึกผู้แก้ไขลง audit log`,
    confirmText: 'บันทึกการแก้ไข',
  })
  if (!confirmed) return
  editSaving.value = true
  try {
    await nuxtApp.$api<ApiEnvelope<AttendanceRow>>(
      `/activities/${route.params.id}/attendances/${editRow.value.id}`,
      { method: 'PATCH', body: { status: editStatus.value } },
    )
    toast.add({ title: 'แก้ไขสถานะสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    editOpen.value = false
    await Promise.all([fetchActivity(), fetchRows()])
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'แก้ไขสถานะไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    editSaving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="activity ? `การเช็คชื่อ — ${activity.name}` : 'การเช็คชื่อ'">
      <template #actions>
        <UButton
          icon="lucide:user-check"
          label="เช็คชื่อแทน"
          :disabled="activityLoading || !!activityError"
          @click="checkinOpen = true"
        />
        <UButton
          :to="`/activities/${route.params.id}`"
          color="neutral"
          variant="outline"
          icon="lucide:arrow-left"
          label="กลับไปรายละเอียด"
        />
      </template>
    </PageHeader>

    <div v-if="activityLoading" class="flex flex-col gap-4" role="status" aria-label="กำลังโหลดข้อมูล">
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UCard v-else-if="notFound" class="py-16">
      <div class="flex flex-col items-center gap-3 text-center">
        <Icon name="lucide:search-x" class="size-10 text-muted" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่พบกิจกรรม</h2>
        <UButton to="/activities" color="neutral" variant="outline" icon="lucide:arrow-left" label="กลับไปรายการ" />
      </div>
    </UCard>

    <UCard v-else-if="activityError">
      <div class="flex flex-col items-center gap-3 py-10 text-center">
        <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
        <p class="text-sm text-muted">{{ activityError }}</p>
        <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองอีกครั้ง" @click="fetchActivity" />
      </div>
    </UCard>

    <template v-else-if="activity">
      <div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <UCard v-for="card in summaryCards" :key="card.label">
          <div class="flex flex-col gap-1">
            <span class="text-sm text-muted">{{ card.label }}</span>
            <span class="text-3xl font-semibold text-highlighted">{{ card.value }}</span>
          </div>
        </UCard>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div class="sm:col-span-1 flex flex-col gap-1.5">
          <label :for="searchId" class="text-sm font-medium text-highlighted">ค้นหา</label>
          <UInput
            :id="searchId"
            v-model="table.searchInput.value"
            icon="lucide:search"
            placeholder="รหัสนักศึกษา ชื่อ หรือนามสกุล"
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
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-highlighted">ช่องทาง</span>
          <USelect
            :model-value="fromFilterValue(table.filters.method)"
            :items="methodItems"
            aria-label="กรองตามช่องทาง"
            :disabled="loading"
            @update:model-value="(value: string | undefined) => table.setFilter('method', toFilterValue(value))"
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
        caption="รายการเช็คชื่อของกิจกรรม"
        @update:page="table.setPage"
        @update:page-size="table.setPageSize"
        @retry="fetchRows"
        @clear="table.resetFilters"
      >
        <template #checkInAt-cell="{ row }">
          {{ formatDateTime(row.original.checkInAt) }}
        </template>

        <template #status-cell="{ row }">
          <StatusBadge :status="row.original.status" />
        </template>

        <template #checkinMethod-cell="{ row }">
          <span class="inline-flex items-center gap-1.5">
            <Icon
              :name="row.original.checkinMethod === 'BEACON' ? 'lucide:radio' : 'lucide:clipboard-pen'"
              class="size-4 text-muted"
              aria-hidden="true"
            />
            {{ METHOD_LABELS[row.original.checkinMethod] ?? row.original.checkinMethod }}
          </span>
        </template>

        <template #beacon-cell="{ row }">
          <span v-if="row.original.beacon" class="font-mono text-xs">{{ row.original.beacon.hwid }}</span>
          <span v-else class="text-muted">—</span>
        </template>

        <template #updatedBy-cell="{ row }">
          <div class="flex flex-col">
            <span>{{ row.original.checkedInBy?.username ?? '—' }}</span>
            <span v-if="row.original.manualReason" class="max-w-56 truncate text-xs text-muted" :title="row.original.manualReason">
              {{ row.original.manualReason }}
            </span>
          </div>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end">
            <UButton
              icon="lucide:pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`แก้ไขสถานะของ ${row.original.student.studentCode}`"
              :disabled="loading"
              @click="openEdit(row.original)"
            />
          </div>
        </template>
      </DataTable>

      <ManualCheckinDialog v-model:open="checkinOpen" :activity-id="activity.id" @created="onCreated" />

      <UModal v-model:open="editOpen" title="แก้ไขสถานะการเช็คชื่อ">
        <template #body>
          <div v-if="editRow" class="flex flex-col gap-4">
            <div class="flex flex-col gap-0.5">
              <span class="text-sm font-medium text-highlighted">
                {{ editRow.student.studentCode }} — {{ editRow.student.name }}
              </span>
              <span class="text-xs text-muted">เช็คชื่อ {{ formatDateTime(editRow.checkInAt) }}</span>
            </div>

            <UFormField label="สถานะใหม่" required help="การแก้ไขจะถูกบันทึกลง audit log (spec §56)">
              <USelect v-model="editStatus" :items="EDIT_STATUS_ITEMS" class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="outline" label="ยกเลิก" :disabled="editSaving" @click="editOpen = false" />
              <UButton
                icon="lucide:save"
                label="บันทึกการแก้ไข"
                :loading="editSaving"
                :disabled="editSaving"
                @click="saveEdit"
              />
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
