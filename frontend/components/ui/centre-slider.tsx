'use client'

import { useState, useEffect } from 'react'

export function CentreSlider() {
  const [currentSlide, setCurrentSlide] = useState(0)

  const images = [
    {
      url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&h=500&fit=crop',
      title: 'Gaming Lounge Overview'
    },
    {
      url: 'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=800&h=500&fit=crop',
      title: 'PC Gaming Setup Area'
    },
    {
      url: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800&h=500&fit=crop',
      title: 'Console Gaming Stations'
    },
    {
      url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&h=500&fit=crop',
      title: 'Interior Gaming Atmosphere'
    },
    {
      url: 'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=800&h=500&fit=crop',
      title: 'Gaming Lounge & Food Area'
    }
  ]

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % images.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [images.length])

  return (
    <section className="py-20 px-6 bg-cp-gray/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold mb-4">
            OUR GAMING <span className="text-cp-cyan">CENTRE</span>
          </h2>
          <p className="text-xl text-gray-300">
            Experience the ultimate gaming environment
          </p>
        </div>

        <div className="relative h-[400px] rounded-lg overflow-hidden">
          {images.map((image, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentSlide ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={image.url}
                alt={image.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute bottom-6 left-6">
                <h3 className="text-white text-xl font-bold text-shadow-lg">
                  {image.title}
                </h3>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-6 space-x-2">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              aria-label={`Go to slide ${index + 1}`}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentSlide ? 'bg-cp-cyan' : 'bg-gray-500'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  )
} 