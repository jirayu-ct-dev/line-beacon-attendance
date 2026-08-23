<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { TableColumn } from '@nuxt/ui'
import type { ApiEnvelope, Paginated, UserRow } from '~/utils/api'

// Organizer/admin account management (spec §28, §26) — admin-only; the API
// enforces it and this page shows an informative state on 403.
definePageMeta({ middleware: 'auth' })

const toast = useToast()
const { user: currentUser } = useAuth()
const { confirm } = useConfirm()
const nuxtApp = useNuxtApp()
const searchId = useId()

const table = useDataTable({
  filters: { role: '', status: '' },
  defaultSort: 'created_at',
  defaultOrder: 'desc',
})

const items = ref<UserRow[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref<string | null>(null)
const forbidden = ref(false)

const fetchUsers = async (): Promise<void> => {
  loading.value = true
  loadError.value = null
  try {
    const res = await nuxtApp.$api<ApiEnvelope<Paginated<UserRow>>>('/users', {
      query: table.queryParams.value,
    })
    items.value = res.data.items
    total.value = res.data.total
    forbidden.value = false
  } catch (error) {
    const fetchError = error as FetchError
    if (fetchError?.status === 403) {
      forbidden.value = true
      items.value = []
      total.value = 0
    } else {
      loadError.value = getApiErrorMessage(error, 'โหลดรายการผู้ใช้ไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchUsers)
watch(() => table.queryParams.value, () => void fetchUsers())

const columns: TableColumn<UserRow>[] = [
  { accessorKey: 'email', header: 'อีเมล' },
  { accessorKey: 'username', header: 'ชื่อผู้ใช้' },
  { accessorKey: 'role', header: 'บทบาท' },
  { accessorKey: 'status', header: 'สถานะ' },
  { accessorKey: 'createdAt', header: 'สร้างเมื่อ', cell: ({ row }) => formatDate(row.original.createdAt) },
  { id: 'actions', header: 'จัดการ' },
]

const ROLE_LABELS: Record<string, string> = { ADMIN: 'ผู้ดูแลระบบ', ORGANIZER: 'ผู้จัดกิจกรรม' }

const ALL = 'all'
const toFilterValue = (value: string | undefined): string => (value == null || value === ALL ? '' : value)
const fromFilterValue = (value: string | undefined): string => (value == null || value === '' ? ALL : value)

const roleItems = [
  { label: 'ทุกบทบาท', value: ALL },
  { label: 'ผู้ดูแลระบบ', value: 'ADMIN' },
  { label: 'ผู้จัดกิจกรรม', value: 'ORGANIZER' },
]
const statusItems = [
  { label: 'ทุกสถานะ', value: ALL },
  { label: 'ใช้งาน', value: 'ACTIVE' },
  { label: 'ปิดใช้งาน', value: 'INACTIVE' },
]

// --- dialogs + actions ------------------------------------------------------------

const formOpen = ref(false)
const editingUser = ref<UserRow | null>(null)

const resetOpen = ref(false)
const resetTarget = ref<UserRow | null>(null)
const newPassword = ref('')
const resetting = ref(false)

const updatingId = ref<string | null>(null)

const isSelf = (row: UserRow): boolean => row.id === currentUser.value?.id

const openCreate = (): void => {
  editingUser.value = null
  formOpen.value = true
}

const openEdit = (row: UserRow): void => {
  editingUser.value = row
  formOpen.value = true
}

const openReset = (row: UserRow): void => {
  resetTarget.value = row
  newPassword.value = ''
  resetOpen.value = true
}

const doReset = async (): Promise<void> => {
  if (!resetTarget.value || newPassword.value.length < 8 || resetting.value) return
  resetting.value = true
  try {
    await nuxtApp.$api<ApiEnvelope<UserRow>>(`/users/${resetTarget.value.id}/reset-password`, {
      method: 'POST',
      body: { newPassword: newPassword.value },
    })
    toast.add({ title: 'ตั้งรหัสผ่านใหม่สำเร็จ (เซสชันของบัญชีนี้ถูกยกเลิกทั้งหมด)', color: 'success', icon: 'lucide:circle-check' })
    resetOpen.value = false
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    resetting.value = false
  }
}

const setStatus = async (row: UserRow, target: 'ACTIVE' | 'INACTIVE'): Promise<void> => {
  if (updatingId.value) return
  const disabling = target === 'INACTIVE'
  const confirmed = await confirm({
    title: disabling ? 'ปิดใช้งานบัญชี' : 'เปิดใช้งานบัญชี',
    description: disabling
      ? `${row.username} จะไม่สามารถเข้าสู่ระบบได้และเซสชันทั้งหมดจะถูกยกเลิกทันที`
      : `${row.username} จะกลับมาเข้าสู่ระบบได้ตามปกติ`,
    confirmText: disabling ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
    tone: disabling ? 'error' : 'default',
  })
  if (!confirmed) return
  updatingId.value = row.id
  try {
    await nuxtApp.$api<ApiEnvelope<UserRow>>(`/users/${row.id}/${disabling ? 'disable' : 'enable'}`, { method: 'POST' })
    toast.add({
      title: disabling ? 'ปิดใช้งานบัญชีสำเร็จ' : 'เปิดใช้งานบัญชีสำเร็จ',
      color: 'success',
      icon: 'lucide:circle-check',
    })
    await fetchUsers()
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
  } finally {
    updatingId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="ผู้จัดกิจกรรม" subtitle="จัดการบัญชีผู้จัดกิจกรรมและผู้ดูแลระบบของสาขา">
      <template #actions>
        <UButton icon="lucide:plus" label="สร้างบัญชี" @click="openCreate" />
      </template>
    </PageHeader>

    <UCard v-if="forbidden" class="py-16">
      <div class="flex flex-col items-center gap-3 text-center">
        <Icon name="lucide:shield-x" class="size-10 text-error" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-highlighted">ไม่มีสิทธิ์เข้าถึง</h2>
        <p class="max-w-md text-sm text-muted">การจัดการบัญชีผู้ใช้เปิดให้ผู้ดูแลระบบ (Admin) เท่านั้น</p>
        <UButton to="/dashboard" color="neutral" variant="outline" icon="lucide:layout-dashboard" label="กลับไปหน้าภาพรวม" />
      </div>
    </UCard>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="flex flex-col gap-1.5">
          <label :for="searchId" class="text-sm font-medium text-highlighted">ค้นหา</label>
          <UInput
            :id="searchId"
            v-model="table.searchInput.value"
            icon="lucide:search"
            placeholder="อีเมล หรือชื่อผู้ใช้"
            :disabled="loading"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-highlighted">บทบาท</span>
          <USelect
            :model-value="fromFilterValue(table.filters.role)"
            :items="roleItems"
            aria-label="กรองตามบทบาท"
            :disabled="loading"
            @update:model-value="(value: string | undefined) => table.setFilter('role', toFilterValue(value))"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-highlighted">สถานะ</span>
          <USelect
            :model-value="fromFilterValue(table.filters.status)"
            :items="statusItems"
            aria-label="กรองตามสถานะ"
            :disabled="loading"
            @update:model-value="(value: string | undefined) => table.setFilter('status', toFilterValue(value))"
          />
        </div>
      </div>

      <DataTable
        :data="items"
        :columns="columns"
        :loading="loading"
        :error="loadError"
        :has-active-filters="table.hasActiveFilters.value"
        :total="total"
        :page="table.page.value"
        :page-size="table.pageSize.value"
        caption="รายการบัญชีผู้ใช้"
        @update:page="table.setPage"
        @update:page-size="table.setPageSize"
        @retry="fetchUsers"
        @clear="table.resetFilters"
      >
        <template #role-cell="{ row }">
          {{ ROLE_LABELS[row.original.role] ?? row.original.role }}
          <UBadge v-if="isSelf(row.original)" color="primary" variant="subtle" class="ml-1.5">คุณ</UBadge>
        </template>

        <template #status-cell="{ row }">
          <StatusBadge :status="row.original.status" />
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              icon="lucide:key-round"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`ตั้งรหัสผ่านใหม่ของ ${row.original.username}`"
              :disabled="updatingId !== null"
              @click="openReset(row.original)"
            />
            <UButton
              icon="lucide:pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`แก้ไขบัญชี ${row.original.username}`"
              :disabled="updatingId !== null"
              @click="openEdit(row.original)"
            />
            <UButton
              v-if="row.original.status === 'ACTIVE'"
              icon="lucide:circle-off"
              color="error"
              variant="ghost"
              size="sm"
              :aria-label="`ปิดใช้งานบัญชี ${row.original.username}`"
              :disabled="updatingId !== null || isSelf(row.original)"
              @click="setStatus(row.original, 'INACTIVE')"
            />
            <UButton
              v-else
              icon="lucide:circle-check"
              color="success"
              variant="ghost"
              size="sm"
              :aria-label="`เปิดใช้งานบัญชี ${row.original.username}`"
              :disabled="updatingId !== null"
              @click="setStatus(row.original, 'ACTIVE')"
            />
          </div>
        </template>
      </DataTable>
    </template>

    <UserFormDialog v-model:open="formOpen" :user="editingUser" @saved="fetchUsers" />

    <UModal v-model:open="resetOpen" title="ตั้งรหัสผ่านใหม่">
      <template #body>
        <div v-if="resetTarget" class="flex flex-col gap-4">
          <p class="text-sm text-muted">
            ตั้งรหัสผ่านใหม่ให้ <span class="font-medium text-highlighted">{{ resetTarget.username }}</span> —
            เซสชันทั้งหมดของบัญชีนี้จะถูกยกเลิกทันที
          </p>

          <UFormField label="รหัสผ่านใหม่" required help="อย่างน้อย 8 ตัวอักษร">
            <UInput v-model="newPassword" type="password" class="w-full" :disabled="resetting" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="outline" label="ยกเลิก" :disabled="resetting" @click="resetOpen = false" />
            <UButton
              icon="lucide:key-round"
              label="ตั้งรหัสผ่านใหม่"
              :loading="resetting"
              :disabled="resetting || newPassword.length < 8"
              @click="doReset"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
