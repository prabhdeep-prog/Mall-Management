/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained server bundle under .next/standalone/
  // Required for the Docker image (see Dockerfile).
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

module.exports = nextConfig

