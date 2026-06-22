/** FastAPI base URL for server-side proxies (Next.js route handlers, rewrites). */
export function resolveBackendUrl(): string {
  if (process.env.BACKEND_URL?.trim()) {
    return process.env.BACKEND_URL.trim().replace(/\/$/, '');
  }
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, '')}/_/backend`;
  }
  return 'http://127.0.0.1:8000';
}
