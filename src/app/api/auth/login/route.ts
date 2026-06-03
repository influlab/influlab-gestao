import { NextRequest } from 'next/server'
import { createToken, verifyPassword } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return Response.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
  }

  let authenticated = false

  // Verificar usuários no banco
  try {
    const supabase = await createClient()
    const { data: user } = await supabase
      .from('app_users')
      .select('password_hash, active')
      .eq('email', email)
      .single()

    if (user?.active && verifyPassword(password, user.password_hash)) {
      authenticated = true
    }
  } catch {}

  // Fallback para credenciais legadas via variáveis de ambiente
  if (!authenticated) {
    const validEmail = process.env.AUTH_EMAIL
    const validPassword = process.env.AUTH_PASSWORD
    if (validEmail && validPassword && email === validEmail && password === validPassword) {
      authenticated = true
    }
  }

  if (!authenticated) {
    return Response.json({ error: 'Email ou senha incorretos' }, { status: 401 })
  }

  const token = createToken(email)

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    },
  })
}
