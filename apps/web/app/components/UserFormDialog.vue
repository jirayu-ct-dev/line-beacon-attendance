<script setup lang="ts">
import type { FetchError } from 'ofetch'
import { z } from 'zod'
import type { ApiEnvelope, UserRow } from '~/utils/api'

/** Create/edit account dialog (spec §28) — password/status move via their own endpoints. */
const props = defineProps<{
  user?: UserRow | null
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [user: UserRow] }>()

const toast = useToast()
const nuxtApp = useNuxtApp()

const isEdit = computed(() => !!props.user)

const ROLE_ITEMS = [
  { label: 'ผู้จัดกิจกรรม (Organizer)', value: 'ORGANIZER' },
  { label: 'ผู้ดูแลระบบ (Admin)', value: 'ADMIN' },
]

const schema = z.object({
  email: z.email({ message: 'รูปแบบอีเมลไม่ถูกต้อง' }),
  username: z
    .string({ error: 'กรุณากรอกชื่อผู้ใช้' })
    .trim()
    .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
    .max(50, 'ชื่อผู้ใช้ยาวได้สูงสุด 50 ตัวอักษร'),
  role: z.enum(['ADMIN', 'ORGANIZER'], { error: 'กรุณาเลือกบทบาท' }),
  password: z.union([z.literal(''), z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')]),
})

const form = ref({ email: '', username: '', role: undefined as 'ADMIN' | 'ORGANIZER' | undefined, password: '' })

watch(open, (value) => {
  if (!value) return
  form.value = {
    email: props.user?.email ?? '',
    username: props.user?.username ?? '',
    role: props.user?.role,
    password: '',
  }
  serverError.value = null
})

const serverError = ref<string | null>(null)
const submitting = ref(false)

const onSubmit = async (): Promise<void> => {
  if (submitting.value || !form.value.role) return
  submitting.value = true
  try {
    const res = isEdit.value
      ? await nuxtApp.$api<ApiEnvelope<UserRow>>(`/users/${props.user?.id}`, {
          method: 'PATCH',
          body: {
            email: form.value.email.trim(),
            username: form.value.username.trim(),
            role: form.value.role,
          },
        })
      : await nuxtApp.$api<ApiEnvelope<UserRow>>('/users', {
          method: 'POST',
          body: {
            email: form.value.email.trim(),
            username: form.value.username.trim(),
            role: form.value.role,
            password: form.value.password,
          },
        })
    toast.add({
      title: isEdit.value ? 'บันทึกการแก้ไขสำเร็จ' : 'สร้างบัญชีสำเร็จ',
      color: 'success',
      icon: 'lucide:circle-check',
    })
    open.value = false
    emit('saved', res.data)
  } catch (error) {
    const fetchError = error as FetchError
    if (fetchError?.status === 409) {
      serverError.value = getApiErrorMessage(error, 'อีเมลหรือชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว')
    } else {
      serverError.value = getApiErrorMessage(error, 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEdit ? 'แก้ไขบัญชี' : 'สร้างบัญชี'"
    :description="isEdit ? user?.username : 'สร้างบัญชีผู้จัดกิจกรรมหรือผู้ดูแลระบบ (spec §28)'"
  >
    <template #body>
      <UForm :schema="schema" :state="form" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField label="อีเมล" name="email" required>
          <UInput v-model="form.email" type="email" class="w-full" :disabled="submitting" />
        </UFormField>

        <UFormField label="ชื่อผู้ใช้" name="username" required>
          <UInput v-model="form.username" class="w-full" :disabled="submitting" />
        </UFormField>

        <UFormField label="บทบาท" name="role" required>
          <USelect v-model="form.role" :items="ROLE_ITEMS" class="w-full" placeholder="เลือกบทบาท" :disabled="submitting" />
        </UFormField>

        <UFormField
          v-if="!isEdit"
          label="รหัสผ่านชั่วคราว"
          name="password"
          required
          help="อย่างน้อย 8 ตัวอักษร — แจ้งให้เจ้าของบัญชีเปลี่ยนภายหลังได้"
        >
          <UInput v-model="form.password" type="password" class="w-full" :disabled="submitting" />
        </UFormField>

        <p v-if="serverError" class="text-sm text-error" role="alert">{{ serverError }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="ยกเลิก" :disabled="submitting" @click="open = false" />
          <UButton type="submit" icon="lucide:save" :loading="submitting" :disabled="submitting">
            {{ isEdit ? 'บันทึกการแก้ไข' : 'สร้างบัญชี' }}
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>
</template>
