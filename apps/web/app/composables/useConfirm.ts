/**
 * The project's single confirm system (design doc §6.4).
 *
 * `confirm()` returns a promise that resolves true when the user confirms and
 * false when they cancel (cancel button, Escape or clicking outside — handled
 * by the UModal in ConfirmDialog.vue, which must be mounted once in app.vue).
 */
export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** 'error' styles the confirm button as destructive. */
  tone?: 'default' | 'error'
}

interface ConfirmRequest {
  title: string
  description?: string
  confirmText: string
  cancelText: string
  tone: 'default' | 'error'
  resolve: (value: boolean) => void
}

export const useConfirm = () => {
  const request = useState<ConfirmRequest | null>('confirm:request', () => null)

  const confirm = (options: ConfirmOptions): Promise<boolean> =>
    new Promise((resolve) => {
      request.value = {
        title: options.title,
        description: options.description,
        confirmText: options.confirmText ?? 'ยืนยัน',
        cancelText: options.cancelText ?? 'ยกเลิก',
        tone: options.tone ?? 'default',
        resolve,
      }
    })

  /** Resolve the pending request (if any) and close the dialog. */
  const settle = (value: boolean): void => {
    const current = request.value
    request.value = null
    current?.resolve(value)
  }

  return { confirm, settle, request }
}
