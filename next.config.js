/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid filesystem cache serialization warnings during local development.
      config.cache = { type: "memory" }
    }
    return config
  },
}

module.exports = nextConfig

