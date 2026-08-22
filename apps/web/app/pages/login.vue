<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: 'auth', middleware: 'guest' })

const route = useRoute()
const toast = useToast()
const { login } = useAuth()

const form = ref({
  username_or_email: '',
  password: '',
})

const schema = z.object({
  username_or_email: z
    .string({ error: 'กรุณากรอกชื่อผู้ใช้หรืออีเมล' })
    .min(1, 'กรุณากรอกชื่อผู้ใช้หรืออีเมล'),
  password: z.string({ error: 'กรุณากรอกรหัสผ่าน' }).min(1, 'กรุณากรอกรหัสผ่าน'),
})

const submitting = ref(false)

const onSubmit = async (): Promise<void> => {
  if (submitting.value) return
  submitting.value = true
  try {
    await login({ ...form.value })
    toast.add({ title: 'เข้าสู่ระบบสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    await navigateTo(resolveSafeRedirect(route.query.redirect), { replace: true })
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UCard>
    <UForm :schema="schema" :state="form" class="flex flex-col gap-4" @submit="onSubmit">
      <UFormField label="ชื่อผู้ใช้หรืออีเมล" name="username_or_email" required>
        <UInput
          v-model="form.username_or_email"
          class="w-full"
          autocomplete="username"
          placeholder="admin หรือ admin@example.com"
          :disabled="submitting"
        />
      </UFormField>

      <UFormField label="รหัสผ่าน" name="password" required>
        <UInput
          v-model="form.password"
          type="password"
          class="w-full"
          autocomplete="current-password"
          :disabled="submitting"
        />
      </UFormField>

      <UButton
        type="submit"
        block
        icon="lucide:log-in"
        :loading="submitting"
        :disabled="submitting"
      >
        เข้าสู่ระบบ
      </UButton>
    </UForm>
  </UCard>
</template>
