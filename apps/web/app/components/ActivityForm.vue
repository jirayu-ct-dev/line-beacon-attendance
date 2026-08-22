<script setup lang="ts">
import { z } from 'zod'
import type { ApiEnvelope, Activity, ActivityDetail } from '~/utils/api'
import { bangkokInputToUtc, utcToBangkokInput } from '~/utils/datetime'

/**
 * Create/edit activity form (spec §11). A full page's worth of fields (5
 * datetimes), so it lives on its own pages (/activities/create and
 * /activities/[id]/edit) rather than a dialog. Datetime inputs are Bangkok
 * wall time; the API receives ISO UTC (design doc §6.3).
 */
const props = defineProps<{
  activity?: Activity | null
}>()

const emit = defineEmits<{ saved: [activity: ActivityDetail] }>()

const toast = useToast()
const nuxtApp = useNuxtApp()

const isEdit = computed(() => !!props.activity)

const REQUIRED_TIME = 'กรุณาระบุเวลา'

const schema = z
  .object({
    name: z.string({ error: 'กรุณากรอกชื่อกิจกรรม' }).trim().min(1, 'กรุณากรอกชื่อกิจกรรม'),
    description: z.string().trim(),
    location: z.string().trim(),
    startAt: z.string().min(1, REQUIRED_TIME),
    endAt: z.string().min(1, REQUIRED_TIME),
    checkinOpenAt: z.string().min(1, REQUIRED_TIME),
    lateAt: z.string().min(1, REQUIRED_TIME),
    checkinCloseAt: z.string().min(1, REQUIRED_TIME),
  })
  // Time ordering per spec §47 — messages mirror the API so both layers agree.
  .superRefine((value, ctx) => {
    const toUtc = (input: string): number | null => {
      const utc = bangkokInputToUtc(input)
      return utc === null ? null : new Date(utc).getTime()
    }
    const [start, end, open, late, close] = [
      value.startAt,
      value.endAt,
      value.checkinOpenAt,
      value.lateAt,
      value.checkinCloseAt,
    ].map(toUtc)
    if ([start, end, open, late, close].some((t) => t === null)) return
    const issue = (path: string, message: string): void =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    if (start! >= end!) issue('endAt', 'เวลาสิ้นสุดต้องหลังเวลาเริ่มกิจกรรม')
    if (open! > start!) issue('checkinOpenAt', 'เวลาเปิดเช็คชื่อต้องไม่ช้ากว่าเวลาเริ่มกิจกรรม')
    if (late! < open!) issue('lateAt', 'เวลาเกณฑ์มาสายต้องไม่เร็วกว่าเวลาเปิดเช็คชื่อ')
    if (late! > close!) issue('checkinCloseAt', 'เวลาปิดเช็คชื่อต้องไม่เร็วกว่าเวลาเกณฑ์มาสาย')
    if (close! > end!) issue('checkinCloseAt', 'เวลาปิดเช็คชื่อต้องไม่ช้ากว่าเวลาสิ้นสุดกิจกรรม')
  })

type FormState = {
  name: string
  description: string
  location: string
  startAt: string
  endAt: string
  checkinOpenAt: string
  lateAt: string
  checkinCloseAt: string
}

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  location: '',
  startAt: '',
  endAt: '',
  checkinOpenAt: '',
  lateAt: '',
  checkinCloseAt: '',
})

const form = ref<FormState>(emptyForm())

onMounted(() => {
  if (!props.activity) return
  form.value = {
    name: props.activity.name,
    description: props.activity.description ?? '',
    location: props.activity.location ?? '',
    startAt: utcToBangkokInput(props.activity.startAt),
    endAt: utcToBangkokInput(props.activity.endAt),
    checkinOpenAt: utcToBangkokInput(props.activity.checkinOpenAt),
    lateAt: utcToBangkokInput(props.activity.lateAt),
    checkinCloseAt: utcToBangkokInput(props.activity.checkinCloseAt),
  }
})

const submitting = ref(false)

const onSubmit = async (): Promise<void> => {
  if (submitting.value) return
  submitting.value = true
  try {
    // Bangkok wall time → ISO UTC; trailing-empty optionals are omitted.
    const payload = {
      name: form.value.name.trim(),
      ...(form.value.description.trim() ? { description: form.value.description.trim() } : {}),
      ...(form.value.location.trim() ? { location: form.value.location.trim() } : {}),
      startAt: bangkokInputToUtc(form.value.startAt)!,
      endAt: bangkokInputToUtc(form.value.endAt)!,
      checkinOpenAt: bangkokInputToUtc(form.value.checkinOpenAt)!,
      lateAt: bangkokInputToUtc(form.value.lateAt)!,
      checkinCloseAt: bangkokInputToUtc(form.value.checkinCloseAt)!,
    }
    const res = isEdit.value
      ? await nuxtApp.$api<ApiEnvelope<ActivityDetail>>(`/activities/${props.activity?.id}`, {
          method: 'PATCH',
          body: payload,
        })
      : await nuxtApp.$api<ApiEnvelope<ActivityDetail>>('/activities', { method: 'POST', body: payload })
    toast.add({
      title: isEdit.value ? 'บันทึกการแก้ไขกิจกรรมสำเร็จ' : 'สร้างกิจกรรมสำเร็จ (ฉบับร่าง)',
      color: 'success',
      icon: 'lucide:circle-check',
    })
    emit('saved', res.data)
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    submitting.value = false
  }
}

const onCancel = (): void => {
  navigateTo(props.activity ? `/activities/${props.activity.id}` : '/activities')
}

const timeFields: { key: keyof FormState; label: string; help?: string }[] = [
  { key: 'checkinOpenAt', label: 'เปิดเช็คชื่อ' },
  { key: 'startAt', label: 'เริ่มกิจกรรม' },
  { key: 'lateAt', label: 'เกณฑ์มาสาย', help: 'เช็คหลังเวลานี้ถือว่า มาสาย' },
  { key: 'checkinCloseAt', label: 'ปิดเช็คชื่อ' },
  { key: 'endAt', label: 'สิ้นสุดกิจกรรม' },
]
</script>

<template>
  <UForm :schema="schema" :state="form" class="flex flex-col gap-6" @submit="onSubmit">
    <UCard>
      <div class="flex flex-col gap-4">
        <UFormField label="ชื่อกิจกรรม" name="name" required>
          <UInput v-model="form.name" class="w-full" :disabled="submitting" />
        </UFormField>

        <UFormField label="สถานที่" name="location" optional help="ไม่จำเป็น เช่น ห้องประชุมใหญ่">
          <UInput v-model="form.location" class="w-full" :disabled="submitting" />
        </UFormField>

        <UFormField label="รายละเอียด" name="description" optional help="ไม่จำเป็น">
          <UTextarea v-model="form.description" class="w-full" :rows="3" :disabled="submitting" />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <div class="flex flex-col gap-1.5">
        <h2 class="text-base font-semibold text-highlighted">เวลา (แสดงเป็นเวลาประเทศไทย ICT)</h2>
        <p class="text-sm text-muted">ระบบเก็บเวลาเป็น UTC และแสดงผลเป็นเวลาประเทศไทยทุกหน้า</p>
      </div>
      <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField
          v-for="field in timeFields"
          :key="field.key"
          :label="field.label"
          :name="field.key"
          required
          :help="field.help"
        >
          <UInput
            v-model="form[field.key]"
            type="datetime-local"
            class="w-full"
            :disabled="submitting"
          />
        </UFormField>
      </div>
    </UCard>

    <div class="flex items-center justify-end gap-2">
      <UButton color="neutral" variant="outline" label="ยกเลิก" :disabled="submitting" @click="onCancel" />
      <UButton type="submit" icon="lucide:save" :loading="submitting" :disabled="submitting">
        {{ isEdit ? 'บันทึกการแก้ไข' : 'สร้างกิจกรรม' }}
      </UButton>
    </div>
  </UForm>
</template>
