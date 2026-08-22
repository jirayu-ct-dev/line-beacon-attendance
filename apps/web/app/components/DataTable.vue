<script setup lang="ts" generic="T extends Record<string, any>">
import type { TableColumn } from '@nuxt/ui'

/**
 * Thin server-data wrapper around UTable (design doc §6.3): loading skeleton,
 * error state with retry, "ยังไม่มีข้อมูล" vs "ไม่พบผลลัพธ์" empty states and a
 * pagination footer. Sorting/filtering/fetching live in the page (via
 * useDataTable); this component only renders what it is given and emits
 * pagination events. Column cell/header slots are forwarded to UTable.
 */
const props = withDefaults(
  defineProps<{
    data: T[]
    columns: TableColumn<T>[]
    loading?: boolean
    /** Error message; when set, the error state replaces the empty state. */
    error?: string | null
    /** From useDataTable().hasActiveFilters — distinguishes "no data" from "no result". */
    hasActiveFilters?: boolean
    total: number
    page: number
    pageSize: number
    pageSizeOptions?: number[]
    caption?: string
  }>(),
  {
    loading: false,
    error: null,
    hasActiveFilters: false,
    pageSizeOptions: () => [10, 20, 50],
    caption: '',
  },
)

const emit = defineEmits<{
  'update:page': [value: number]
  'update:pageSize': [value: number]
  retry: []
  clear: []
}>()

// Forward every slot except the ones this wrapper owns, so pages can use
// UTable's dynamic cell/header slots through it.
const RESERVED_SLOTS = new Set(['empty', 'loading'])
const slots = useSlots()
const forwardedSlots = computed(() => Object.keys(slots).filter((name) => !RESERVED_SLOTS.has(name)))

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const rangeStart = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const rangeEnd = computed(() => Math.min(props.page * props.pageSize, props.total))

const pageSizeItems = computed(() =>
  props.pageSizeOptions.map((size) => ({ label: String(size), value: size })),
)

const showFooter = computed(() => !props.loading && !props.error && (props.total > 0 || props.data.length > 0))
</script>

<template>
  <div class="flex flex-col gap-4">
    <UTable
      :data="data"
      :columns="columns"
      :loading="loading"
      :caption="caption"
    >
      <template v-for="name in forwardedSlots" :key="name" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>

      <template #loading>
        <div class="flex flex-col gap-3 py-2" role="status" aria-label="กำลังโหลดข้อมูล">
          <USkeleton v-for="row in 5" :key="row" class="h-5 w-full" />
        </div>
      </template>

      <template #empty>
        <div v-if="error" class="flex flex-col items-center gap-2 py-4 text-center">
          <Icon name="lucide:circle-alert" class="size-8 text-error" aria-hidden="true" />
          <p class="text-sm text-muted">{{ error }}</p>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="lucide:rotate-ccw"
            label="ลองใหม่"
            @click="emit('retry')"
          />
        </div>
        <div v-else-if="hasActiveFilters" class="flex flex-col items-center gap-2 py-4 text-center">
          <Icon name="lucide:search-x" class="size-8 text-muted" aria-hidden="true" />
          <p class="text-sm font-medium text-highlighted">ไม่พบผลลัพธ์จากการค้นหาหรือตัวกรอง</p>
          <p class="text-sm text-muted">ลองปรับคำค้นหาหรือล้างตัวกรองแล้วค้นหาใหม่</p>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="lucide:filter-x"
            label="ล้างตัวกรอง"
            @click="emit('clear')"
          />
        </div>
        <div v-else class="flex flex-col items-center gap-2 py-4 text-center">
          <Icon name="lucide:inbox" class="size-8 text-muted" aria-hidden="true" />
          <p class="text-sm text-muted">ยังไม่มีข้อมูล</p>
        </div>
      </template>
    </UTable>

    <div
      v-if="showFooter"
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-default pt-4"
    >
      <p class="text-sm text-muted" aria-live="polite">
        แสดง {{ rangeStart }}–{{ rangeEnd }} จาก {{ total }} รายการ
      </p>
      <div class="flex items-center gap-2">
        <USelect
          :model-value="pageSize"
          :items="pageSizeItems"
          class="w-20"
          aria-label="จำนวนรายการต่อหน้า"
          @update:model-value="(value: number) => emit('update:pageSize', value)"
        />
        <UButton
          icon="lucide:chevron-left"
          color="neutral"
          variant="outline"
          :disabled="page <= 1"
          aria-label="หน้าก่อนหน้า"
          @click="emit('update:page', page - 1)"
        />
        <span class="min-w-16 text-center text-sm text-muted">{{ page }} / {{ totalPages }}</span>
        <UButton
          icon="lucide:chevron-right"
          color="neutral"
          variant="outline"
          :disabled="page >= totalPages"
          aria-label="หน้าถัดไป"
          @click="emit('update:page', page + 1)"
        />
      </div>
    </div>
  </div>
</template>
