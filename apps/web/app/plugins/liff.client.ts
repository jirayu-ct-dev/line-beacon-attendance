/**
 * LIFF initializer (design doc §6.5): loads + inits the LIFF SDK only on
 * /liff/* routes so the dashboard never pulls it. Fire-and-forget — pages
 * render their own states off useLiff() while initialization is in flight.
 */
export default defineNuxtPlugin(() => {
  if (!useRoute().path.startsWith('/liff/')) return
  void useLiff().start()
})
