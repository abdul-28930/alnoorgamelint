'use client'

import { useState, useEffect } from 'react'
import { NavBar } from '@/components/ui/navbar'
import { StationCard } from '@/components/ui/station-card'
import { Footer } from '@/components/ui/footer'
import { stations } from '@/lib/supabase'

export default function StationsPage() {
  const [selectedTypes, setSelectedTypes] = useState<('PC' | 'PS5')[]>(['PC', 'PS5'])
  const [stationsList, setStationsList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStations = async () => {
      const { data } = await stations.getAll()
      if (data) {
        setStationsList(data)
      }
      setLoading(false)
    }
    fetchStations()
  }, [])

  // Fallback data if database is not connected
  const fallbackStations = [
    {
      id: '1',
      name: 'PS5 Station Alpha',
      type: 'PS5' as const,
      hourlyRate: 150,
      description: 'Premium PlayStation 5 setup with 4K gaming and haptic feedback controllers.',
      features: ['PlayStation 5 Console', '4K HDR Gaming', 'DualSense Controller', 'Premium Headset', 'Comfortable Gaming Chair'],
      available: true,
      image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop'
    },
    {
      id: '2',
      name: 'PS5 Station Beta',
      type: 'PS5' as const,
      hourlyRate: 150,
      description: 'High-performance PS5 station with exclusive game library and surround sound.',
      features: ['PlayStation 5 Console', '7.1 Surround Sound', 'Exclusive Games', 'Racing Wheel Support', 'Snacks & Drinks'],
      available: false,
      image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop'
    },
    {
      id: '3',
      name: 'PC Gaming Rig Neo',
      type: 'PC' as const,
      hourlyRate: 120,
      description: 'High-end gaming PC with RTX 4080 and mechanical keyboard for competitive gaming.',
      features: ['RTX 4080 Graphics', '32GB RAM', 'Mechanical Keyboard', '144Hz Monitor', 'Gaming Mouse'],
      available: true,
      image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400&h=300&fit=crop'
    },
    {
      id: '4',
      name: 'PC Gaming Rig Matrix',
      type: 'PC' as const,
      hourlyRate: 130,
      description: 'Ultra-performance setup with RTX 4090 and curved monitor for immersive experience.',
      features: ['RTX 4090 Graphics', '64GB RAM', 'Curved Ultrawide Monitor', 'RGB Lighting', 'Streaming Setup'],
      available: true,
      image: 'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=400&h=300&fit=crop'
    },
    {
      id: '5',
      name: 'PC Gaming Rig Cyber',
      type: 'PC' as const,
      hourlyRate: 140,
      description: 'Top-tier gaming setup with liquid cooling and professional peripherals.',
      features: ['RTX 4090 Graphics', 'Liquid Cooling', 'Professional Peripherals', 'Dual Monitors', 'VR Ready'],
      available: false,
      image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=300&fit=crop'
    },
    {
      id: '6',
      name: 'PS5 Station Gamma',
      type: 'PS5' as const,
      hourlyRate: 150,
      description: 'Latest PS5 setup with PSVR2 support and premium accessories.',
      features: ['PlayStation 5 Console', 'PSVR2 Support', 'Premium Accessories', 'Comfortable Seating', 'Climate Control'],
      available: true,
      image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop'
    }
  ]

  const toggleType = (type: 'PC' | 'PS5') => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const currentStations = stationsList.length > 0 ? stationsList : fallbackStations
  const filteredStations = currentStations.filter((station: any) => selectedTypes.includes(station.type))

  return (
    <div className="min-h-screen">
      <NavBar />
      
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4">
              GAMING <span className="text-cp-cyan">STATIONS</span>
            </h1>
            <p className="text-xl text-gray-300">
              Choose your perfect gaming setup and book your session
            </p>
          </div>

          {/* Filter Buttons */}
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={() => toggleType('PC')}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 border-2 ${
                selectedTypes.includes('PC')
                  ? 'bg-cp-cyan text-cp-black border-cp-cyan shadow-lg shadow-cp-cyan/25'
                  : 'bg-transparent text-cp-cyan border-cp-cyan hover:bg-cp-cyan hover:text-cp-black'
              }`}
            >
              PC GAMING
            </button>
            <button
              onClick={() => toggleType('PS5')}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 border-2 ${
                selectedTypes.includes('PS5')
                  ? 'bg-cp-magenta text-white border-cp-magenta shadow-lg shadow-cp-magenta/25'
                  : 'bg-transparent text-cp-magenta border-cp-magenta hover:bg-cp-magenta hover:text-white'
              }`}
            >
              PS5 GAMING
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-400">Loading stations...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredStations.map((station: any) => (
                <StationCard key={station.id} {...station} />
              ))}
            </div>
          )}

          {/* Show message when no stations match filter */}
          {filteredStations.length === 0 && (
            <div className="text-center py-12">
              <p className="text-xl text-gray-400">
                No stations match your current filter selection
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
} 