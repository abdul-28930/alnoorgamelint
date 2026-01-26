'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { NavBar } from '@/components/ui/navbar'
import { Footer } from '@/components/ui/footer'
import { auth, profiles } from '@/lib/supabase'

function AuthPageContent() {
  const [isLogin, setIsLogin] = useState(true)
  const [emailOrUsername, setEmailOrUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  
  const searchParams = useSearchParams()
  const router = useRouter()
  const stationName = searchParams.get('name') || 'Gaming Station'

  const checkUsername = async (username: string) => {
    if (username.length < 3) return
    setUsernameChecking(true)
    try {
      const { data } = await profiles.checkUsername(username)
      setUsernameAvailable(data)
    } catch (err) {
      setUsernameAvailable(false)
    } finally {
      setUsernameChecking(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    // Validation
    if (isLogin) {
      if (!emailOrUsername || !password) {
        setError('Please fill in all fields')
        setLoading(false)
        return
      }
    } else {
      if (!email || !password || !confirmPassword || !fullName || !username || !phone) {
        setError('Please fill in all fields')
        setLoading(false)
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }
      if (usernameAvailable === false) {
        setError('Username is not available')
        setLoading(false)
        return
      }
    }

    try {
      const { data, error } = isLogin 
        ? await auth.signInWithUsernameOrEmail(emailOrUsername, password)
        : await auth.signUp(email, password, { fullName, username, phone })

      if (error) {
        setError(error.message)
      } else {
        if (isLogin) {
          // Redirect back to booking page after login
          const params = new URLSearchParams(searchParams.toString())
          router.push(`/book?${params.toString()}`)
        } else {
          // Redirect to profile page after signup
          router.push('/profile')
        }
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar />
      
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">
              {isLogin ? 'LOGIN' : 'SIGN UP'}
            </h1>
            <p className="text-gray-300">
              {isLogin ? 'Welcome back!' : 'Create your account'} Book {stationName}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6 space-y-4">
            {isLogin ? (
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
                  placeholder="Enter your email"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
                    placeholder="Enter your full name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Username <span className="text-xs text-red-400">(cannot be changed later)</span>
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      checkUsername(e.target.value)
                    }}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
                    placeholder="Choose a unique username"
                  />
                  {usernameChecking && <p className="text-xs text-gray-400 mt-1">Checking availability...</p>}
                  {usernameAvailable === true && <p className="text-xs text-green-400 mt-1">✓ Username available</p>}
                  {usernameAvailable === false && <p className="text-xs text-red-400 mt-1">✗ Username taken</p>}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
                    placeholder="Enter your email"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
                    placeholder="Enter your phone number"
                  />
                </div>
              </>
            )}
            
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
                placeholder="Enter your password"
              />
            </div>
            
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
                  placeholder="Confirm your password"
                />
              </div>
            )}
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cp-cyan text-cp-black py-3 rounded-lg font-bold hover:bg-cp-yellow transition-colors duration-300 disabled:opacity-50"
            >
              {loading ? 'PROCESSING...' : (isLogin ? 'LOGIN' : 'SIGN UP')}
            </button>
          </form>

          <div className="text-center mt-6">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-cp-cyan hover:text-cp-yellow transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Login"}
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-cp-cyan text-lg">Loading...</div></div>}>
      <AuthPageContent />
    </Suspense>
  )
} 