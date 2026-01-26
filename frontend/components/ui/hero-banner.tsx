import { NeonButton } from './neon-button'
import Link from 'next/link'

export function HeroBanner() {
  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden">
      {/* Background Video */}
      <video 
        className="absolute inset-0 w-full h-full object-cover opacity-40 z-10"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src="/cyberpunk.mp4" type="video/mp4" />
      </video>
      
      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-cp-black/20 via-transparent to-cp-black/60 z-15" />
      
      {/* Content */}
      <div className="relative z-20 text-center animate-fade-rise">
        <h1 className="text-6xl md:text-8xl font-bold mb-4 text-shadow-lg">
          ENTER THE
          <br />
          <span className="text-cp-cyan">GAMING</span>
          <br />
          MATRIX
        </h1>
        
        <p className="text-xl md:text-2xl mb-8 text-gray-300">
          Book your <span className="text-cp-cyan">PS5</span> or <span className="text-cp-yellow">PC</span> gaming session
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/book">
            <NeonButton variant="primary">
              Book Station
            </NeonButton>
          </Link>
          <Link href="/neo-card">
            <NeonButton variant="secondary">
              Buy Neo Card
            </NeonButton>
          </Link>
        </div>
      </div>
    </section>
  )
} 