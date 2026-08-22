<script setup lang="ts">
// Simple page header: title, optional subtitle and a slot for page actions.
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
    <div class="min-w-0">
      <h1 class="text-2xl font-bold text-highlighted">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-muted">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
