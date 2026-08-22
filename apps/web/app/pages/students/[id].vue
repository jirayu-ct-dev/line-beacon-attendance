<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ApiEnvelope, Student } from '~/utils/api'

// Kept intentionally simple: profile + edit (reuses StudentFormDialog). The
// attendance history section will be added with the activities/attendance phase.
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

      <p class="text-sm text-muted">ประวัติการเช็คชื่อของนักศึกษาจะแสดงที่นี่ในเฟสกิจกรรมและการเช็คชื่อ</p>
    </template>

    <StudentFormDialog v-model:open="editOpen" :student="student" @saved="fetchStudent" />
  </div>
</template>
