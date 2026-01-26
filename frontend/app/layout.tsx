import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Neo Gaming Cafe - Night City',
  description: 'Book PS5 and PC gaming sessions',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-cp-black text-white font-rajdhani">
        {children}
      </body>
    </html>
  )
} 