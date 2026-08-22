<script setup lang="ts">
import type { AttendanceItem, MeResponse } from '~/utils/api'

/**
 * Student profile + attendance history (spec §21, design doc §6.5). All data
 * comes from the LIFF endpoints (GET /me, GET /me/attendances) authenticated
 * with the LINE ID Token. An unlinked LINE user is sent back to /liff/register.
 */
definePageMeta({ layout: 'liff' })

const toast = useToast()
const { confirm } = useConfirm()
const { status, start, getIdToken, login } = useLiff()
const { request } = useLiffApi()

const sessionToken = ref<string | null>(null)
const me = ref<MeResponse | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)

const attendances = ref<AttendanceItem[]>([])
const attendancesLoading = ref(false)
const attendancesError = ref<string | null>(null)

const loadAttendances = async (token: string): Promise<void> => {
  attendancesLoading.value = true
  attendancesError.value = null
  try {
    const res = await request<{ items: AttendanceItem[]; total: number }>('/me/attendances', { token })
    attendances.value = res.items
  } catch {
    attendancesError.value = 'โหลดประวัติการเช็คชื่อไม่สำเร็จ กรุณาลองอีกครั้ง'
  } finally {
    attendancesLoading.value = false
  }
}

const load = async (): Promise<void> => {
  if (status.value !== 'ready') return
  loading.value = true
  loadError.value = null
  try {
    const token = await getIdToken()
    sessionToken.value = token
    if (!token) return // external browser, not logged in -> login prompt

    const profile = await request<MeResponse>('/me', { token })
    me.value = profile
    if (profile.linked) await loadAttendances(token)
  } catch {
    loadError.value = 'โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง'
  } finally {
    loading.value = false
  }
}

watch(status, () => void load(), { immediate: true })

// An unlinked LINE user has nothing to see here — back to the register form.
watch(me, (value) => {
  if (value && !value.linked) void navigateTo('/liff/register', { replace: true })
})

const retry = async (): Promise<void> => {
  loadError.value = null
  await load()
}

// --- unlink ---------------------------------------------------------------------------

const unlinking = ref(false)

const onUnlink = async (): Promise<void> => {
  if (!sessionToken.value || unlinking.value) return
  const confirmed = await confirm({
    title: 'ยกเลิกการเชื่อมบัญชี LINE',
    description:
      'บัญชี LINE ของคุณจะถูกยกเลิกการเชื่อมต่อกับระบบ และไม่สามารถเช็คชื่อผ่าน LINE Beacon ได้จนกว่าจะลงทะเบียนใหม่',
    confirmText: 'ยกเลิกการเชื่อม',
    tone: 'error',
  })
  if (!confirmed) return
  unlinking.value = true
  try {
    await request<null>('/line/unlink', { method: 'POST', token: sessionToken.value })
    toast.add({ title: 'ยกเลิกการเชื่อมบัญชีสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    await navigateTo('/liff/register', { replace: true })
  } catch {
    toast.add({ title: 'ยกเลิกการเชื่อมบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง', color: 'error', icon: 'lucide:circle-alert' })
  } finally {
    unlinking.value = false
  }
}
</script>

<template>
  <!-- initializing -->
  <div
    v-if="status === 'initializing' || loading"
    class="flex flex-col items-center gap-3 py-16 text-center"
    role="status"
    aria-label="กำลังโหลดข้อมูล"
  >
    <Icon name="lucide:loader-circle" class="size-8 animate-spin text-primary" aria-hidden="true" />
    <p class="text-sm text-muted">กำลังโหลดข้อมูล...</p>
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
      <p class="max-w-sm text-sm text-muted">แนะนำให้เปิดหน้านี้ในแอป LINE</p>
      <UButton icon="lucide:log-in" label="เข้าสู่ระบบด้วย LINE" @click="login" />
    </div>
  </UCard>

  <!-- /me failed -->
  <UCard v-else-if="loadError">
    <div class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
      <p class="text-sm text-muted">{{ loadError }}</p>
      <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองใหม่" @click="retry" />
    </div>
  </UCard>

  <!-- redirecting to register (not linked) / loaded profile -->
  <template v-else-if="me?.linked">
    <UCard>
      <div class="flex items-center gap-4">
        <img
          v-if="me.line?.pictureUrl"
          :src="me.line.pictureUrl"
          alt=""
          class="size-14 shrink-0 rounded-full object-cover"
        />
        <div v-else class="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon name="lucide:circle-user" class="size-7 text-primary" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <p class="truncate font-semibold text-highlighted">{{ me.line?.displayName ?? 'นักศึกษา' }}</p>
          <p class="text-xs text-muted">เชื่อมต่อบัญชี LINE เมื่อ {{ formatDate(me.line?.linkedAt ?? '') }}</p>
        </div>
      </div>

      <dl class="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted">รหัสนักศึกษา</dt>
          <dd class="font-medium text-highlighted">{{ me.student?.studentCode }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted">ชื่อ-สกุล</dt>
          <dd class="font-medium text-highlighted">{{ me.student?.firstName }} {{ me.student?.lastName }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted">ชั้นปี</dt>
          <dd class="font-medium text-highlighted">ชั้นปี {{ me.student?.year }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted">สถานะ</dt>
          <dd><StatusBadge :status="me.student?.status ?? 'ACTIVE'" /></dd>
        </div>
      </dl>
    </UCard>

    <UButton
      color="error"
      variant="outline"
      icon="lucide:unlink"
      label="ยกเลิกการเชื่อมบัญชี LINE"
      :loading="unlinking"
      :disabled="unlinking"
      class="self-center"
      @click="onUnlink"
    />

    <section aria-labelledby="attendance-heading">
      <h2 id="attendance-heading" class="mb-3 text-base font-semibold text-highlighted">ประวัติการเช็คชื่อ</h2>

      <div
        v-if="attendancesLoading"
        class="flex flex-col gap-3"
        role="status"
        aria-label="กำลังโหลดประวัติการเช็คชื่อ"
      >
        <USkeleton v-for="n in 2" :key="n" class="h-16 w-full" />
      </div>

      <div v-else-if="attendancesError" class="flex flex-col items-center gap-3 py-8 text-center">
        <Icon name="lucide:circle-alert" class="size-8 text-error" aria-hidden="true" />
        <p class="text-sm text-muted">{{ attendancesError }}</p>
        <UButton
          color="neutral"
          variant="outline"
          icon="lucide:rotate-ccw"
          label="ลองใหม่"
          @click="sessionToken && loadAttendances(sessionToken)"
        />
      </div>

      <div v-else-if="attendances.length === 0" class="flex flex-col items-center gap-3 py-8 text-center">
        <Icon name="lucide:calendar-check" class="size-8 text-muted" aria-hidden="true" />
        <p class="text-sm text-muted">ยังไม่มีประวัติการเช็คชื่อ</p>
      </div>

      <ul v-else class="flex flex-col gap-3">
        <li
          v-for="attendance in attendances"
          :key="attendance.id"
          class="flex items-start justify-between gap-3 rounded-lg border border-default bg-default p-4"
        >
          <div class="min-w-0">
            <p class="font-medium text-highlighted">{{ attendance.activityName }}</p>
            <p class="mt-0.5 text-sm text-muted">เช็คชื่อเมื่อ {{ formatDateTime(attendance.checkInAt) }}</p>
          </div>
          <StatusBadge :status="attendance.status" />
        </li>
      </ul>
    </section>
  </template>

  <!-- not linked: about to be redirected to /liff/register -->
  <div v-else class="flex flex-col items-center gap-3 py-16 text-center" role="status" aria-label="กำลังตรวจสอบการเชื่อมบัญชี">
    <Icon name="lucide:loader-circle" class="size-8 animate-spin text-primary" aria-hidden="true" />
    <p class="text-sm text-muted">กำลังตรวจสอบการเชื่อมบัญชี...</p>
  </div>
</template>
