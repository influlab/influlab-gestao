import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'crypto'

function sign(value: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

export async function proxy(request: NextRequest) {
  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
  const isApiAuth = request.nextUrl.pathname.startsWith('/api/auth')
  const isApiWebhook = request.nextUrl.pathname.startsWith('/api/webhooks')

  if (isApiAuth || isApiWebhook) return NextResponse.next()

  const token = request.cookies.get('auth_token')?.value
  const email = process.env.AUTH_EMAIL ?? ''
  const secret = process.env.AUTH_SECRET ?? 'fallback-secret'
  const expected = email ? sign(`${email}:authenticated`, secret) : ''
  const authenticated = !!token && !!expected && token === expected

  if (!authenticated && !isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (authenticated && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
