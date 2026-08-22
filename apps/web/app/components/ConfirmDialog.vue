<script setup lang="ts">
// Renders the pending useConfirm() request. Mounted once in app.vue.
const { request, settle } = useConfirm()

const open = computed(() => request.value !== null)
</script>

<template>
  <UModal
    :open="open"
    :close="false"
    :title="request?.title"
    :description="request?.description"
    role="alertdialog"
    @update:open="(value) => !value && settle(false)"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :label="request?.cancelText"
          :disabled="!request"
          @click="settle(false)"
        />
        <UButton
          :color="request?.tone === 'error' ? 'error' : 'primary'"
          :label="request?.confirmText"
          :disabled="!request"
          @click="settle(true)"
        />
      </div>
    </template>
  </UModal>
</template>
