import type { Metadata } from 'next'
import Providers from '@/components/providers'
import './globals.css'

const LOGO_PATH = '/assets/aistudio/logo_b185e3dd.png'

function resolveSiteUrl(): URL {
  const candidate =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    'http://localhost:3000'

  try {
    return new URL(candidate)
  } catch {
    return new URL('http://localhost:3000')
  }
}

const siteUrl = resolveSiteUrl()

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: 'Arena Bíblica',
  description: 'Quizzes interativos ao vivo e enquetes em tempo real',
  icons: {
    icon: [{ url: LOGO_PATH, type: 'image/png', sizes: '512x512' }],
    shortcut: [LOGO_PATH],
    apple: [{ url: LOGO_PATH, type: 'image/png', sizes: '512x512' }],
  },
  openGraph: {
    title: 'Arena Bíblica',
    description: 'Quizzes interativos ao vivo e enquetes em tempo real',
    url: '/',
    siteName: 'Arena Bíblica',
    locale: 'pt_BR',
    type: 'website',
    images: [
      {
        url: LOGO_PATH,
        width: 732,
        height: 741,
        alt: 'Arena Bíblica — Quizzes interativos ao vivo e enquetes em tempo real',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arena Bíblica',
    description: 'Quizzes interativos ao vivo e enquetes em tempo real',
    images: [LOGO_PATH],
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Arena Bíblica',
  description: 'Quizzes interativos ao vivo e enquetes em tempo real',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'All',
  inLanguage: 'pt-BR',
  url: siteUrl.toString(),
  image: new URL(LOGO_PATH, siteUrl).toString(),
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'BRL',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
