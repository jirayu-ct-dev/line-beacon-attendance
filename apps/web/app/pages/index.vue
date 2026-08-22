<script setup lang="ts">
// `/` always lands on the dashboard; unauthenticated visitors are then sent
// to /login by the auth middleware on the dashboard page.
definePageMeta({ redirect: '/dashboard' })
</script>

<template>
  <div />
</template>
