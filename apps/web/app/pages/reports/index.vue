<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { TableColumn } from '@nuxt/ui'
import type { Activity, ActivityReport, ApiEnvelope, Paginated, Student, StudentReport } from '~/utils/api'

// Reports page (spec §23 /reports, §44): pick an activity → summary + full
// attendance list + CSV/Excel export; admins also get the per-student report.
definePageMeta({ middleware: 'auth' })

const nuxtApp = useNuxtApp()
const toast = useToast()
const { user } = useAuth()
const isAdmin = computed(() => user.value?.role === 'ADMIN')

const METHOD_LABELS: Record<string, string> = { BEACON: 'Beacon', MANUAL: 'เช็คชื่อแทน' }

// --- activity picker table --------------------------------------------------------

const table = useDataTable({ filters: {}, defaultSort: 'created_at', defaultOrder: 'desc' })
const searchId = useId()

const items = ref<Activity[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref<string | null>(null)

// §29: the API already scopes organizers to their own activities.
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

const columns: TableColumn<Activity>[] = [
  { accessorKey: 'name', header: 'ชื่อกิจกรรม' },
  { accessorKey: 'startAt', header: 'วันที่เริ่ม' },
  { accessorKey: 'status', header: 'สถานะ' },
  { id: 'actions', header: 'รายงาน' },
]

// --- selected activity report (spec §44) -------------------------------------------

const selectedId = ref<string | null>(null)
const report = ref<ActivityReport | null>(null)
const reportLoading = ref(false)
const reportError = ref<string | null>(null)

const fetchReport = async (activityId: string): Promise<void> => {
  reportLoading.value = true
  reportError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<ActivityReport>>(`/reports/activities/${activityId}`)
    report.value = res.data
  } catch (error) {
    report.value = null
    reportError.value = getApiErrorMessage(error, 'โหลดรายงานไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    reportLoading.value = false
  }
}

const selectActivity = (activity: Activity): void => {
  selectedId.value = activity.id
  void fetchReport(activity.id)
}

const closeReport = (): void => {
  selectedId.value = null
  report.value = null
  reportError.value = null
}

const summaryCards = computed(() => [
  { label: 'นักศึกษาทั้งหมด (ACTIVE)', value: report.value?.summary.totalStudents ?? 0 },
  { label: 'เข้าร่วม', value: report.value?.summary.present ?? 0 },
  { label: 'มาสาย', value: report.value?.summary.late ?? 0 },
  { label: 'ลา', value: report.value?.summary.excused ?? 0 },
  { label: 'ขาด (คำนวณ)', value: report.value?.summary.absent ?? 0 },
])

// --- export CSV / Excel (spec §44) ---------------------------------------------------

const exporting = ref<'csv' | 'xlsx' | null>(null)

const exportReport = async (format: 'csv' | 'xlsx'): Promise<void> => {
  if (!report.value || exporting.value) return
  exporting.value = format
  try {
    const blob = await nuxtApp.$api<Blob>(`/reports/activities/${report.value.activity.id}/export`, {
      query: { format },
      responseType: 'blob',
    })
    // Same sanitization as the API so the downloaded name matches the header
    const name = report.value.activity.name.replace(/[\\/:*?"<>|\r\n]/g, ' ').trim() || 'กิจกรรม'
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `รายงาน-${name}.${format}`
    link.click()
    URL.revokeObjectURL(url)
    toast.add({ title: 'ส่งออกรายงานสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
  } catch (error) {
    // Errors still answer JSON — with responseType 'blob' they arrive as a Blob
    const fetchError = error as FetchError
    let message = getApiErrorMessage(error, 'ส่งออกรายงานไม่สำเร็จ กรุณาลองอีกครั้ง')
    if (fetchError?.data instanceof Blob) {
      try {
        const parsed = JSON.parse(await fetchError.data.text()) as ApiErrorEnvelope
        if (parsed.error?.message) message = parsed.error.message
      } catch {
        // keep the fallback message
      }
    }
    toast.add({ title: message, color: 'error', icon: 'lucide:circle-alert' })
  } finally {
    exporting.value = null
  }
}

// --- per-student report (admin only — spec §27, §35) --------------------------------

const studentSearchId = useId()
const studentSearch = ref('')
const matched = ref<Student[]>([])
const searching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined

const runStudentSearch = async (): Promise<void> => {
  const term = studentSearch.value.trim()
  if (term.length < 2) {
    matched.value = []
    return
  }
  searching.value = true
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<Student>>>('/students', {
      query: { search: term, pageSize: 20 },
    })
    matched.value = res.data.items
  } catch {
    matched.value = []
  } finally {
    searching.value = false
  }
}

watch(studentSearch, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void runStudentSearch(), 300)
})
onUnmounted(() => clearTimeout(searchTimer))

const studentItems = computed(() =>
  matched.value.map((student) => ({
    label: `${student.studentCode} — ${student.firstName} ${student.lastName}`,
    value: student.id,
  })),
)

const selectedStudentId = ref('')
const studentReport = ref<StudentReport | null>(null)
const studentReportLoading = ref(false)
const studentReportError = ref<string | null>(null)

watch(selectedStudentId, (id) => {
  if (id) void fetchStudentReport(id)
  else studentReport.value = null
})

const fetchStudentReport = async (studentId: string): Promise<void> => {
  studentReportLoading.value = true
  studentReportError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<StudentReport>>(`/reports/students/${studentId}`)
    studentReport.value = res.data
  } catch (error) {
    studentReport.value = null
    studentReportError.value = getApiErrorMessage(error, 'โหลดรายงานไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    studentReportLoading.value = false
  }
}

const studentSummaryCards = computed(() => [
  { label: 'รายการเช็คชื่อทั้งหมด', value: studentReport.value?.summary.total ?? 0 },
  { label: 'เข้าร่วม', value: studentReport.value?.summary.present ?? 0 },
  { label: 'มาสาย', value: studentReport.value?.summary.late ?? 0 },
  { label: 'ลา', value: studentReport.value?.summary.excused ?? 0 },
])
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="รายงาน" subtitle="สรุปผลการเช็คชื่อและส่งออกรายงานกิจกรรม (CSV / Excel)" />

    <UCard>
      <div class="flex flex-col gap-4">
        <div>
          <h2 class="text-base font-semibold text-highlighted">รายงานกิจกรรม</h2>
          <p class="mt-1 text-sm text-muted">เลือกกิจกรรมเพื่อดูสรุปผลการเช็คชื่อและรายชื่อทั้งหมด (spec §44)</p>
        </div>

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

        <DataTable
          :data="items"
          :columns="columns"
          :loading="loading"
          :error="loadError"
          :has-active-filters="table.hasActiveFilters.value"
          :total="total"
          :page="table.page.value"
          :page-size="table.pageSize.value"
          caption="รายการกิจกรรมสำหรับรายงาน"
          @update:page="table.setPage"
          @update:page-size="table.setPageSize"
          @retry="fetchActivities"
          @clear="table.resetFilters"
        >
          <template #startAt-cell="{ row }">
            {{ formatDateTime(row.original.startAt) }}
          </template>

          <template #status-cell="{ row }">
            <StatusBadge :status="row.original.status" />
          </template>

          <template #actions-cell="{ row }">
            <div class="flex items-center justify-end">
              <UButton
                icon="lucide:file-spreadsheet"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`ดูรายงานกิจกรรม ${row.original.name}`"
                :disabled="reportLoading"
                @click="selectActivity(row.original)"
              />
            </div>
          </template>
        </DataTable>
      </div>
    </UCard>

    <UCard v-if="selectedId">
      <div v-if="reportLoading" role="status" aria-label="กำลังโหลดรายงาน">
        <USkeleton class="h-8 w-72" />
        <USkeleton class="mt-4 h-20 w-full" />
        <USkeleton class="mt-4 h-48 w-full" />
      </div>

      <div v-else-if="reportError" class="flex flex-col items-center gap-3 py-8 text-center">
        <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
        <p class="text-sm text-muted">{{ reportError }}</p>
        <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองอีกครั้ง" @click="fetchReport(selectedId)" />
      </div>

      <div v-else-if="report" class="flex flex-col gap-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="truncate text-lg font-bold text-highlighted">{{ report.activity.name }}</h2>
              <StatusBadge :status="report.activity.status" />
            </div>
            <p class="mt-1 text-sm text-muted">
              วันที่ {{ formatDateTime(report.activity.startAt) }} – {{ formatDateTime(report.activity.endAt) }}
              · ผู้จัด {{ report.activity.organizer.username }}
              · ช่วงเช็คชื่อ {{ formatDateTime(report.activity.checkinOpenAt) }} –
              {{ formatDateTime(report.activity.checkinCloseAt) }} (เวลาประเทศไทย)
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              icon="lucide:file-text"
              color="neutral"
              variant="outline"
              label="ส่งออก CSV"
              :loading="exporting === 'csv'"
              :disabled="exporting !== null"
              @click="exportReport('csv')"
            />
            <UButton
              icon="lucide:file-spreadsheet"
              color="neutral"
              variant="outline"
              label="ส่งออก Excel"
              :loading="exporting === 'xlsx'"
              :disabled="exporting !== null"
              @click="exportReport('xlsx')"
            />
            <UButton icon="lucide:x" color="neutral" variant="ghost" aria-label="ปิดรายงาน" @click="closeReport" />
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <div v-for="card in summaryCards" :key="card.label" class="rounded-lg border border-default p-4">
            <div class="flex flex-col gap-1">
              <span class="text-sm text-muted">{{ card.label }}</span>
              <span class="text-3xl font-semibold text-highlighted">{{ card.value }}</span>
            </div>
          </div>
        </div>

        <div>
          <h3 class="mb-3 text-base font-semibold text-highlighted">รายชื่อการเช็คชื่อ</h3>
          <table v-if="report.attendances.length > 0" class="w-full text-sm">
            <caption class="sr-only">รายชื่อการเช็คชื่อของกิจกรรม {{ report.activity.name }}</caption>
            <thead>
              <tr class="border-b border-default text-left text-muted">
                <th scope="col" class="py-2 pr-4 font-medium">รหัสนักศึกษา</th>
                <th scope="col" class="py-2 pr-4 font-medium">ชื่อ-สกุล</th>
                <th scope="col" class="py-2 pr-4 font-medium">เวลาเช็คชื่อ</th>
                <th scope="col" class="py-2 pr-4 font-medium">สถานะ</th>
                <th scope="col" class="py-2 pr-4 font-medium">ช่องทาง</th>
                <th scope="col" class="py-2 pr-4 font-medium">Beacon</th>
                <th scope="col" class="py-2 pr-4 font-medium">บันทึกโดย</th>
                <th scope="col" class="py-2 font-medium">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in report.attendances" :key="row.id" class="border-b border-default last:border-0">
                <td class="py-2.5 pr-4 font-mono text-xs">{{ row.student.studentCode }}</td>
                <td class="py-2.5 pr-4 font-medium text-highlighted">{{ row.student.name }}</td>
                <td class="py-2.5 pr-4">{{ formatDateTime(row.checkInAt) }}</td>
                <td class="py-2.5 pr-4"><StatusBadge :status="row.status" /></td>
                <td class="py-2.5 pr-4">{{ METHOD_LABELS[row.checkinMethod] ?? row.checkinMethod }}</td>
                <td class="py-2.5 pr-4 font-mono text-xs">{{ row.beacon?.hwid ?? '—' }}</td>
                <td class="py-2.5 pr-4">{{ row.checkedInBy?.username ?? '—' }}</td>
                <td class="max-w-56 truncate py-2.5" :title="row.manualReason ?? undefined">
                  {{ row.manualReason ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-sm text-muted">ยังไม่มีรายการเช็คชื่อ</p>
        </div>
      </div>
    </UCard>

    <UCard v-if="isAdmin">
      <div class="flex flex-col gap-4">
        <div>
          <h2 class="text-base font-semibold text-highlighted">รายงานรายบุคคล</h2>
          <p class="mt-1 text-sm text-muted">สรุปประวัติการเช็คชื่อของนักศึกษาคนเดียวตามกิจกรรม (เฉพาะ Admin)</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label :for="studentSearchId" class="text-sm font-medium text-highlighted">ค้นหานักศึกษา</label>
          <div class="flex flex-col gap-2">
            <UInput
              :id="studentSearchId"
              v-model="studentSearch"
              icon="lucide:search"
              placeholder="เช่น 660112230038 หรือ ชื่อ (พิมพ์อย่างน้อย 2 ตัวอักษร)"
              :loading="searching"
            />
            <USelect
              v-model="selectedStudentId"
              :items="studentItems"
              placeholder="เลือกนักศึกษาจากผลการค้นหา"
              :disabled="matched.length === 0"
              aria-label="เลือกนักศึกษา"
            />
            <p v-if="studentSearch.trim().length >= 2 && !searching && matched.length === 0" class="text-sm text-muted">
              ไม่พบนักศึกษาที่ตรงกับการค้นหา
            </p>
          </div>
        </div>

        <div v-if="studentReportLoading" role="status" aria-label="กำลังโหลดรายงานรายบุคคล">
          <USkeleton class="h-16 w-full" />
          <USkeleton class="mt-4 h-40 w-full" />
        </div>

        <div v-else-if="studentReportError" class="flex flex-col items-center gap-3 py-6 text-center">
          <Icon name="lucide:circle-alert" class="size-8 text-error" aria-hidden="true" />
          <p class="text-sm text-muted">{{ studentReportError }}</p>
          <UButton
            color="neutral"
            variant="outline"
            icon="lucide:rotate-ccw"
            label="ลองอีกครั้ง"
            @click="selectedStudentId && fetchStudentReport(selectedStudentId)"
          />
        </div>

        <div v-else-if="studentReport" class="flex flex-col gap-6">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-base font-semibold text-highlighted">
              {{ studentReport.student.studentCode }} — {{ studentReport.student.name }}
            </h3>
            <StatusBadge :status="studentReport.student.status" />
          </div>

          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div v-for="card in studentSummaryCards" :key="card.label" class="rounded-lg border border-default p-4">
              <div class="flex flex-col gap-1">
                <span class="text-sm text-muted">{{ card.label }}</span>
                <span class="text-2xl font-semibold text-highlighted">{{ card.value }}</span>
              </div>
            </div>
          </div>

          <div>
            <table v-if="studentReport.attendances.length > 0" class="w-full text-sm">
              <caption class="sr-only">ประวัติการเช็คชื่อของ {{ studentReport.student.name }}</caption>
              <thead>
                <tr class="border-b border-default text-left text-muted">
                  <th scope="col" class="py-2 pr-4 font-medium">กิจกรรม</th>
                  <th scope="col" class="py-2 pr-4 font-medium">เวลาเช็คชื่อ</th>
                  <th scope="col" class="py-2 pr-4 font-medium">สถานะ</th>
                  <th scope="col" class="py-2 font-medium">ช่องทาง</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in studentReport.attendances" :key="row.id" class="border-b border-default last:border-0">
                  <td class="py-2.5 pr-4">
                    <NuxtLink :to="`/activities/${row.activityId}`" class="font-medium text-highlighted hover:underline">
                      {{ row.activityName }}
                    </NuxtLink>
                  </td>
                  <td class="py-2.5 pr-4">{{ formatDateTime(row.checkInAt) }}</td>
                  <td class="py-2.5 pr-4"><StatusBadge :status="row.status" /></td>
                  <td class="py-2.5">{{ METHOD_LABELS[row.checkinMethod] ?? row.checkinMethod }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="text-sm text-muted">ยังไม่มีประวัติการเช็คชื่อ</p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
