import type { Metadata } from 'next'
import Providers from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Arena Bíblica',
  description: 'Quizzes interativos ao vivo e enquetes em tempo real',
  openGraph: {
    title: 'Arena Bíblica',
    description: 'Quizzes interativos ao vivo e enquetes em tempo real',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arena Bíblica',
    description: 'Quizzes interativos ao vivo e enquetes em tempo real',
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
