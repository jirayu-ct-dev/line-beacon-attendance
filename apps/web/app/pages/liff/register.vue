<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ApiErrorEnvelope, MeResponse } from '~/utils/api'
import { liffRegisterSchema } from '~/utils/liff-register'

/**
 * LIFF account linking (spec §7.1, design doc §6.5): student code (12 digits)
 * + birth date (DDMMYYYY ค.ศ.). The Bearer token sent to /line/link is the
 * LINE ID Token — the backend verifies it and never trusts client input for
 * the LINE identity.
 */
definePageMeta({ layout: 'liff' })

const toast = useToast()
const { status, start, getIdToken, login } = useLiff()
const { request } = useLiffApi()

const sessionToken = ref<string | null>(null)
const checking = ref(false)
/** Filled when this LINE account is already linked — replaces the form. */
const linkedInfo = ref<MeResponse | null>(null)

const ensureSession = async (): Promise<void> => {
  if (status.value !== 'ready' || sessionToken.value) return
  checking.value = true
  try {
    const token = await getIdToken()
    sessionToken.value = token
    if (!token) return // external browser, not logged in -> login prompt
    const me = await request<MeResponse>('/me', { token })
    if (me.linked) linkedInfo.value = me
  } catch {
    // A failed /me must not block the form — submit surfaces API errors itself.
  } finally {
    checking.value = false
  }
}

watch(status, () => void ensureSession(), { immediate: true })

const form = ref({ studentCode: '', birthDate: '' })
const submitting = ref(false)

const onSubmit = async (): Promise<void> => {
  if (submitting.value || !sessionToken.value) return
  submitting.value = true
  try {
    await request<MeResponse>('/line/link', {
      method: 'POST',
      body: {
        studentCode: form.value.studentCode.trim(),
        birthDate: form.value.birthDate.trim(),
      },
      token: sessionToken.value,
    })
    toast.add({ title: 'เชื่อมต่อบัญชี LINE สำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    await navigateTo('/liff/profile', { replace: true })
  } catch (error) {
    // The API's Thai message covers every failure incl. 429 RATE_LIMITED.
    const fetchError = error as FetchError<ApiErrorEnvelope>
    toast.add({
      title: fetchError?.data?.error?.message ?? 'เชื่อมต่อบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง',
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!-- initializing -->
  <div
    v-if="status === 'initializing' || checking"
    class="flex flex-col items-center gap-3 py-16 text-center"
    role="status"
    aria-label="กำลังเชื่อมต่อกับ LINE"
  >
    <Icon name="lucide:loader-circle" class="size-8 animate-spin text-primary" aria-hidden="true" />
    <p class="text-sm text-muted">กำลังเชื่อมต่อกับ LINE...</p>
  </div>

  <!-- LIFF id unset (dev) -->
  <UCard v-else-if="status === 'unconfigured'">
    <div class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:settings" class="size-10 text-muted" aria-hidden="true" />
      <h2 class="text-lg font-semibold text-highlighted">ยังไม่ได้ตั้งค่า LIFF</h2>
      <p class="max-w-sm text-sm text-muted">
        หน้านี้ต้องเปิดผ่านแอป LINE เท่านั้น (สำหรับนักศึกษา)
        หากคุณกำลังพัฒนาระบบ กรุณาตั้งค่า <code>NUXT_PUBLIC_LIFF_ID</code> ก่อน
      </p>
    </div>
  </UCard>

  <!-- init error -->
  <UCard v-else-if="status === 'error'">
    <div class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
      <h2 class="text-lg font-semibold text-highlighted">เปิดหน้านี้ไม่สำเร็จ</h2>
      <p class="max-w-sm text-sm text-muted">เกิดข้อผิดพลาดในการเชื่อมต่อกับ LINE กรุณาลองใหม่อีกครั้ง</p>
      <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองใหม่" @click="start" />
    </div>
  </UCard>

  <!-- external browser, not logged in -->
  <UCard v-else-if="!sessionToken">
    <div class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:log-in" class="size-10 text-primary" aria-hidden="true" />
      <h2 class="text-lg font-semibold text-highlighted">กรุณาเข้าสู่ระบบด้วยบัญชี LINE</h2>
      <p class="max-w-sm text-sm text-muted">
        การลงทะเบียนเชื่อมบัญชีต้องยืนยันตัวตนผ่านบัญชี LINE ของนักศึกษา
        แนะนำให้เปิดหน้านี้ในแอป LINE
      </p>
      <UButton icon="lucide:log-in" label="เข้าสู่ระบบด้วย LINE" @click="login" />
    </div>
  </UCard>

  <!-- already linked -->
  <UCard v-else-if="linkedInfo?.linked">
    <div class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:link-check" class="size-10 text-success" aria-hidden="true" />
      <h2 class="text-lg font-semibold text-highlighted">บัญชี LINE นี้เชื่อมต่ออยู่แล้ว</h2>
      <p class="max-w-sm text-sm text-muted">
        เชื่อมกับรหัสนักศึกษา {{ linkedInfo.student?.studentCode }}
        ({{ linkedInfo.student?.firstName }} {{ linkedInfo.student?.lastName }})
      </p>
      <UButton to="/liff/profile" icon="lucide:user" label="ดูโปรไฟล์ของฉัน" />
    </div>
  </UCard>

  <!-- the form -->
  <UCard v-else>
    <div class="mb-5 flex flex-col gap-1">
      <h2 class="text-lg font-semibold text-highlighted">ลงทะเบียนเชื่อมบัญชี LINE</h2>
      <p class="text-sm text-muted">
        กรอกรหัสนักศึกษาและวันเดือนปีเกิดเพื่อเชื่อมบัญชี LINE กับข้อมูลนักศึกษา
        ระบบจะใช้บัญชีนี้เช็คชื่ออัตโนมัติผ่าน LINE Beacon
      </p>
    </div>

    <UForm :schema="liffRegisterSchema" :state="form" class="flex flex-col gap-4" @submit="onSubmit">
      <UFormField label="รหัสนักศึกษา" name="studentCode" required help="ตัวเลข 12 หลัก">
        <UInput
          v-model="form.studentCode"
          class="w-full"
          inputmode="numeric"
          autocomplete="off"
          maxlength="12"
          :disabled="submitting"
        />
      </UFormField>

      <UFormField label="วันเดือนปีเกิด" name="birthDate" required help="กรอกเป็นปี ค.ศ. เช่น 01012004 (1 มกราคม 2004)">
        <UInput
          v-model="form.birthDate"
          class="w-full"
          inputmode="numeric"
          autocomplete="off"
          maxlength="8"
          :disabled="submitting"
        />
      </UFormField>

      <UButton type="submit" block icon="lucide:link" :loading="submitting" :disabled="submitting">
        เชื่อมต่อบัญชี LINE
      </UButton>
    </UForm>
  </UCard>
</template>
