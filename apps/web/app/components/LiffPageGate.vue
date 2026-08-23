<script setup lang="ts">
/**
 * Shared session gate for every /liff page (spec §53 states): renders the
 * initializing / unconfigured / init-error / not-logged-in /me-error cards and
 * only exposes its slot once the session is usable. With `requireLinked` it
 * also bounces unlinked LINE users to /liff/register (spec §7.1 flow) instead
 * of each page repeating that guard.
 */
const props = withDefaults(defineProps<{ requireLinked?: boolean }>(), { requireLinked: false })

const { status, start, login } = useLiff()
const { token, me, loading, error, linked, ensure, reload } = useLiffSession()

// The layout owns the primary ensure() watch; this is a no-op after that.
void ensure()

// Unlinked users have nothing to see on linked-only pages — register first.
watch(
  () => ({ resolved: !loading.value && me.value !== null, isLinked: linked.value }),
  ({ resolved, isLinked }) => {
    if (props.requireLinked && resolved && !isLinked) {
      void navigateTo('/liff/register', { replace: true })
    }
  },
)

// The token is already resolved when /me failed, so ensure() alone would no-op.
const retry = async (): Promise<void> => {
  await start()
  await reload()
}
</script>

<template>
  <!-- LIFF SDK initializing -->
  <div
    v-if="status === 'initializing'"
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

  <!-- LIFF init error -->
  <UCard v-else-if="status === 'error'">
    <div class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
      <h2 class="text-lg font-semibold text-highlighted">เปิดหน้านี้ไม่สำเร็จ</h2>
      <p class="max-w-sm text-sm text-muted">เกิดข้อผิดพลาดในการเชื่อมต่อกับ LINE กรุณาลองใหม่อีกครั้ง</p>
      <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองใหม่" @click="start" />
    </div>
  </UCard>

  <!-- session resolving (LIFF ready, token + /me in flight) -->
  <div
    v-else-if="status === 'ready' && loading && !token"
    class="flex flex-col items-center gap-3 py-16 text-center"
    role="status"
    aria-label="กำลังโหลดข้อมูล"
  >
    <Icon name="lucide:loader-circle" class="size-8 animate-spin text-primary" aria-hidden="true" />
    <p class="text-sm text-muted">กำลังโหลดข้อมูล...</p>
  </div>

  <!-- external browser, not logged in to LINE -->
  <UCard v-else-if="!token">
    <div class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:log-in" class="size-10 text-primary" aria-hidden="true" />
      <h2 class="text-lg font-semibold text-highlighted">กรุณาเข้าสู่ระบบด้วยบัญชี LINE</h2>
      <p class="max-w-sm text-sm text-muted">
        หน้านี้ต้องยืนยันตัวตนผ่านบัญชี LINE ของนักศึกษา แนะนำให้เปิดหน้านี้ในแอป LINE
      </p>
      <UButton icon="lucide:log-in" label="เข้าสู่ระบบด้วย LINE" @click="login" />
    </div>
  </UCard>

  <!-- /me failed (retryable) -->
  <UCard v-else-if="error">
    <div class="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
      <p class="text-sm text-muted">{{ error }}</p>
      <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองใหม่" @click="retry" />
    </div>
  </UCard>

  <!-- linked-only page, /me answer pending or redirecting to register -->
  <div
    v-else-if="requireLinked && !linked"
    class="flex flex-col items-center gap-3 py-16 text-center"
    role="status"
    aria-label="กำลังตรวจสอบการเชื่อมบัญชี"
  >
    <Icon name="lucide:loader-circle" class="size-8 animate-spin text-primary" aria-hidden="true" />
    <p class="text-sm text-muted">กำลังตรวจสอบการเชื่อมบัญชี...</p>
  </div>

  <!-- session ready -->
  <slot v-else />
</template>
