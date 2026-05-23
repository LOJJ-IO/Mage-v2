/** @type {import('next').NextConfig} */

/** Where Next.js rewrites /api/* → FastAPI (see vercel.json backend routePrefix). */
function resolveBackendUrl() {
  if (process.env.BACKEND_URL?.trim()) {
    return process.env.BACKEND_URL.trim().replace(/\/$/, '');
  }
  // Vercel sets these at build/runtime; same host serves frontend + /_/backend
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, '')}/_/backend`;
  }
  return 'http://127.0.0.1:8000';
}

const backendUrl = resolveBackendUrl();

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
