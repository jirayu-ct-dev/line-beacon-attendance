<script setup lang="ts">
import type { FetchError } from 'ofetch'
import { z } from 'zod'
import type { ApiEnvelope, Beacon } from '~/utils/api'

/**
 * Register/edit beacon form in a dialog (short, bounded task — per skill the
 * dialog is the right container). Edit mode when `beacon` is provided; the
 * same dialog is reused on the list and detail pages.
 */
const props = defineProps<{
  beacon?: Beacon | null
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [beacon: Beacon] }>()

const toast = useToast()
const nuxtApp = useNuxtApp()

const isEdit = computed(() => !!props.beacon)

const schema = z.object({
  hwid: z
    .string({ error: 'กรุณากรอก HWID' })
    .trim()
    .regex(/^[0-9a-fA-F]{10}$/, 'HWID ต้องเป็นเลขฐานสิบหก 10 ตัวอักษร (0-9, a-f)'),
  name: z.string({ error: 'กรุณากรอกชื่อบีคอน' }).trim().min(1, 'กรุณากรอกชื่อบีคอน'),
  location: z.string().trim(),
  description: z.string().trim(),
})

const form = ref({
  hwid: '',
  name: '',
  location: '',
  description: '',
})

// Reset the form from the prop every time the dialog opens (values the user
// typed on a failed submit are kept while the dialog stays open).
watch(open, (value) => {
  if (!value) return
  form.value = {
    hwid: props.beacon?.hwid ?? '',
    name: props.beacon?.name ?? '',
    location: props.beacon?.location ?? '',
    description: props.beacon?.description ?? '',
  }
  serverHwidError.value = null
})

// Duplicate hwid comes back as 409 — show it inline next to the field.
const serverHwidError = ref<string | null>(null)
watch(
  () => form.value.hwid,
  () => {
    serverHwidError.value = null
  },
)

const submitting = ref(false)

const onSubmit = async (): Promise<void> => {
  if (submitting.value) return
  submitting.value = true
  try {
    const payload = {
      hwid: form.value.hwid.trim(),
      name: form.value.name.trim(),
      ...(form.value.location.trim() ? { location: form.value.location.trim() } : {}),
      ...(form.value.description.trim() ? { description: form.value.description.trim() } : {}),
    }
    const res = isEdit.value
      ? await nuxtApp.$api<ApiEnvelope<Beacon>>(`/beacons/${props.beacon?.id}`, {
          method: 'PATCH',
          body: payload,
        })
      : await nuxtApp.$api<ApiEnvelope<Beacon>>('/beacons', { method: 'POST', body: payload })
    toast.add({
      title: isEdit.value ? 'บันทึกการแก้ไขบีคอนสำเร็จ' : 'ลงทะเบียนบีคอนสำเร็จ',
      color: 'success',
      icon: 'lucide:circle-check',
    })
    open.value = false
    emit('saved', res.data)
  } catch (error) {
    const fetchError = error as FetchError
    if (fetchError?.status === 409) {
      serverHwidError.value = getApiErrorMessage(error, 'HWID นี้ถูกลงทะเบียนไว้ในระบบแล้ว')
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
    :title="isEdit ? 'แก้ไขข้อมูลบีคอน' : 'ลงทะเบียนบีคอน'"
    :description="isEdit ? beacon?.hwid : 'ลงทะเบียน HWID ที่ LINE ออกให้สำหรับอุปกรณ์บีคอน'"
  >
    <template #body>
      <UForm :schema="schema" :state="form" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField
          label="HWID"
          name="hwid"
          required
          :error="serverHwidError ?? undefined"
          help="เลขฐานสิบหก 10 ตัวอักษร ที่ได้จาก LINE Official Account Manager"
        >
          <UInput v-model="form.hwid" class="w-full" maxlength="10" :disabled="submitting" />
        </UFormField>

        <UFormField label="ชื่อบีคอน" name="name" required>
          <UInput v-model="form.name" class="w-full" :disabled="submitting" />
        </UFormField>

        <UFormField label="สถานที่" name="location" optional help="ไม่จำเป็น เช่น CS101">
          <UInput v-model="form.location" class="w-full" :disabled="submitting" />
        </UFormField>

        <UFormField label="คำอธิบาย" name="description" optional help="ไม่จำเป็น">
          <UTextarea v-model="form.description" class="w-full" :rows="3" :disabled="submitting" />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="ยกเลิก" :disabled="submitting" @click="open = false" />
          <UButton type="submit" icon="lucide:save" :loading="submitting" :disabled="submitting">
            {{ isEdit ? 'บันทึกการแก้ไข' : 'ลงทะเบียนบีคอน' }}
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>
</template>
