<script setup lang="ts">
// LIFF shell (design doc §6.1, revised 2026-08-23 by the project owner's
// decision): mobile-first max-w-md with a sticky header bar and a fixed
// bottom navigation — three destinations mirroring the §22 Rich Menu sketch
// (กิจกรรม / ประวัติของฉัน / โปรไฟล์). The session bootstrap lives here so the
// header avatar and every page share one /me resolution (useLiffSession).
const route = useRoute()
const { status } = useLiff()
const { ensure, me } = useLiffSession()

watch(status, () => void ensure(), { immediate: true })

const navItems = [
  { label: 'กิจกรรม', icon: 'lucide:calendar-days', to: '/liff/activities' },
  { label: 'ประวัติของฉัน', icon: 'lucide:clipboard-check', to: '/liff/history' },
  { label: 'โปรไฟล์', icon: 'lucide:circle-user', to: '/liff/profile' },
]

const isActive = (to: string): boolean => route.path === to || route.path.startsWith(`${to}/`)
</script>

<template>
  <div class="min-h-svh bg-muted">
    <header class="sticky top-0 z-10 border-b border-default bg-default">
      <div class="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-3 px-4">
        <NuxtLink to="/liff/activities" class="flex min-w-0 items-center gap-2">
          <Icon name="lucide:radio" class="size-6 shrink-0 text-primary" aria-hidden="true" />
          <span class="truncate text-sm font-bold text-highlighted">เช็คชื่อด้วย LINE Beacon</span>
        </NuxtLink>
        <NuxtLink
          to="/liff/profile"
          class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10"
          aria-label="โปรไฟล์ของฉัน"
        >
          <img
            v-if="me?.line?.pictureUrl"
            :src="me.line.pictureUrl"
            alt=""
            class="size-9 rounded-full object-cover"
          />
          <Icon v-else name="lucide:circle-user" class="size-5 text-primary" aria-hidden="true" />
        </NuxtLink>
      </div>
    </header>

    <main class="mx-auto w-full max-w-md px-4 pb-24 pt-6">
      <slot />
    </main>

    <nav
      aria-label="เมนูหลัก"
      class="fixed inset-x-0 bottom-0 z-10 border-t border-default bg-default pb-[env(safe-area-inset-bottom)]"
    >
      <ul class="mx-auto flex w-full max-w-md">
        <li v-for="item in navItems" :key="item.to" class="flex-1">
          <NuxtLink
            :to="item.to"
            class="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
            :class="isActive(item.to) ? 'text-primary' : 'text-muted'"
            :aria-current="isActive(item.to) ? 'page' : undefined"
          >
            <Icon :name="item.icon" class="size-5" aria-hidden="true" />
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
