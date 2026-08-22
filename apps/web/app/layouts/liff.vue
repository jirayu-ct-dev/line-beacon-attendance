<script setup lang="ts">
// LIFF pages (design doc §6.1): mobile-first, no sidebar, centered max-w-md.
</script>

<template>
  <div class="min-h-svh bg-muted px-4 py-8">
    <div class="mx-auto flex w-full max-w-md flex-col gap-6">
      <header class="flex flex-col items-center gap-2 text-center">
        <Icon name="lucide:radio" class="size-9 text-primary" aria-hidden="true" />
        <h1 class="text-lg font-bold text-highlighted">เช็คชื่อด้วย LINE Beacon</h1>
      </header>
      <main><slot /></main>
    </div>
  </div>
</template>
