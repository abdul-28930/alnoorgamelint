import { useState, useEffect } from 'react'
import Link from 'next/link'
import { NeonButton } from './neon-button'
import { bookings } from '@/lib/supabase'

interface StationCardProps {
  id: string
  name: string
  type: 'PS5' | 'PC'
  hourly_rate: number
  description?: string
  features?: string[] | string
  image_url?: string
}

export function StationCard({ 
  id, 
  name, 
  type, 
  hourly_rate, 
  description = 'Gaming station with premium setup',
  features = ['High-end gaming setup', 'Premium accessories', 'Comfortable seating'],
  image_url 
}: StationCardProps) {
  const [availabilityStatus, setAvailabilityStatus] = useState('Available')
  const [isLoading, setIsLoading] = useState(true)
  
  const typeIcon = type === 'PS5' ? '🎮' : '💻'
  const typeColor = type === 'PS5' ? 'text-cp-cyan' : 'text-cp-yellow'
  
  // Handle features from database (JSONB string) or fallback (array)
  const featuresList = typeof features === 'string' ? JSON.parse(features) : features

  useEffect(() => {
    checkAvailability()
  }, [id])

  const checkAvailability = async () => {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await bookings.getAvailableSlots(id, today)
    
    if (data) {
      const availableSlots = data.filter((slot: any) => slot.is_available)
      const totalSlots = data.length
      
      if (availableSlots.length === totalSlots) {
        setAvailabilityStatus('Available')
      } else if (availableSlots.length === 0) {
        setAvailabilityStatus('Fully Booked')
      } else {
        setAvailabilityStatus(`${availableSlots.length}/${totalSlots} slots`)
      }
    }
    setIsLoading(false)
  }

  const getStatusColor = () => {
    if (availabilityStatus === 'Available') return 'text-green-400'
    if (availabilityStatus === 'Fully Booked') return 'text-red-400'
    return 'text-yellow-400'
  }

  const isAvailable = availabilityStatus !== 'Fully Booked'

  return (
    <div className="clip-angled bg-cp-gray border border-white/10 hover:border-cp-cyan/50 transition-all duration-300 overflow-hidden">
      {/* Image Section */}
      <div className="aspect-video bg-gradient-to-br from-cp-black to-cp-gray/50 flex items-center justify-center relative">
        {image_url ? (
          <img 
            src={image_url} 
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-6xl opacity-50">{typeIcon}</div>
        )}
        <div className="absolute top-3 right-3">
          <span className={`text-xs font-semibold px-2 py-1 rounded ${typeColor} bg-cp-black/70`}>
            {type}
          </span>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{typeIcon}</span>
              <h3 className="text-xl font-bold text-cp-yellow">{name}</h3>
            </div>
            <span className={`text-sm font-semibold ${typeColor}`}>{type} Station</span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-cp-cyan">₹{hourly_rate}</div>
            <div className="text-sm text-gray-400">per hour</div>
          </div>
        </div>

        <p className="text-gray-300 text-sm mb-4">{description}</p>

        <div className="mb-6">
          <h4 className="text-sm font-semibold text-cp-yellow mb-2">Features:</h4>
          <ul className="text-xs text-gray-400 space-y-1">
            {featuresList.map((feature: string, index: number) => (
              <li key={index}>• {feature}</li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${getStatusColor()}`}>
            ● {isLoading ? 'Checking...' : availabilityStatus}
          </span>
          {isAvailable ? (
            <Link href={`/book?station=${id}&name=${encodeURIComponent(name)}&rate=${hourly_rate}&type=${type}`}>
              <NeonButton 
                variant="primary" 
                className="text-sm px-4 py-2"
              >
                Book Now
              </NeonButton>
            </Link>
          ) : (
            <NeonButton 
              variant="primary" 
              disabled={true}
              className="text-sm px-4 py-2"
            >
              Book Now
            </NeonButton>
          )}
        </div>
      </div>
    </div>
  )
} 