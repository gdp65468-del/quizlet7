'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'

export default function CloseParticipantWindow() {
  const { locale } = useI18n()
  const isPt = locale === 'pt'
  const [needsManualClose, setNeedsManualClose] = useState(false)

  const close = () => {
    setNeedsManualClose(false)
    try { window.close() } catch { /* Browsers may block closing a tab opened by the user. */ }
    window.setTimeout(() => {
      if (!window.closed) setNeedsManualClose(true)
    }, 150)
  }

  return <div className="mt-8 flex flex-col items-center gap-3">
    <button className="btn-secondary min-w-36" type="button" onClick={close}>{isPt ? 'Fechar' : 'Close'}</button>
    {needsManualClose && <p className="text-muted text-center text-sm" role="status">
      {isPt
        ? 'Seu navegador manteve esta aba aberta. Você pode fechá-la manualmente.'
        : 'Your browser kept this tab open. You can close it manually.'}
    </p>}
  </div>
}
