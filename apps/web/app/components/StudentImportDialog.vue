<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ApiEnvelope, ImportApplyResult, ImportPreviewResult, ImportRowResult } from '~/utils/api'

/**
 * Student CSV/XLSX import (design doc §6.3): pick a file → server-side preview
 * with per-row validation → confirm → apply. Only the valid rows are applied;
 * error rows are skipped and reported.
 */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [result: ImportApplyResult] }>()

const toast = useToast()
const { confirm } = useConfirm()
const nuxtApp = useNuxtApp()

const file = ref<File | null>(null)
const preview = ref<ImportPreviewResult | null>(null)
const previewing = ref(false)
const previewError = ref<string | null>(null)
const applying = ref(false)

watch(open, (value) => {
  if (value) {
    file.value = null
    preview.value = null
    previewError.value = null
  }
})

watch(file, (value) => {
  preview.value = null
  previewError.value = null
  if (value) void runPreview()
})

const runPreview = async (): Promise<void> => {
  if (!file.value) return
  previewing.value = true
  try {
    const body = new FormData()
    body.append('file', file.value)
    const res = await nuxtApp.$api<ApiEnvelope<ImportPreviewResult>>('/students/import/preview', {
      method: 'POST',
      body,
    })
    preview.value = res.data
  } catch (error) {
    previewError.value = getApiErrorMessage(error, 'อ่านไฟล์ไม่สำเร็จ กรุณาตรวจสอบรูปแบบไฟล์และลองอีกครั้ง')
  } finally {
    previewing.value = false
  }
}

const rowColumns: TableColumn<ImportRowResult>[] = [
  { accessorKey: 'row', header: 'แถวที่' },
  { accessorKey: 'studentCode', header: 'รหัสนักศึกษา' },
  { accessorKey: 'status', header: 'ผลตรวจสอบ' },
  {
    id: 'errors',
    accessorFn: (row) => row.errors.join(' · '),
    header: 'ข้อผิดพลาด',
    cell: ({ getValue }) => (getValue() === '' ? '—' : String(getValue())),
  },
]

const canApply = computed(() => !!preview.value && preview.value.validRows > 0 && !applying && !previewing)

const onApply = async (): Promise<void> => {
  if (!canApply.value || !file.value) return
  const current = preview.value!
  const confirmed = await confirm({
    title: 'ยืนยันการนำเข้านักศึกษา',
    description: `ระบบจะนำเข้า ${current.validRows} รายการที่ถูกต้อง (รหัสที่มีอยู่แล้วจะถูกอัปเดต)${
      current.errorRows > 0 ? ` และข้าม ${current.errorRows} แถวที่ไม่ถูกต้อง` : ''
    }`,
    confirmText: 'นำเข้าข้อมูล',
  })
  if (!confirmed) return
  applying.value = true
  try {
    const body = new FormData()
    body.append('file', file.value)
    const res = await nuxtApp.$api<ApiEnvelope<ImportApplyResult>>('/students/import', {
      method: 'POST',
      body,
    })
    const { created, updated, errorRows } = res.data
    toast.add({
      title: 'นำเข้าข้อมูลสำเร็จ',
      description: `สร้างใหม่ ${created} รายการ อัปเดต ${updated} รายการ${
        errorRows > 0 ? ` ข้าม ${errorRows} แถวที่ไม่ถูกต้อง` : ''
      }`,
      color: 'success',
      icon: 'lucide:circle-check',
    })
    open.value = false
    emit('imported', res.data)
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'นำเข้าข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="นำเข้านักศึกษา"
    description="อัปโหลดไฟล์ CSV หรือ Excel แล้วตรวจสอบผลก่อนยืนยัน"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFileUpload
          v-model="file"
          label="ไฟล์นักศึกษา (.csv / .xlsx)"
          description="ส่วนหัวไฟล์: student_code, first_name, last_name, birth_date, year และ email (ไม่จำเป็น) — birth_date รูปแบบ YYYY-MM-DD (ปี ค.ศ.) สูงสุด 1,000 แถว"
          accept=".csv,.xlsx"
          :disabled="previewing || applying"
        />

        <p
          v-if="previewing"
          class="flex items-center gap-2 text-sm text-muted"
          role="status"
        >
          <Icon name="lucide:loader-circle" class="size-4 animate-spin" aria-hidden="true" />
          กำลังตรวจสอบไฟล์...
        </p>

        <UAlert
          v-else-if="previewError"
          icon="lucide:circle-alert"
          color="error"
          variant="subtle"
          :title="previewError"
        />

        <template v-else-if="preview">
          <p class="text-sm text-muted" aria-live="polite">
            ทั้งหมด {{ preview.totalRows }} แถว ·
            <span class="font-medium text-success">ถูกต้อง {{ preview.validRows }} แถว</span> ·
            <span class="font-medium text-error">ไม่ถูกต้อง {{ preview.errorRows }} แถว</span>
            <span v-if="preview.errorRows > 0"> (แถวที่ไม่ถูกต้องจะถูกข้าม)</span>
          </p>

          <div class="max-h-72 overflow-y-auto rounded-md border border-default">
            <UTable :data="preview.rows" :columns="rowColumns" caption="ผลตรวจสอบการนำเข้าไฟล์">
              <template #status-cell="{ row }">
                <UBadge
                  :color="row.original.status === 'valid' ? 'success' : 'error'"
                  variant="subtle"
                  :label="row.original.status === 'valid' ? 'ถูกต้อง' : 'ไม่ถูกต้อง'"
                />
              </template>
            </UTable>
          </div>
        </template>

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" label="ปิด" :disabled="applying" @click="open = false" />
          <UButton
            icon="lucide:upload"
            :loading="applying"
            :disabled="!canApply"
            @click="onApply"
          >
            ยืนยันนำเข้า{{ preview ? ` (${preview.validRows} รายการ)` : '' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
