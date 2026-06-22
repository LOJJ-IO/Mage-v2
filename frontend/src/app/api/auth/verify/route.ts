import { NextRequest, NextResponse } from 'next/server';
import { resolveBackendUrl } from '@/lib/backendUrl';

/**
 * Proxy magic-link verification so Set-Cookie from FastAPI is applied on the
 * browser's site origin. Vercel rewrites alone can drop session cookies on
 * redirect responses; this handler always uses redirect=false and forwards
 * Set-Cookie explicitly.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  if (!token || token.length < 8) {
    return NextResponse.json({ detail: 'token is required' }, { status: 422 });
  }

  const backend = resolveBackendUrl();
  const upstream = `${backend}/api/auth/verify?t=${encodeURIComponent(token)}&redirect=false`;

  let backendRes: Response;
  try {
    backendRes = await fetch(upstream, { cache: 'no-store' });
  } catch {
    return NextResponse.json(
      { detail: 'Could not reach the sign-in service. Please try again.' },
      { status: 502 }
    );
  }

  const contentType = backendRes.headers.get('content-type') ?? 'application/json';
  const body = await backendRes.text();

  const response = new NextResponse(body, {
    status: backendRes.status,
    headers: { 'Content-Type': contentType },
  });

  const setCookies =
    typeof backendRes.headers.getSetCookie === 'function'
      ? backendRes.headers.getSetCookie()
      : (() => {
          const single = backendRes.headers.get('set-cookie');
          return single ? [single] : [];
        })();

  for (const cookie of setCookies) {
    response.headers.append('Set-Cookie', cookie);
  }

  return response;
}
