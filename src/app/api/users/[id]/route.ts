import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  const role = cookieStore.get('user_role')?.value ?? 'admin'
  if (!token || !verifyToken(token)) return null
  return { email: verifyToken(token)!, role }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 })

  const { id } = await params

  const supabase = await createClient()
  const { error } = await supabase.from('app_users').delete().eq('id', id)

  if (error) return Response.json({ error: 'Erro ao remover usuário' }, { status: 500 })
  return Response.json({ ok: true })
}
