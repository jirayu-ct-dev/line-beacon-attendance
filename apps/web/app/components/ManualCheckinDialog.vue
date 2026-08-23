<script setup lang="ts">
import { z } from 'zod'
import type { ApiEnvelope, Paginated, Student } from '~/utils/api'

/**
 * Manual check-in dialog (spec §19, design doc §6.3): search the student by
 * code/name, choose the status + reason, confirm, create. The status is
 * chosen by the organizer — it is never computed from the clock.
 */
const props = defineProps<{
  activityId: string
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [] }>()

const toast = useToast()
const { confirm } = useConfirm()
const nuxtApp = useNuxtApp()
const searchId = useId()

const STATUS_ITEMS = [
  { label: 'เข้าร่วม (Present)', value: 'PRESENT' },
  { label: 'มาสาย (Late)', value: 'LATE' },
  { label: 'ลา (Excused)', value: 'EXCUSED' },
]

const schema = z.object({
  studentId: z.string().min(1, 'กรุณาเลือกนักศึกษา'),
  status: z.enum(['PRESENT', 'LATE', 'EXCUSED'], { error: 'กรุณาเลือกสถานะ' }),
  manualReason: z
    .string({ error: 'กรุณาระบุเหตุผลของการเช็คชื่อแทน' })
    .trim()
    .min(1, 'กรุณาระบุเหตุผลของการเช็คชื่อแทน')
    .max(500, 'เหตุผลยาวได้สูงสุด 500 ตัวอักษร'),
})

const form = ref({ studentId: '', status: undefined as 'PRESENT' | 'LATE' | 'EXCUSED' | undefined, manualReason: '' })
const serverError = ref<string | null>(null)

watch(open, (value) => {
  if (!value) return
  form.value = { studentId: '', status: undefined, manualReason: '' }
  serverError.value = null
  matched.value = []
  searchInput.value = ''
})

// --- student lookup (§19 flow: Search Student) --------------------------------

const searchInput = ref('')
const matched = ref<Student[]>([])
const searching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined

const runSearch = async (): Promise<void> => {
  const term = searchInput.value.trim()
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
    if (form.value.studentId && !res.data.items.some((s) => s.id === form.value.studentId)) {
      form.value.studentId = ''
    }
  } catch {
    matched.value = []
  } finally {
    searching.value = false
  }
}

watch(searchInput, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void runSearch(), 300)
})
onUnmounted(() => clearTimeout(searchTimer))

const studentItems = computed(() =>
  matched.value.map((student) => ({
    label: `${student.studentCode} — ${student.firstName} ${student.lastName}`,
    value: student.id,
  })),
)

const selectedStudent = computed(() => matched.value.find((s) => s.id === form.value.studentId))

// --- submit ---------------------------------------------------------------------

const submitting = ref(false)

const onSubmit = async (): Promise<void> => {
  if (submitting.value || !form.value.status) return
  const student = selectedStudent.value
  const confirmed = await confirm({
    title: 'ยืนยันการเช็คชื่อแทน',
    description: student
      ? `${student.studentCode} ${student.firstName} ${student.lastName} จะถูกบันทึกสถานะ "${STATUS_ITEMS.find((s) => s.value === form.value.status)?.label}" โดยบันทึกเหตุผลและผู้ทำรายการ`
      : 'ยืนยันการสร้างรายการเช็คชื่อแทน',
    confirmText: 'บันทึกการเช็คชื่อ',
  })
  if (!confirmed) return
  submitting.value = true
  try {
    await nuxtApp.$api<ApiEnvelope<unknown>>(`/activities/${props.activityId}/attendances/manual`, {
      method: 'POST',
      body: { studentId: form.value.studentId, status: form.value.status, manualReason: form.value.manualReason.trim() },
    })
    toast.add({ title: 'เช็คชื่อแทนสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    open.value = false
    emit('created')
  } catch (error) {
    serverError.value = getApiErrorMessage(error, 'เช็คชื่อแทนไม่สำเร็จ กรุณาลองอีกครั้ง')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="เช็คชื่อแทน (Manual Check-in)"
    description="สำหรับกรณีนักศึกษาเปิด Bluetooth / LINE ไม่ได้ หรือ Beacon มีปัญหา (spec §19)"
  >
    <template #body>
      <UForm :schema="schema" :state="form" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField label="ค้นหานักศึกษา" name="studentId" required help="พิมพ์อย่างน้อย 2 ตัวอักษร (รหัส/ชื่อ/นามสกุล)">
          <div class="flex w-full flex-col gap-2">
            <UInput
              :id="searchId"
              v-model="searchInput"
              icon="lucide:search"
              placeholder="เช่น 660112230038 หรือ ชื่อ"
              :loading="searching"
              :disabled="submitting"
            />
            <USelect
              v-model="form.studentId"
              :items="studentItems"
              placeholder="เลือกนักศึกษาจากผลการค้นหา"
              :disabled="submitting || matched.length === 0"
              aria-label="เลือกนักศึกษา"
            />
            <p v-if="searchInput.trim().length >= 2 && !searching && matched.length === 0" class="text-sm text-muted">
              ไม่พบนักศึกษาที่ตรงกับการค้นหา
            </p>
          </div>
        </UFormField>

        <UFormField label="สถานะ" name="status" required help="ผู้จัดกิจกรรมเป็นผู้เลือกสถานะ (ไม่คำนวณจากเวลา)">
          <USelect
            v-model="form.status"
            :items="STATUS_ITEMS"
            class="w-full"
            placeholder="เลือกสถานะ"
            :disabled="submitting"
          />
        </UFormField>

        <UFormField label="เหตุผล" name="manualReason" required>
          <UTextarea
            v-model="form.manualReason"
            class="w-full"
            :rows="2"
            maxlength="500"
            placeholder="เช่น นักศึกษาปิด Bluetooth"
            :disabled="submitting"
          />
        </UFormField>

        <p v-if="serverError" class="text-sm text-error" role="alert">{{ serverError }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="ยกเลิก" :disabled="submitting" @click="open = false" />
          <UButton type="submit" icon="lucide:check" :loading="submitting" :disabled="submitting">
            บันทึกการเช็คชื่อ
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>
</template>
