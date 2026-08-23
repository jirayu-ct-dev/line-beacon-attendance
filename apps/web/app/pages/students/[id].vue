<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ApiEnvelope, Paginated, Student, StudentAttendanceRow } from '~/utils/api'

// Kept intentionally simple: profile + edit (reuses StudentFormDialog) plus
// the admin attendance history below (spec §35).
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const nuxtApp = useNuxtApp()
const toast = useToast()
const { confirm } = useConfirm()

const student = ref<Student | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const notFound = ref(false)
const forbidden = ref(false)

const fetchStudent = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Student>>(`/students/${route.params.id}`)
    student.value = res.data
    notFound.value = false
    forbidden.value = false
  } catch (error) {
    const fetchError = error as FetchError
    notFound.value = fetchError?.status === 404
    forbidden.value = fetchError?.status === 403
    student.value = null
    if (!notFound.value && !forbidden.value) {
      loadError.value = getApiErrorMessage(error, 'โหลดข้อมูลนักศึกษาไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchStudent)
onMounted(fetchHistory)

// --- attendance history (spec §35 — admin view) -------------------------------

const history = ref<StudentAttendanceRow[]>([])
const historyLoading = ref(true)
const historyError = ref<string | null>(null)

async function fetchHistory(): Promise<void> {
  historyLoading.value = true
  historyError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<StudentAttendanceRow>>>(
      `/students/${route.params.id}/attendances`,
      { query: { pageSize: 100, sort: 'check_in_at', order: 'desc' } },
    )
    history.value = res.data.items
  } catch (error) {
    historyError.value = getApiErrorMessage(error, 'โหลดประวัติการเช็คชื่อไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    historyLoading.value = false
  }
}

const editOpen = ref(false)

const profileRows = computed(() => [
  { label: 'รหัสนักศึกษา', value: student.value?.studentCode ?? '' },
  { label: 'วันเดือนปีเกิด', value: student.value ? formatDate(student.value.birthDate) : '' },
  { label: 'ชั้นปี', value: student.value ? `ชั้นปี ${student.value.year}` : '' },
  { label: 'อีเมล', value: student.value?.email || '—' },
  { label: 'สร้างเมื่อ', value: student.value ? formatDateTime(student.value.createdAt) : '' },
  { label: 'อัปเดตล่าสุด', value: student.value ? formatDateTime(student.value.updatedAt) : '' },
])

// --- admin unlink of the student's LINE account (spec §7.1) -----------------------

const unlinking = ref(false)

const onUnlinkLine = async (): Promise<void> => {
  if (!student.value || unlinking.value) return
  const confirmed = await confirm({
    title: 'ยกเลิกการเชื่อมบัญชี LINE',
    description: `${student.value.firstName} ${student.value.lastName} (${student.value.studentCode}) จะไม่สามารถเช็คชื่อผ่าน LINE Beacon ได้จนกว่าจะลงทะเบียนเชื่อมบัญชีใหม่`,
    confirmText: 'ยกเลิกการเชื่อม',
    tone: 'error',
  })
  if (!confirmed) return
  unlinking.value = true
  try {
    await nuxtApp.$api<ApiEnvelope<Student>>(`/students/${student.value.id}/unlink-line`, { method: 'POST' })
    toast.add({ title: 'ยกเลิกการเชื่อมบัญชี LINE สำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    await fetchStudent()
  } catch {
    toast.add({ title: 'ยกเลิกการเชื่อมบัญชี LINE ไม่สำเร็จ กรุณาลองอีกครั้ง', color: 'error', icon: 'lucide:circle-alert' })
  } finally {
    unlinking.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="รายละเอียดนักศึกษา">
      <template #actions>
        <UButton
          to="/students"
          color="neutral"
          variant="outline"
          icon="lucide:arrow-left"
          label="กลับไปรายการ"
        />
      </template>
    </PageHeader>

    <div v-if="loading" class="flex flex-col gap-4" role="status" aria-label="กำลังโหลดข้อมูล">
      <USkeleton class="h-8 w-64" />
      <USkeleton class="h-40 w-full" />
    </div>

    <UCard v-else-if="forbidden" class="py-16">
      <div class="flex flex-col items-center gap-3 text-center">
        <Icon name="lucide:shield-x" class="size-10 text-error" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่มีสิทธิ์เข้าถึง</h2>
        <p class="max-w-md text-sm text-muted">การจัดการนักศึกษาเปิดให้ผู้ดูแลระบบ (Admin) เท่านั้น</p>
        <UButton to="/dashboard" color="neutral" variant="outline" icon="lucide:layout-dashboard" label="กลับไปหน้าภาพรวม" />
      </div>
    </UCard>

    <UCard v-else-if="notFound" class="py-16">
      <div class="flex flex-col items-center gap-3 text-center">
        <Icon name="lucide:search-x" class="size-10 text-muted" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่พบนักศึกษา</h2>
        <p class="text-sm text-muted">รายการนักศึกษานี้อาจถูกลบไปแล้ว หรือรหัสอ้างอิงไม่ถูกต้อง</p>
        <UButton to="/students" color="neutral" variant="outline" icon="lucide:arrow-left" label="กลับไปรายการ" />
      </div>
    </UCard>

    <UCard v-else-if="loadError">
      <div class="flex flex-col items-center gap-3 py-10 text-center">
        <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
        <p class="text-sm text-muted">{{ loadError }}</p>
        <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองใหม่" @click="fetchStudent" />
      </div>
    </UCard>

    <template v-else-if="student">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-4">
          <div class="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Icon name="lucide:circle-user" class="size-7 text-primary" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="truncate text-xl font-bold text-highlighted">
                {{ student.firstName }} {{ student.lastName }}
              </h2>
              <StatusBadge :status="student.status" />
            </div>
            <p class="mt-1 flex items-center gap-1.5 text-sm" :class="student.lineLinked ? 'text-success' : 'text-muted'">
              <Icon :name="student.lineLinked ? 'lucide:link' : 'lucide:unlink'" class="size-4" aria-hidden="true" />
              {{ student.lineLinked ? 'เชื่อมต่อบัญชี LINE แล้ว' : 'ยังไม่เชื่อมต่อบัญชี LINE' }}
            </p>
          </div>
        </div>
        <UButton icon="lucide:pencil" label="แก้ไขข้อมูล" @click="editOpen = true" />
        <UButton
          v-if="student.lineLinked"
          color="error"
          variant="outline"
          icon="lucide:unlink"
          label="ยกเลิกการเชื่อม LINE"
          :loading="unlinking"
          :disabled="unlinking"
          @click="onUnlinkLine"
        />
      </div>

      <UCard>
        <dl class="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div v-for="row in profileRows" :key="row.label" class="flex flex-col gap-1">
            <dt class="text-sm text-muted">{{ row.label }}</dt>
            <dd class="text-sm font-medium text-highlighted">{{ row.value }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard>
        <h2 class="text-base font-semibold text-highlighted">ประวัติการเช็คชื่อ</h2>

        <div v-if="historyLoading" class="mt-4" role="status" aria-label="กำลังโหลดประวัติการเช็คชื่อ">
          <USkeleton class="h-24 w-full" />
        </div>

        <div v-else-if="historyError" class="mt-4 flex flex-col items-center gap-3 py-6 text-center">
          <Icon name="lucide:circle-alert" class="size-8 text-error" aria-hidden="true" />
          <p class="text-sm text-muted">{{ historyError }}</p>
          <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองอีกครั้ง" @click="fetchHistory" />
        </div>

        <table v-else-if="history.length > 0" class="mt-4 w-full text-sm">
          <caption class="sr-only">ประวัติการเช็คชื่อของนักศึกษา</caption>
          <thead>
            <tr class="border-b border-default text-left text-muted">
              <th scope="col" class="py-2 pr-4 font-medium">กิจกรรม</th>
              <th scope="col" class="py-2 pr-4 font-medium">เวลาเช็คชื่อ</th>
              <th scope="col" class="py-2 pr-4 font-medium">สถานะ</th>
              <th scope="col" class="py-2 font-medium">ช่องทาง</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in history" :key="row.id" class="border-b border-default last:border-0">
              <td class="py-2.5 pr-4">
                <NuxtLink :to="`/activities/${row.activityId}`" class="font-medium text-highlighted hover:underline">
                  {{ row.activityName }}
                </NuxtLink>
              </td>
              <td class="py-2.5 pr-4">{{ formatDateTime(row.checkInAt) }}</td>
              <td class="py-2.5 pr-4"><StatusBadge :status="row.status" /></td>
              <td class="py-2.5">{{ row.checkinMethod === 'BEACON' ? 'Beacon' : 'เช็คชื่อแทน' }}</td>
            </tr>
          </tbody>
        </table>

        <p v-else class="mt-4 text-sm text-muted">ยังไม่มีประวัติการเช็คชื่อ</p>
      </UCard>
    </template>

    <StudentFormDialog v-model:open="editOpen" :student="student" @saved="fetchStudent" />
  </div>
</template>
