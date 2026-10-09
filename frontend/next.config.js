/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The receipt route reads these fonts at runtime; make sure they are deployed with it.
    outputFileTracingIncludes: {
      '/api/v1/admin/bookings/[id]/receipt': ['./server/assets/fonts/**/*'],
    },
  },
}

module.exports = nextConfig
