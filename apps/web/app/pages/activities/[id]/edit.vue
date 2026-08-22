<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ApiEnvelope, ActivityDetail } from '~/utils/api'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const nuxtApp = useNuxtApp()

const activity = ref<ActivityDetail | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const notFound = ref(false)

const fetchActivity = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<ActivityDetail>>(`/activities/${route.params.id}`)
    activity.value = res.data
    notFound.value = false
  } catch (error) {
    const fetchError = error as FetchError
    notFound.value = fetchError?.status === 404
    activity.value = null
    if (!notFound.value) {
      loadError.value = getApiErrorMessage(error, 'โหลดข้อมูลกิจกรรมไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchActivity)

const onSaved = (updated: ActivityDetail): void => {
  activity.value = updated
  navigateTo(`/activities/${updated.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="แก้ไขกิจกรรม">
      <template #actions>
        <UButton
          v-if="activity"
          :to="`/activities/${activity.id}`"
          color="neutral"
          variant="outline"
          icon="lucide:arrow-left"
          label="กลับไปรายละเอียด"
        />
      </template>
    </PageHeader>

    <div v-if="loading" class="flex flex-col gap-4" role="status" aria-label="กำลังโหลดข้อมูล">
      <USkeleton class="h-8 w-64" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UCard v-else-if="notFound" class="py-16">
      <div class="flex flex-col items-center gap-3 text-center">
        <Icon name="lucide:search-x" class="size-10 text-muted" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่พบกิจกรรม</h2>
        <p class="text-sm text-muted">รายการกิจกรรมนี้อาจถูกลบไปแล้ว หรือรหัสอ้างอิงไม่ถูกต้อง</p>
        <UButton to="/activities" color="neutral" variant="outline" icon="lucide:arrow-left" label="กลับไปรายการ" />
      </div>
    </UCard>

    <UCard v-else-if="loadError">
      <div class="flex flex-col items-center gap-3 py-10 text-center">
        <Icon name="lucide:circle-alert" class="size-10 text-error" aria-hidden="true" />
        <p class="text-sm text-muted">{{ loadError }}</p>
        <UButton color="neutral" variant="outline" icon="lucide:rotate-ccw" label="ลองอีกครั้ง" @click="fetchActivity" />
      </div>
    </UCard>

    <ActivityForm v-else-if="activity" :activity="activity" @saved="onSaved" />
  </div>
</template>
