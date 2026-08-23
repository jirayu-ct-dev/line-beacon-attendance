<script setup lang="ts">
// `/liff` has no content of its own — the activities list is the student home
// (same pattern as `/` redirecting to /dashboard). Unlinked users are then
// bounced to /liff/register by the page's session gate.
definePageMeta({ layout: 'liff', redirect: '/liff/activities' })
</script>

<template>
  <div />
</template>
