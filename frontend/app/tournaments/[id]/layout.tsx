import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getSupabase } from '@/server/supabase'

// Link previews (WhatsApp, Instagram, Discord...) read these tags, so a shared link shows the poster/banner and a summary.
const site = () =>
  process.env.NEXT_PUBLIC_SITE_URL ??
  `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? 'localhost:3000'}`

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const fallback: Metadata = { title: 'Tournament | Neo Gaming Cafe' }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return fallback
  try {
    const { data } = await getSupabase()
      .from('tournaments')
      .select('name, game, platform, description, prize_pool, banner_image, poster_image, status')
      .eq('id', params.id)
      .neq('status', 'draft')
      .maybeSingle()
    if (!data) return fallback
    const parts = [`${data.game} on ${data.platform}`, data.prize_pool > 0 ? `Prize pool ₹${data.prize_pool}` : null, data.description].filter(Boolean)
    const description = parts.join(' · ').slice(0, 200)
    const image = data.banner_image || data.poster_image
    return {
      metadataBase: new URL(site()),
      title: `${data.name} | Neo Gaming Cafe`,
      description,
      openGraph: { title: data.name, description, type: 'website', siteName: 'Neo Gaming Cafe', ...(image ? { images: [{ url: image }] } : {}) },
      twitter: { card: image ? 'summary_large_image' : 'summary', title: data.name, description, ...(image ? { images: [image] } : {}) },
    }
  } catch {
    return fallback
  }
}

export default function TournamentLayout({ children }: { children: ReactNode }) {
  return children
}
