<script setup lang="ts">
import type { ActivityDetail } from '~/utils/api'

definePageMeta({ middleware: 'auth' })

const onSaved = (activity: ActivityDetail): void => {
  // A fresh activity is a DRAFT — the detail page is where beacons get linked
  // and publishing happens (spec §61 flow: create → link → publish).
  navigateTo(`/activities/${activity.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="สร้างกิจกรรม" subtitle="กิจกรรมใหม่จะเริ่มเป็นฉบับร่าง (DRAFT)">
      <template #actions>
        <UButton to="/activities" color="neutral" variant="outline" icon="lucide:arrow-left" label="กลับไปรายการ" />
      </template>
    </PageHeader>

    <ActivityForm @saved="onSaved" />
  </div>
</template>
