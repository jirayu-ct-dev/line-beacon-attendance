<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { user } = useAuth()

const roleLabel = computed(() => (user.value?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'ผู้จัดกิจกรรม'))
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="ภาพรวม" subtitle="สรุปกิจกรรมและการเช็คชื่อล่าสุดของสาขา" />

    <UCard>
      <div class="flex items-center gap-4">
        <div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon name="lucide:circle-user" class="size-6 text-primary" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-highlighted">ยินดีต้อนรับ{{ user ? `, ${user.username}` : '' }}</p>
          <p class="text-sm text-muted">
            บทบาท: {{ roleLabel }}<span v-if="user"> · {{ user.email }}</span>
          </p>
        </div>
      </div>
    </UCard>

    <p class="text-sm text-muted">
      การ์ดสถิติ (กิจกรรมวันนี้ ผู้เข้าร่วมวันนี้ เข้าร่วม/มาสาย) และรายการกิจกรรมที่กำลังเปิด
      Check-in จะเพิ่มเข้ามาในเฟสถัดไป
    </p>
  </div>
</template>
