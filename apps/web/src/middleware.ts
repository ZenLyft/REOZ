import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let static assets, PWA manifest, and icons pass through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Update session & get authenticated user
  const { response, user } = await updateSession(request);

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth');
  const isDashboardRoute = pathname.startsWith('/dashboard');

  // If user is unauthenticated and attempting to access protected dashboard routes
  if (isDashboardRoute && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If user is already authenticated and visits the login page, redirect to dashboard
  if (isAuthRoute && pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
