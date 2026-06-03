import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, hashPassword } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  const role = cookieStore.get('user_role')?.value ?? 'admin'
  if (!token || !verifyToken(token)) return null
  return { email: verifyToken(token)!, role }
}

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('app_users')
    .select('id, email, name, role, active, created_at')
    .order('created_at', { ascending: true })

  if (error) return Response.json({ error: 'Erro ao buscar usuários' }, { status: 500 })
  return Response.json({ users: data })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 })

  const { name, email: newEmail, password, role } = await request.json()

  if (!name || !newEmail || !password) {
    return Response.json({ error: 'Nome, email e senha são obrigatórios' }, { status: 400 })
  }

  const validRole = role === 'admin' ? 'admin' : 'member'
  const password_hash = hashPassword(password)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('app_users')
    .insert({ name, email: newEmail, password_hash, role: validRole })
    .select('id, email, name, role, active, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'Este email já está cadastrado' }, { status: 409 })
    }
    return Response.json({ error: 'Erro ao criar usuário' }, { status: 500 })
  }

  return Response.json({ user: data }, { status: 201 })
}
