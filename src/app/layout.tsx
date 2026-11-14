import type { Metadata } from 'next'
import Providers from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Quizlet',
  description: 'Host multiplayer quizzes from JSON files and create quick live polls for participants.',
  openGraph: {
    title: 'Quizlet',
    description: 'Host multiplayer quizzes from JSON files and create quick live polls for participants.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quizlet',
    description: 'Host multiplayer quizzes from JSON files and create quick live polls for participants.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
