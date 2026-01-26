'use client'

import { useState, useEffect } from 'react'
import { NavBar } from '@/components/ui/navbar'
import { Footer } from '@/components/ui/footer'
import { points } from '@/lib/supabase'

export default function RewardsPage() {
  const [rewards, setRewards] = useState<any[]>([])
  const [pointsBalance, setPointsBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [rewardsRes, balanceRes] = await Promise.all([
        points.getRewards(),
        points.getBalance()
      ])
      
      if (rewardsRes.data) setRewards(rewardsRes.data)
      if (balanceRes.data) setPointsBalance(balanceRes.data.points_balance || 0)
    } catch (err) {
      setError('Failed to load rewards')
    } finally {
      setLoading(false)
    }
  }

  const handleRedeem = async (rewardId: string, rewardName: string, cost: number) => {
    if (pointsBalance < cost) {
      setError('Insufficient points')
      return
    }

    setRedeeming(rewardId)
    setError('')
    setMessage('')

    try {
      const { data, error } = await points.redeemReward(rewardId)
      
      if (error) {
        setError(error.message)
      } else {
        setMessage(`Successfully redeemed ${rewardName}! Coupon code: ${data.coupon_code}`)
        setPointsBalance(pointsBalance - cost)
      }
    } catch (err) {
      setError('Failed to redeem reward')
    } finally {
      setRedeeming('')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cp-black">
        <NavBar />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-cp-cyan text-lg">Loading rewards...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cp-black">
      <NavBar />
      
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">
              REWARDS <span className="text-cp-cyan">SHOP</span>
            </h1>
            <p className="text-gray-300 mb-4">Redeem your points for discount coupons</p>
            <div className="text-2xl font-bold text-cp-yellow">
              Your Balance: {pointsBalance} points
            </div>
            <p className="text-gray-400 text-sm">100 points = ₹1 redemption value</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {message && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 mb-4">
              <p className="text-green-400 text-sm">{message}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rewards.map((reward) => (
              <div key={reward.id} className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-cp-yellow mb-2">{reward.name}</h3>
                    <p className="text-gray-300 text-sm">{reward.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-cp-cyan">{reward.points_cost}</div>
                    <div className="text-xs text-gray-400">points</div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-white">
                    {reward.discount_percentage}% OFF
                  </span>
                  <button
                    onClick={() => handleRedeem(reward.id, reward.name, reward.points_cost)}
                    disabled={pointsBalance < reward.points_cost || redeeming === reward.id}
                    className={`px-4 py-2 rounded font-semibold transition-colors ${
                      pointsBalance >= reward.points_cost && redeeming !== reward.id
                        ? 'bg-cp-cyan text-cp-black hover:bg-cp-yellow'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {redeeming === reward.id ? 'Redeeming...' : 'Redeem'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {rewards.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg">No rewards available at the moment</div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
} 