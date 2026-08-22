<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { TableColumn } from '@nuxt/ui'
import type { ApiEnvelope, Paginated, Student } from '~/utils/api'

definePageMeta({ middleware: 'auth' })

const toast = useToast()
const { user } = useAuth()
const { confirm } = useConfirm()
const nuxtApp = useNuxtApp()
const searchId = useId()

// Students are admin-only (spec §27). The API is the authority — a 403 from it
// switches the page to an informative state instead of a broken table. While
// the user is still being resolved (null) the UI stays usable; backend enforces.
const canManage = computed(() => user.value?.role !== 'ORGANIZER')

const table = useDataTable({
  filters: { status: '', year: '' },
  defaultSort: 'created_at',
  defaultOrder: 'desc',
})

const items = ref<Student[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref<string | null>(null)
const forbidden = ref(false)

const fetchStudents = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<Student>>>('/students', {
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
      loadError.value = getApiErrorMessage(error, 'โหลดรายการนักศึกษาไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchStudents)
watch(() => table.queryParams.value, () => void fetchStudents())

// --- table -------------------------------------------------------------------

const sortIcon = (field: string): string =>
  table.sort.value !== field
    ? 'lucide:chevrons-up-down'
    : table.order.value === 'asc'
      ? 'lucide:arrow-up-narrow-wide'
      : 'lucide:arrow-down-narrow-wide'

const sortAriaLabel = (label: string, field: string): string =>
  table.sort.value !== field
    ? `เรียงตาม${label}`
    : `เรียงตาม${label} (${table.order.value === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'})`

const columns: TableColumn<Student>[] = [
  { accessorKey: 'studentCode', header: 'รหัสนักศึกษา' },
  { id: 'name', accessorFn: (row) => `${row.firstName} ${row.lastName}`, header: 'ชื่อ-สกุล' },
  { accessorKey: 'year', header: 'ชั้นปี' },
  { accessorKey: 'email', header: 'อีเมล', cell: ({ row }) => row.original.email ?? '—' },
  { accessorKey: 'status', header: 'สถานะ' },
  { id: 'lineLinked', header: 'เชื่อม LINE' },
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
]

const yearItems = [
  { label: 'ทุกชั้นปี', value: ALL },
  ...Array.from({ length: 8 }, (_, index) => ({ label: `ชั้นปี ${index + 1}`, value: String(index + 1) })),
]

// --- dialogs -------------------------------------------------------------------

const formOpen = ref(false)
const editingStudent = ref<Student | null>(null)
const importOpen = ref(false)

const openCreate = (): void => {
  editingStudent.value = null
  formOpen.value = true
}

const openEdit = (student: Student): void => {
  editingStudent.value = student
  formOpen.value = true
}

// --- enable / disable (the project's "delete" — spec §35) ----------------------

const updatingId = ref<string | null>(null)

const setStatus = async (student: Student, target: 'ACTIVE' | 'INACTIVE'): Promise<void> => {
  if (updatingId.value) return
  const disabling = target === 'INACTIVE'
  const confirmed = await confirm({
    title: disabling ? 'ปิดใช้งานนักศึกษา' : 'เปิดใช้งานนักศึกษา',
    description: disabling
      ? `${student.firstName} ${student.lastName} (${student.studentCode}) จะไม่สามารถเช็คชื่อผ่าน LINE Beacon ได้จนกว่าจะเปิดใช้งานอีกครั้ง`
      : `${student.firstName} ${student.lastName} (${student.studentCode}) จะกลับมาเช็คชื่อได้ตามปกติ`,
    confirmText: disabling ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
    tone: disabling ? 'error' : 'default',
  })
  if (!confirmed) return
  updatingId.value = student.id
  try {
    await nuxtApp.$api<ApiEnvelope<Student>>(`/students/${student.id}/${disabling ? 'disable' : 'enable'}`, {
      method: 'POST',
    })
    toast.add({
      title: disabling ? 'ปิดใช้งานนักศึกษาสำเร็จ' : 'เปิดใช้งานนักศึกษาสำเร็จ',
      color: 'success',
      icon: 'lucide:circle-check',
    })
    await fetchStudents()
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
    <PageHeader title="นักศึกษา" subtitle="จัดการรายชื่อนักศึกษาของสาขาและสถานะการเชื่อม LINE">
      <template v-if="canManage" #actions>
        <UButton
          color="neutral"
          variant="outline"
          icon="lucide:upload"
          label="นำเข้า"
          @click="importOpen = true"
        />
        <UButton icon="lucide:plus" label="เพิ่มนักศึกษา" @click="openCreate" />
      </template>
    </PageHeader>

    <UCard v-if="forbidden" class="py-16">
      <div class="flex flex-col items-center gap-3 text-center">
        <Icon name="lucide:shield-x" class="size-10 text-error" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่มีสิทธิ์เข้าถึง</h2>
        <p class="max-w-md text-sm text-muted">
          การจัดการนักศึกษาเปิดให้ผู้ดูแลระบบ (Admin) เท่านั้น
          หากคุณควรมีสิทธิ์ในส่วนนี้ กรุณาติดต่อผู้ดูแลระบบของสาขา
        </p>
        <UButton to="/dashboard" color="neutral" variant="outline" icon="lucide:layout-dashboard" label="กลับไปหน้าภาพรวม" />
      </div>
    </UCard>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="flex flex-col gap-1.5">
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
          <span class="text-sm font-medium text-highlighted">ชั้นปี</span>
          <USelect
            :model-value="fromFilterValue(table.filters.year)"
            :items="yearItems"
            aria-label="กรองตามชั้นปี"
            :disabled="loading"
            @update:model-value="(value: string | undefined) => table.setFilter('year', toFilterValue(value))"
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
        caption="รายการนักศึกษา"
        @update:page="table.setPage"
        @update:page-size="table.setPageSize"
        @retry="fetchStudents"
        @clear="table.resetFilters"
      >
        <template #studentCode-header>
          <UButton
            variant="ghost"
            size="sm"
            color="neutral"
            label="รหัสนักศึกษา"
            :trailing-icon="sortIcon('student_code')"
            :aria-label="sortAriaLabel('รหัสนักศึกษา', 'student_code')"
            @click="table.sortBy('student_code')"
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

        <template #lineLinked-cell="{ row }">
          <span v-if="row.original.lineLinked" class="inline-flex items-center gap-1.5 text-success">
            <Icon name="lucide:link" class="size-4" aria-hidden="true" />
            เชื่อมต่อแล้ว
          </span>
          <span v-else class="inline-flex items-center gap-1.5 text-muted">
            <Icon name="lucide:unlink" class="size-4" aria-hidden="true" />
            ยังไม่เชื่อม
          </span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              icon="lucide:pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`แก้ไขนักศึกษา ${row.original.studentCode}`"
              :disabled="updatingId !== null"
              @click="openEdit(row.original)"
            />
            <UButton
              v-if="row.original.status === 'ACTIVE'"
              icon="lucide:circle-off"
              color="error"
              variant="ghost"
              size="sm"
              :aria-label="`ปิดใช้งานนักศึกษา ${row.original.studentCode}`"
              :disabled="updatingId !== null"
              @click="setStatus(row.original, 'INACTIVE')"
            />
            <UButton
              v-else
              icon="lucide:circle-check"
              color="success"
              variant="ghost"
              size="sm"
              :aria-label="`เปิดใช้งานนักศึกษา ${row.original.studentCode}`"
              :disabled="updatingId !== null"
              @click="setStatus(row.original, 'ACTIVE')"
            />
            <UButton
              icon="lucide:eye"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`ดูรายละเอียดนักศึกษา ${row.original.studentCode}`"
              :to="`/students/${row.original.id}`"
            />
          </div>
        </template>
      </DataTable>
    </template>

    <StudentFormDialog v-model:open="formOpen" :student="editingStudent" @saved="fetchStudents" />
    <StudentImportDialog v-model:open="importOpen" @imported="fetchStudents" />
  </div>
</template>
