<script setup lang="ts">
// Back-office shell (design doc §6.1): collapsible sidebar on desktop
// (collapse button in the navbar), drawer on mobile, user menu at the
// sidebar footer. Sidebar content lives in AppSidebar.
</script>

<template>
  <UDashboardGroup>
    <AppSidebar />

    <UDashboardPanel id="main">
      <template #header>
        <UDashboardNavbar :toggle="false">
          <template #leading>
            <UDashboardSidebarToggle aria-label="เปิดหรือปิดเมนูด้านข้าง" />
            <UDashboardSidebarCollapse aria-label="ย่อหรือขยายแถบเมนูด้านข้าง" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
