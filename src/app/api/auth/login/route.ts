import { NextRequest } from 'next/server'
import crypto from 'crypto'

function sign(value: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  const validEmail = process.env.AUTH_EMAIL
  const validPassword = process.env.AUTH_PASSWORD
  const secret = process.env.AUTH_SECRET ?? 'fallback-secret'

  if (!validEmail || !validPassword) {
    return Response.json({ error: 'Servidor não configurado' }, { status: 500 })
  }

  if (email !== validEmail || password !== validPassword) {
    return Response.json({ error: 'Email ou senha incorretos' }, { status: 401 })
  }

  const token = sign(`${email}:authenticated`, secret)

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    },
  })
}
