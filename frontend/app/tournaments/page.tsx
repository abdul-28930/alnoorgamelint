'use client'

import { NavBar } from '@/components/ui/navbar'

export default function TournamentsPage() {
  return (
    <div className="min-h-screen bg-cp-black">
      <NavBar />
      
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8">
            <h1 className="text-6xl md:text-8xl font-bold mb-4 text-cp-yellow">
              TOURNAMENTS
            </h1>
            <div className="text-4xl md:text-6xl text-cp-cyan mb-8 font-bold">
              COMING SOON!
            </div>
          </div>
          
          <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-cp-yellow mb-4">Epic Gaming Tournaments</h2>
            <p className="text-gray-300 text-lg mb-6">
              Get ready for intense competition! Our tournament system is in development and will feature:
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div className="text-gray-300">
                <div className="text-cp-cyan font-semibold">🎮 PS5 & PC Tournaments</div>
                <div className="text-cp-cyan font-semibold">🏆 Knockout & League Formats</div>
                <div className="text-cp-cyan font-semibold">💰 Prize Pools</div>
              </div>
              <div className="text-gray-300">
                <div className="text-cp-cyan font-semibold">📊 Auto Bracket Generation</div>
                <div className="text-cp-cyan font-semibold">⚡ Live Match Tracking</div>
                <div className="text-cp-cyan font-semibold">🎯 Player Rankings</div>
              </div>
            </div>
          </div>
          
          <p className="text-gray-400 text-lg">
            Stay tuned for updates. The future of competitive gaming is coming to Neo Gaming Cafe!
          </p>
        </div>
      </main>
    </div>
  )
} 