import { InfoCard } from './info-card'

export function FeaturesSection() {
  const features = [
    {
      title: 'Premium Hardware',
      description: 'Latest gaming consoles and high-end PCs with cutting-edge graphics cards and processors.',
      image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=300&fit=crop&auto=format'
    },
    {
      title: 'Comfortable Setup',
      description: 'Ergonomic gaming chairs, professional headsets, and optimized lighting for long gaming sessions.',
      image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=300&fit=crop&auto=format'
    },
    {
      title: 'High-Speed Internet',
      description: 'Dedicated fiber connection with ultra-low latency for competitive online gaming.',
      image: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=400&h=300&fit=crop&auto=format'
    },
    {
      title: 'Game Library',
      description: 'Access to hundreds of games including latest releases and classic favorites.',
      image: 'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=400&h=300&fit=crop&auto=format'
    },
    {
      title: 'Food & Drinks',
      description: 'Gaming fuel available - energy drinks, snacks, and quick meals to keep you going.',
      image: 'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=400&h=300&fit=crop&auto=format'
    },
    {
      title: '24/7 Support',
      description: 'Technical support and assistance available round the clock for uninterrupted gaming.',
      image: 'https://images.unsplash.com/photo-1553484771-cc0d9b8c2b33?w=400&h=300&fit=crop&auto=format'
    }
  ]

  return (
    <section className="py-20 px-6 bg-cp-gray/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold mb-4">
            WHY CHOOSE <span className="text-cp-yellow">US</span>
          </h2>
          <p className="text-xl text-gray-300">
            Everything you need for the ultimate gaming experience
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <InfoCard
              key={index}
              title={feature.title}
              description={feature.description}
              image={feature.image}
            />
          ))}
        </div>
      </div>
    </section>
  )
} 