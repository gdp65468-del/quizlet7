'use client'

import { LogOut } from 'lucide-react'
import { useCloudSync } from '@/lib/cloud-sync'
import { useI18n } from '@/lib/i18n'

export default function SignOutButton({ mode = 'admin' }: { mode?: 'admin' | 'creator' }) {
  const { t } = useI18n()
  const { signOutCloud } = useCloudSync()

  const signOut = async () => {
    if (mode === 'creator') {
      await signOutCloud()
      window.location.replace('/login')
      return
    }
    const response = await fetch('/api/admin/session', { method: 'DELETE', credentials: 'include' })
    if (response.ok) window.location.replace('/admin/login')
  }

  return (
    <button className="btn-sign-out whitespace-nowrap px-4 py-2.5 text-sm" type="button" onClick={signOut}>
      <LogOut aria-hidden="true" className="h-4 w-4" />
      {t.signOut}
    </button>
  )
}
