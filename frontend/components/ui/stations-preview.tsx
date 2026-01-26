import { InfoCard } from './info-card'
import { NeonButton } from './neon-button'
import Link from 'next/link'

export function StationsPreview() {
  const stations = [
    {
      title: 'PS5 Station Alpha',
      description: 'Latest PlayStation 5 with 4K gaming, haptic feedback controllers, and premium gaming headset.',
      image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop&auto=format',
      price: '150'
    },
    {
      title: 'PC Gaming Rig Neo',
      description: 'High-end gaming PC with RTX 4080, 32GB RAM, and mechanical keyboard for competitive gaming.',
      image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400&h=300&fit=crop&auto=format',
      price: '120'
    },
    {
      title: 'PC Gaming Rig Matrix',
      description: 'Ultra-performance setup with RTX 4090, curved monitor, and RGB lighting for immersive experience.',
      image: 'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=400&h=300&fit=crop&auto=format',
      price: '130'
    }
  ]

  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold mb-4">
            CHOOSE YOUR <span className="text-cp-cyan">STATION</span>
          </h2>
          <p className="text-xl text-gray-300">
            Premium gaming setups ready for your next adventure
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {stations.map((station, index) => (
            <InfoCard
              key={index}
              title={station.title}
              description={station.description}
              image={station.image}
              price={station.price}
            />
          ))}
        </div>

        <div className="text-center">
          <Link href="/stations">
            <NeonButton variant="primary">
              View All Stations
            </NeonButton>
          </Link>
        </div>
      </div>
    </section>
  )
} 