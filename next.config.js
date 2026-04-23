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
  async rewrites() {
    return [
      // /tenant/* → /portal/* URL mapping
      // The portal app lives at src/app/(portal)/portal/ but is exposed as /tenant/*
      { source: '/tenant',             destination: '/portal'             },
      { source: '/tenant/:path*',      destination: '/portal/:path*'     },
      // Login page rewrite
      { source: '/tenant/login',       destination: '/portal/login'      },
    ]
  },
}

module.exports = nextConfig
