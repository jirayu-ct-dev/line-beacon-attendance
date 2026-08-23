<script setup lang="ts">
/**
 * Student profile + LINE link status + self unlink (spec §21, design doc §6.5).
 * The attendance history moved to /liff/history. All data comes from the
 * shared LIFF session (GET /me) authenticated with the LINE ID Token.
 */
definePageMeta({ layout: 'liff' })

const toast = useToast()
const { confirm } = useConfirm()
const { token, me, reload } = useLiffSession()
const { request } = useLiffApi()

const unlinking = ref(false)

const onUnlink = async (): Promise<void> => {
  if (!token.value || unlinking.value) return
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
    await request<null>('/line/unlink', { method: 'POST', token: token.value })
    toast.add({ title: 'ยกเลิกการเชื่อมบัญชีสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    await reload()
    await navigateTo('/liff/register', { replace: true })
  } catch {
    toast.add({ title: 'ยกเลิกการเชื่อมบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง', color: 'error', icon: 'lucide:circle-alert' })
  } finally {
    unlinking.value = false
  }
}
</script>

<template>
  <LiffPageGate require-linked>
    <h1 class="mb-4 text-base font-semibold text-highlighted">โปรไฟล์ของฉัน</h1>

    <UCard v-if="me?.linked">
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

      <dl class="mt-5 grid gap-x-6 gap-y-3">
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
      class="mt-4 self-center"
      @click="onUnlink"
    />
  </LiffPageGate>
</template>
