import type { Metadata } from 'next'
import { Noto_Sans_JP } from 'next/font/google'

const noto = Noto_Sans_JP({ subsets: ['latin'], weight: ['400', '700'] })

export const metadata: Metadata = {
  title: '将棋コーチ',
  description: '将棋ウォーズ棋譜分析ダッシュボード',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={noto.className} style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}
