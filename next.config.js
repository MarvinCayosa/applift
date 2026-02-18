/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public', // where service worker and assets will be generated
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // only enable PWA in production
})

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Vercel-specific optimizations
  experimental: {
    serverComponentsExternalPackages: ['@google-cloud/storage'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; connect-src 'self' https://*.googleapis.com https://*.google.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com https://*.run.app; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://accounts.google.com https://*.firebaseapp.com; frame-src https://accounts.google.com https://*.firebaseapp.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.google.com https://*.googleusercontent.com blob:;",
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ]
  },
}

module.exports = withPWA(nextConfig)
