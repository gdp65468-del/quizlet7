'use client'

import { CloudSyncProvider } from '@/lib/cloud-sync'
import { LanguageProvider } from '@/lib/i18n'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <CloudSyncProvider>{children}</CloudSyncProvider>
    </LanguageProvider>
  )
}
