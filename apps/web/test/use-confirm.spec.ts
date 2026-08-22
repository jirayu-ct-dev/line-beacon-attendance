import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConfirmDialog from '~/components/ConfirmDialog.vue'
import { useConfirm } from '~/composables/useConfirm'

// The UModal portals its content to document.body, so assertions target the
// document rather than the mounted wrapper.
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const bodyText = (): string => document.body.textContent ?? ''

const findBodyButton = (label: string): HTMLButtonElement | undefined =>
  Array.from(document.body.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === label,
  )

const waitForButton = async (label: string): Promise<HTMLButtonElement> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const button = findBodyButton(label)
    if (button) return button
    await sleep(20)
  }
  throw new Error(`button "${label}" never appeared in document.body`)
}

const click = async (label: string): Promise<void> => {
  ;(await waitForButton(label)).click()
  await flushPromises()
}

describe('useConfirm + ConfirmDialog', () => {
  it('resolves true when the confirm button is clicked', async () => {
    await mountSuspended(ConfirmDialog)
    const { confirm, request } = useConfirm()

    const pending = confirm({
      title: 'ปิดใช้งานนักศึกษา',
      description: 'นักศึกษาจะไม่สามารถเช็คชื่อได้',
      confirmText: 'ปิดใช้งาน',
      cancelText: 'ยกเลิก',
      tone: 'error',
    })
    await flushPromises()

    expect(request.value?.title).toBe('ปิดใช้งานนักศึกษา')
    expect(bodyText()).toContain('ปิดใช้งานนักศึกษา')
    expect(bodyText()).toContain('นักศึกษาจะไม่สามารถเช็คชื่อได้')

    await click('ปิดใช้งาน')
    await expect(pending).resolves.toBe(true)
    expect(request.value).toBeNull()
  })

  it('resolves false when the cancel button is clicked', async () => {
    await mountSuspended(ConfirmDialog)
    const { confirm } = useConfirm()

    const pending = confirm({ title: 'ยืนยันการนำเข้า', confirmText: 'นำเข้าข้อมูล' })
    await flushPromises()

    await click('ยกเลิก')
    await expect(pending).resolves.toBe(false)
  })

  it('uses the default Thai button labels', async () => {
    await mountSuspended(ConfirmDialog)
    const { confirm } = useConfirm()

    void confirm({ title: 'ทดสอบ' })
    await flushPromises()

    expect(findBodyButton('ยืนยัน')).toBeDefined()
    expect(findBodyButton('ยกเลิก')).toBeDefined()
  })
})
