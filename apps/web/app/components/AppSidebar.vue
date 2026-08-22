<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

// Sidebar navigation per design doc §6.1. Links to not-yet-built pages are
// intentional (later phases); real permissions are always enforced by the API.
const { user, logout } = useAuth()
const toast = useToast()

const mainItems: NavigationMenuItem[] = [
  { label: 'ภาพรวม', icon: 'lucide:layout-dashboard', to: '/dashboard' },
  { label: 'กิจกรรม', icon: 'lucide:calendar-days', to: '/activities' },
  { label: 'นักศึกษา', icon: 'lucide:users', to: '/students' },
  { label: 'Beacons', icon: 'lucide:radio', to: '/beacons' },
  { label: 'รายงาน', icon: 'lucide:file-spreadsheet', to: '/reports' },
]

const adminItems: NavigationMenuItem[] = [
  { label: 'เฉพาะผู้ดูแลระบบ', type: 'label' },
  { label: 'ผู้จัดกิจกรรม', icon: 'lucide:user-cog', to: '/admin/organizers' },
  { label: 'Beacon Logs', icon: 'lucide:scroll-text', to: '/admin/beacon-logs' },
  { label: 'Audit Logs', icon: 'lucide:shield-check', to: '/admin/audit-logs' },
]

const items = computed<NavigationMenuItem[][]>(() =>
  user.value?.role === 'ADMIN' ? [mainItems, adminItems] : [mainItems],
)

const userMenuItems = computed<DropdownMenuItem[]>(() => [
  { type: 'label', label: user.value?.username ?? '' },
  { label: 'ออกจากระบบ', icon: 'lucide:log-out', color: 'error', onSelect: () => void handleLogout() },
])

const handleLogout = async (): Promise<void> => {
  try {
    await logout()
    toast.add({ title: 'ออกจากระบบสำเร็จ', color: 'success', icon: 'lucide:circle-check' })
  } catch (error) {
    toast.add({
      title: getApiErrorMessage(error, 'ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง'),
      color: 'error',
      icon: 'lucide:circle-alert',
    })
    return
  }
  await navigateTo('/login', { replace: true })
}
</script>

<template>
  <UDashboardSidebar collapsible>
    <template #header="{ collapsed }">
      <NuxtLink
        to="/dashboard"
        class="flex min-w-0 items-center gap-2 text-sm font-semibold text-highlighted"
      >
        <Icon name="lucide:radio" class="size-6 shrink-0 text-primary" aria-hidden="true" />
        <span :class="collapsed ? 'sr-only' : 'truncate'">LINE Beacon Attendance</span>
      </NuxtLink>
    </template>

    <template #default="{ collapsed }">
      <UNavigationMenu :collapsed="collapsed" :items="items" orientation="vertical" tooltip />
    </template>

    <template #footer="{ collapsed }">
      <UDropdownMenu
        :items="userMenuItems"
        :content="{ side: 'top', align: 'center' }"
        :ui="{ content: 'min-w-48' }"
      >
        <UButton
          color="neutral"
          variant="ghost"
          class="w-full"
          :class="collapsed ? 'justify-center' : 'justify-start'"
          :aria-label="collapsed ? `เมนูผู้ใช้ (${user?.username ?? ''})` : undefined"
        >
          <UAvatar icon="lucide:circle-user" size="xs" alt="รูปผู้ใช้" />
          <span v-if="!collapsed" class="min-w-0 flex-1 truncate text-left">
            {{ user?.username }}
          </span>
          <Icon
            v-if="!collapsed"
            name="lucide:chevron-up"
            class="size-4 shrink-0 text-muted"
            aria-hidden="true"
          />
        </UButton>
      </UDropdownMenu>
    </template>
  </UDashboardSidebar>
</template>
