export function Footer() {
  const quickLinks = [
    { name: 'Stations', href: '/stations' },
    { name: 'Bookings', href: '/bookings' },
    { name: 'Profile', href: '/profile' },
    { name: 'Support', href: '/support' }
  ]

  const socialLinks = [
    { name: 'Discord', href: '#' },
    { name: 'Instagram', href: '#' },
    { name: 'Twitter', href: '#' },
    { name: 'YouTube', href: '#' }
  ]

  return (
    <footer className="bg-cp-black border-t border-cp-yellow/20 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="text-2xl font-bold text-cp-yellow mb-4">
              NEO<span className="text-cp-cyan">GAMING</span><span className="text-cp-yellow">CAFE</span>
            </div>
            <p className="text-gray-400 text-sm">
              Premium gaming experience in the heart of the city. Book your session and enter the matrix.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold text-cp-cyan mb-4">Quick Links</h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <a href={link.href} className="text-gray-400 hover:text-cp-yellow transition-colors">
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div>
            <h3 className="text-lg font-semibold text-cp-cyan mb-4">Connect</h3>
            <ul className="space-y-2">
              {socialLinks.map((link) => (
                <li key={link.name}>
                  <a href={link.href} className="text-gray-400 hover:text-cp-yellow transition-colors">
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 mt-8 pt-8 text-center">
          <p className="text-gray-400 text-sm">
            © 2024 Neo Gaming Cafe. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
} 