'use client'

import { useState } from 'react'
import { UserPlus, Trash2, ShieldCheck, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AppUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  active: boolean
  created_at: string
}

type Props = {
  initialUsers: AppUser[]
}

export function UsuariosClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' })

  function resetForm() {
    setForm({ name: '', email: '', password: '', role: 'member' })
    setError('')
  }

  async function handleAdd() {
    if (!form.name || !form.email || !form.password) {
      setError('Preencha todos os campos')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Erro ao criar usuário')
        return
      }
      setUsers(prev => [...prev, json.user])
      setOpen(false)
      resetForm()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja remover este usuário?')) return
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (res.ok) setUsers(prev => prev.filter(u => u.id !== id))
    } catch {}
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Usuários</h3>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie quem tem acesso ao sistema</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setOpen(true) }}>
          <UserPlus className="w-4 h-4 mr-1.5" />
          Adicionar
        </Button>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          Nenhum usuário cadastrado. Use as credenciais de ambiente para fazer login.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                  {u.role === 'admin' ? (
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{u.name}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  u.role === 'admin'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {u.role === 'admin' ? 'Admin' : 'Membro'}
                </span>
                <button
                  onClick={() => handleDelete(u.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  title="Remover usuário"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar usuário</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="user-name">Nome</Label>
              <Input
                id="user-name"
                placeholder="Nome completo"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="email@exemplo.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="user-password">Senha</Label>
              <Input
                id="user-password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="user-role">Perfil</Label>
              <select
                id="user-role"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <option value="member">Membro</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleAdd} disabled={loading}>
                {loading ? 'Salvando...' : 'Adicionar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
