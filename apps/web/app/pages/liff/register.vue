<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ApiErrorEnvelope, MeResponse } from '~/utils/api'
import { liffRegisterSchema } from '~/utils/liff-register'

/**
 * LIFF account linking (spec §7.1, design doc §6.5): student code (12 digits)
 * + birth date (DDMMYYYY ค.ศ.). The Bearer token sent to /line/link is the
 * LINE ID Token — the backend verifies it and never trusts client input for
 * the LINE identity. No requireLinked here — this page exists precisely for
 * unlinked users.
 */
definePageMeta({ layout: 'liff' })

const toast = useToast()
const { token, me, reload } = useLiffSession()
const { request } = useLiffApi()

const form = ref({ studentCode: '', birthDate: '' })
const submitting = ref(false)

const onSubmit = async (): Promise<void> => {
  if (submitting.value || !token.value) return
  submitting.value = true
  try {
    await request<MeResponse>('/line/link', {
      method: 'POST',
      body: {
        studentCode: form.value.studentCode.trim(),
        birthDate: form.value.birthDate.trim(),
      },
      token: token.value,
    })
    toast.add({ title: 'เชื่อมต่อบัญชี LINE สำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    await reload()
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
  <LiffPageGate>
    <!-- already linked -->
    <UCard v-if="me?.linked">
      <div class="flex flex-col items-center gap-3 py-8 text-center">
        <Icon name="lucide:link-check" class="size-10 text-success" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">บัญชี LINE นี้เชื่อมต่ออยู่แล้ว</h2>
        <p class="max-w-sm text-sm text-muted">
          เชื่อมกับรหัสนักศึกษา {{ me.student?.studentCode }}
          ({{ me.student?.firstName }} {{ me.student?.lastName }})
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
  </LiffPageGate>
</template>
