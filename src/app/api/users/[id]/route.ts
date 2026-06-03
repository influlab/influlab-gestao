import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

async function requireAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) return null
  return verifyToken(token)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await requireAuth()
  if (!email) return Response.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const supabase = await createClient()
  const { error } = await supabase.from('app_users').delete().eq('id', id)

  if (error) return Response.json({ error: 'Erro ao remover usuário' }, { status: 500 })
  return Response.json({ ok: true })
}
