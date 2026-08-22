<script setup lang="ts">
import type { FetchError } from 'ofetch'
import { z } from 'zod'
import type { ApiEnvelope, Student } from '~/utils/api'

/**
 * Create/edit student form in a dialog (short, bounded task — per skill the
 * dialog is the right container). Edit mode when `student` is provided; the
 * same dialog is reused on the list and detail pages.
 */
const props = defineProps<{
  student?: Student | null
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [student: Student] }>()

const toast = useToast()
const nuxtApp = useNuxtApp()

const isEdit = computed(() => !!props.student)

const yearItems = Array.from({ length: 8 }, (_, index) => ({
  label: `ชั้นปี ${index + 1}`,
  value: index + 1,
}))

const isValidBirthDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return false
  return date.getUTCFullYear() >= 1900 && date.getTime() <= Date.now()
}

const schema = z.object({
  studentCode: z
    .string({ error: 'กรุณากรอกรหัสนักศึกษา' })
    .trim()
    .min(1, 'กรุณากรอกรหัสนักศึกษา')
    .regex(/^\d{12}$/, 'รหัสนักศึกษาต้องเป็นตัวเลข 12 หลัก'),
  firstName: z.string({ error: 'กรุณากรอกชื่อจริง' }).trim().min(1, 'กรุณากรอกชื่อจริง'),
  lastName: z.string({ error: 'กรุณากรอกนามสกุล' }).trim().min(1, 'กรุณากรอกนามสกุล'),
  birthDate: z
    .string({ error: 'กรุณาเลือกวันเดือนปีเกิด' })
    .min(1, 'กรุณาเลือกวันเดือนปีเกิด')
    .refine(isValidBirthDate, 'วันเดือนปีเกิดต้องเป็นวันที่รูปแบบ YYYY-MM-DD และอยู่ระหว่างปี 1900 ถึงปัจจุบัน'),
  year: z
    .number({ error: 'กรุณาเลือกชั้นปี' })
    .int()
    .min(1, 'ชั้นปีต้องเป็นตัวเลข 1 ถึง 8')
    .max(8, 'ชั้นปีต้องเป็นตัวเลข 1 ถึง 8'),
  email: z.union([z.literal(''), z.email('รูปแบบอีเมลไม่ถูกต้อง')]),
})

const form = ref({
  studentCode: '',
  firstName: '',
  lastName: '',
  birthDate: '',
  year: undefined as number | undefined,
  email: '',
})

// Reset the form from the prop every time the dialog opens (values the user
// typed on a failed submit are kept while the dialog stays open).
watch(open, (value) => {
  if (!value) return
  form.value = {
    studentCode: props.student?.studentCode ?? '',
    firstName: props.student?.firstName ?? '',
    lastName: props.student?.lastName ?? '',
    birthDate: props.student?.birthDate ?? '',
    year: props.student?.year,
    email: props.student?.email ?? '',
  }
  serverCodeError.value = null
})

// Duplicate student code comes back as 409 — show it inline next to the field.
const serverCodeError = ref<string | null>(null)
watch(
  () => form.value.studentCode,
  () => {
    serverCodeError.value = null
  },
)

const submitting = ref(false)

const onSubmit = async (): Promise<void> => {
  if (submitting.value) return
  submitting.value = true
  try {
    const payload = {
      studentCode: form.value.studentCode.trim(),
      firstName: form.value.firstName.trim(),
      lastName: form.value.lastName.trim(),
      birthDate: form.value.birthDate,
      year: form.value.year!,
      ...(form.value.email.trim() ? { email: form.value.email.trim() } : {}),
    }
    const res = isEdit.value
      ? await nuxtApp.$api<ApiEnvelope<Student>>(`/students/${props.student?.id}`, {
          method: 'PATCH',
          body: payload,
        })
      : await nuxtApp.$api<ApiEnvelope<Student>>('/students', { method: 'POST', body: payload })
    toast.add({
      title: isEdit.value ? 'บันทึกการแก้ไขนักศึกษาสำเร็จ' : 'เพิ่มนักศึกษาสำเร็จ',
      color: 'success',
      icon: 'lucide:circle-check',
    })
    open.value = false
    emit('saved', res.data)
  } catch (error) {
    const fetchError = error as FetchError
    if (fetchError?.status === 409) {
      serverCodeError.value = getApiErrorMessage(error, 'รหัสนักศึกษานี้มีอยู่ในระบบแล้ว')
    } else {
      toast.add({
        title: getApiErrorMessage(error, 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง'),
        color: 'error',
        icon: 'lucide:circle-alert',
      })
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEdit ? 'แก้ไขข้อมูลนักศึกษา' : 'เพิ่มนักศึกษา'"
    :description="isEdit ? student?.studentCode : 'กรอกข้อมูลนักศึกษาใหม่ของสาขา'"
  >
    <template #body>
      <UForm :schema="schema" :state="form" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField
          label="รหัสนักศึกษา"
          name="studentCode"
          required
          :error="serverCodeError ?? undefined"
          help="ตัวเลข 12 หลัก"
        >
          <UInput
            v-model="form.studentCode"
            class="w-full"
            inputmode="numeric"
            maxlength="12"
            :disabled="submitting"
          />
        </UFormField>

        <UFormField label="ชื่อจริง" name="firstName" required>
          <UInput v-model="form.firstName" class="w-full" :disabled="submitting" />
        </UFormField>

        <UFormField label="นามสกุล" name="lastName" required>
          <UInput v-model="form.lastName" class="w-full" :disabled="submitting" />
        </UFormField>

        <UFormField label="วันเดือนปีเกิด" name="birthDate" required help="รูปแบบ YYYY-MM-DD (ปี ค.ศ.)">
          <UInput v-model="form.birthDate" type="date" class="w-full" :disabled="submitting" />
        </UFormField>

        <UFormField label="ชั้นปี" name="year" required>
          <USelect
            v-model="form.year"
            :items="yearItems"
            class="w-full"
            placeholder="เลือกชั้นปี"
            :disabled="submitting"
          />
        </UFormField>

        <UFormField label="อีเมล" name="email" optional help="ไม่จำเป็น">
          <UInput v-model="form.email" type="email" class="w-full" :disabled="submitting" />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="ยกเลิก" :disabled="submitting" @click="open = false" />
          <UButton type="submit" icon="lucide:save" :loading="submitting" :disabled="submitting">
            {{ isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มนักศึกษา' }}
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>
</template>
