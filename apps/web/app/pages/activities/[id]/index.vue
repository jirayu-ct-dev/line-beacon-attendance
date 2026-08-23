<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ApiEnvelope, ActivityDetail, Beacon, Paginated } from '~/utils/api'

// Spec §24: activity information, times, beacons, actions. The attendance
// section (Total/Present/Late/Absent + list) arrives with the attendance phase.
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const nuxtApp = useNuxtApp()
const toast = useToast()
const { confirm } = useConfirm()

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

const infoRows = computed(() =>
  activity.value
    ? [
        { label: 'สถานที่', value: activity.value.location || '—' },
        { label: 'รายละเอียด', value: activity.value.description || '—' },
        { label: 'ผู้จัดกิจกรรม', value: activity.value.creator.username },
        { label: 'เริ่มกิจกรรม', value: formatDateTime(activity.value.startAt) },
        { label: 'เปิดเช็คชื่อ', value: formatDateTime(activity.value.checkinOpenAt) },
        { label: 'เกณฑ์มาสาย', value: formatDateTime(activity.value.lateAt) },
        { label: 'ปิดเช็คชื่อ', value: formatDateTime(activity.value.checkinCloseAt) },
        { label: 'สิ้นสุดกิจกรรม', value: formatDateTime(activity.value.endAt) },
      ]
    : [],
)

// --- publish / cancel (spec §12, §35) --------------------------------------------

const publishing = ref(false)
const cancelling = ref(false)

const onPublish = async (): Promise<void> => {
  if (!activity.value || publishing.value) return
  const confirmed = await confirm({
    title: 'เผยแพร่กิจกรรม',
    description: `${activity.value.name} จะเริ่มรับการเช็คชื่อผ่านบีคอนตามช่วงเวลาที่กำหนด และปรากฏแก่ระบบเช็คชื่อทันที`,
    confirmText: 'เผยแพร่',
  })
  if (!confirmed) return
  publishing.value = true
  try {
    const res = await nuxtApp.$api<ApiEnvelope<ActivityDetail>>(`/activities/${activity.value.id}/publish`, {
      method: 'POST',
    })
    activity.value = res.data
    toast.add({ title: 'เผยแพร่กิจกรรมสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'เผยแพร่ไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
      duration: 8000, // overlap errors name the conflicting activities — keep them readable
    })
  } finally {
    publishing.value = false
  }
}

const onCancelActivity = async (): Promise<void> => {
  if (!activity.value || cancelling.value) return
  const confirmed = await confirm({
    title: 'ยกเลิกกิจกรรม',
    description: `${activity.value.name} จะไม่รับการเช็คชื่ออีกต่อไปและไม่สามารถเผยแพร่ซ้ำได้ (ยกเลิกแล้วจะถาวร)`,
    confirmText: 'ยกเลิกกิจกรรม',
    tone: 'error',
  })
  if (!confirmed) return
  cancelling.value = true
  try {
    const res = await nuxtApp.$api<ApiEnvelope<ActivityDetail>>(`/activities/${activity.value.id}/cancel`, {
      method: 'POST',
    })
    activity.value = res.data
    toast.add({ title: 'ยกเลิกกิจกรรมสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'ยกเลิกไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    cancelling.value = false
  }
}

// --- beacons (spec §14, §38) -------------------------------------------------------

const beaconsLoading = ref(false)
const availableBeacons = ref<Beacon[]>([])
const selectedBeaconId = ref('')
const linking = ref(false)
const removingId = ref<string | null>(null)
const beaconSelectId = useId()

const loadAvailableBeacons = async (): Promise<void> => {
  beaconsLoading.value = true
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<Beacon>>>('/beacons', {
      query: { pageSize: 100, sort: 'name', order: 'asc' },
    })
    const linkedIds = new Set(activity.value?.beacons.map((b) => b.id) ?? [])
    availableBeacons.value = res.data.items.filter((beacon) => !linkedIds.has(beacon.id))
    if (selectedBeaconId.value && linkedIds.has(selectedBeaconId.value)) selectedBeaconId.value = ''
  } finally {
    beaconsLoading.value = false
  }
}

watch(activity, () => void loadAvailableBeacons())

const beaconItems = computed(() =>
  availableBeacons.value.map((beacon) => ({
    label: `${beacon.name} (${beacon.hwid})`,
    value: beacon.id,
  })),
)

const onLinkBeacon = async (): Promise<void> => {
  if (!activity.value || !selectedBeaconId.value || linking.value) return
  linking.value = true
  try {
    await nuxtApp.$api<ApiEnvelope<Beacon>>(`/activities/${activity.value.id}/beacons`, {
      method: 'POST',
      body: { beaconId: selectedBeaconId.value },
    })
    toast.add({ title: 'ลิงก์บีคอนสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    selectedBeaconId.value = ''
    await fetchActivity()
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'ลิงก์บีคอนไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
      duration: 8000,
    })
  } finally {
    linking.value = false
  }
}

const onUnlinkBeacon = async (beacon: Beacon): Promise<void> => {
  if (!activity.value || removingId.value) return
  const confirmed = await confirm({
    title: 'ถอดบีคอนออกจากกิจกรรม',
    description: `${beacon.name} (${beacon.hwid}) จะไม่ถูกใช้เช็คชื่อกิจกรรมนี้อีกต่อไป`,
    confirmText: 'ถอดบีคอน',
    tone: 'error',
  })
  if (!confirmed) return
  removingId.value = beacon.id
  try {
    await nuxtApp.$api<ApiEnvelope<Beacon>>(`/activities/${activity.value.id}/beacons/${beacon.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: 'ถอดบีคอนสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
    await fetchActivity()
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'ถอดบีคอนไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="activity?.name ?? 'รายละเอียดกิจกรรม'">
      <template #actions>
        <template v-if="activity">
          <UButton
            v-if="activity.status === 'DRAFT'"
            icon="lucide:send"
            label="เผยแพร่"
            :loading="publishing"
            :disabled="publishing || cancelling"
            @click="onPublish"
          />
          <UButton
            v-if="activity.status !== 'CANCELLED'"
            icon="lucide:circle-x"
            color="error"
            variant="outline"
            label="ยกเลิกกิจกรรม"
            :disabled="publishing || cancelling"
            @click="onCancelActivity"
          />
          <UButton
            icon="lucide:clipboard-check"
            color="neutral"
            variant="outline"
            label="การเช็คชื่อ"
            :to="`/activities/${activity.id}/attendance`"
          />
          <UButton
            icon="lucide:pencil"
            color="neutral"
            variant="outline"
            label="แก้ไข"
            :to="`/activities/${activity.id}/edit`"
          />
        </template>
        <UButton to="/activities" color="neutral" variant="ghost" icon="lucide:arrow-left" label="กลับไปรายการ" />
      </template>
    </PageHeader>

    <div v-if="loading" class="flex flex-col gap-4" role="status" aria-label="กำลังโหลดข้อมูล">
      <USkeleton class="h-8 w-64" />
      <USkeleton class="h-48 w-full" />
      <USkeleton class="h-48 w-full" />
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

    <template v-else-if="activity">
      <UCard>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold text-highlighted">{{ activity.name }}</h2>
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge :status="activity.status" />
              <StatusBadge :status="activity.timeState" />
            </div>
          </div>
          <p
            v-if="activity.status === 'DRAFT' && activity.beacons.length === 0"
            class="max-w-sm text-sm text-warning"
          >
            <Icon name="lucide:triangle-alert" class="mr-1 size-4 align-[-2px]" aria-hidden="true" />
            ต้องลิงก์บีคอนอย่างน้อย 1 ตัวก่อนจึงจะเผยแพร่ได้
          </p>
        </div>

        <dl class="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="row in infoRows" :key="row.label" class="flex flex-col gap-1">
            <dt class="text-sm text-muted">{{ row.label }}</dt>
            <dd class="text-sm font-medium text-highlighted">{{ row.value }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-highlighted">สรุปการเช็คชื่อ</h2>
          <UButton
            icon="lucide:clipboard-check"
            color="neutral"
            variant="outline"
            label="ดูรายการเช็คชื่อ / เช็คชื่อแทน"
            :to="`/activities/${activity.id}/attendance`"
          />
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <div
            v-for="stat in [
              { label: 'นักศึกษา (ACTIVE)', value: activity.attendanceSummary.totalStudents },
              { label: 'เข้าร่วม', value: activity.attendanceSummary.present },
              { label: 'มาสาย', value: activity.attendanceSummary.late },
              { label: 'ลา', value: activity.attendanceSummary.excused },
              { label: 'ขาด (คำนวณ)', value: activity.attendanceSummary.absent },
            ]"
            :key="stat.label"
            class="flex flex-col gap-1"
          >
            <span class="text-sm text-muted">{{ stat.label }}</span>
            <span class="text-2xl font-semibold text-highlighted">{{ stat.value }}</span>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex flex-col gap-1.5">
          <h2 class="text-base font-semibold text-highlighted">บีคอนที่ลิงก์อยู่</h2>
          <p class="text-sm text-muted">
            บีคอนเดียวกันใช้ซ้อนกันระหว่างกิจกรรมที่เผยแพร่แล้วไม่ได้ถ้าช่วงเช็คชื่อทับกัน
          </p>
        </div>

        <ul v-if="activity.beacons.length > 0" class="mt-4 flex flex-col divide-y divide-default">
          <li v-for="beacon in activity.beacons" :key="beacon.id" class="flex items-center justify-between gap-4 py-3">
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="truncate text-sm font-medium text-highlighted">{{ beacon.name }}</span>
              <span class="font-mono text-xs text-muted">{{ beacon.hwid }}</span>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <StatusBadge :status="beacon.status" />
              <UButton
                icon="lucide:link-2-off"
                color="error"
                variant="ghost"
                size="sm"
                :aria-label="`ถอดบีคอน ${beacon.name} ออกจากกิจกรรม`"
                :disabled="removingId !== null"
                @click="onUnlinkBeacon(beacon)"
              />
            </div>
          </li>
        </ul>
        <p v-else class="mt-4 text-sm text-muted">ยังไม่มีบีคอนที่ลิงก์กับกิจกรรมนี้</p>

        <div class="mt-6 grid gap-2 border-t border-default pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div class="flex flex-col gap-1.5">
            <label :for="beaconSelectId" class="text-sm font-medium text-highlighted">เพิ่มบีคอน</label>
            <USelect
              :id="beaconSelectId"
              v-model="selectedBeaconId"
              :items="beaconItems"
              :loading="beaconsLoading"
              placeholder="เลือกบีคอน"
              :disabled="linking"
            />
          </div>
          <UButton
            icon="lucide:link-2"
            label="ลิงก์บีคอน"
            color="neutral"
            variant="outline"
            :loading="linking"
            :disabled="linking || !selectedBeaconId"
            @click="onLinkBeacon"
          />
        </div>
      </UCard>
    </template>
  </div>
</template>
