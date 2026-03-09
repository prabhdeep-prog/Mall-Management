/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained server bundle under .next/standalone/
  // Required for the Docker image (see Dockerfile).
  output: 'standalone',

  // ── Compression ────────────────────────────────────────────────────────────
  // Enable gzip/brotli for HTML, CSS, JS, JSON responses served by Next.js.
  compress: true,

  // ── Image optimization ─────────────────────────────────────────────────────
  images: {
    // Serve AVIF first (smallest), fallback to WebP, then original
    formats: ['image/avif', 'image/webp'],
    // Standard responsive breakpoints
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes:  [16, 32, 48, 64, 96, 128, 256, 384],
    // Aggressive caching for optimized images (1 year)
    minimumCacheTTL: 31536000,
    // Disallow unoptimized SVGs by default
    dangerouslyAllowSVG: false,
  },

  // ── Headers ────────────────────────────────────────────────────────────────
  // Static assets get long-lived cache headers (immutable — hash in filename).
  // API routes get no-store to prevent CDN caching of dynamic responses.
  async headers() {
    return [
      {
        // Next.js hashed static files — safe to cache forever
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Public directory assets
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=3600',
          },
        ],
      },
    ]
  },

  // ── Experimental ───────────────────────────────────────────────────────────
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Optimize package imports — tree-shake heavy icon and UI libraries
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'recharts',
      '@headlessui/react',
    ],
  },

  // ── Webpack customization (production only) ─────────────────────────────────
  webpack(config, { isServer, dev }) {
    if (!dev && !isServer) {
      // Split recharts into its own chunk so it's only loaded on chart pages
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...(config.optimization.splitChunks?.cacheGroups || {}),
          recharts: {
            test: /[\/]node_modules[\/]recharts[\/]/,
            name: 'recharts',
            chunks: 'all',
            priority: 20,
          },
        },
      }
    }
    return config
  },
}

module.exports = nextConfig
