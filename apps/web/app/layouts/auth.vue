<script setup lang="ts">
// Auth pages (design doc §6.1): centered card, no sidebar.
</script>

<template>
  <div class="flex min-h-svh flex-col items-center justify-center bg-muted px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-8 flex flex-col items-center gap-2 text-center">
        <Icon name="lucide:radio" class="size-10 text-primary" aria-hidden="true" />
        <h1 class="text-xl font-bold text-highlighted">LINE Beacon Attendance</h1>
        <p class="text-sm text-muted">ระบบเช็คชื่อนักศึกษาอัตโนมัติด้วย LINE Beacon</p>
      </div>
      <slot />
    </div>
  </div>
</template>
