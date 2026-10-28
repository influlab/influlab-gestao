'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Megaphone,
  Settings,
  LogOut,
  Wallet,
  Package,
  Filter,
  Tag,
  Menu,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/entradas', label: 'Entradas', icon: TrendingUp },
  { href: '/anuncios', label: 'Anúncios', icon: Megaphone },
  { href: '/custos/fixos', label: 'Custos Fixos', icon: TrendingDown },
  { href: '/custos/avulsos', label: 'Custos Avulsos', icon: Wallet },
  { href: '/assinaturas', label: 'Assinaturas', icon: CreditCard },
  { href: '/prestadores', label: 'Prestadores', icon: Users },
  { href: '/origens', label: 'Origens', icon: Tag },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/regras-utm', label: 'Regras de UTM', icon: Filter },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Barra superior só no mobile — a sidebar de verdade vira um menu gaveta */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">IL</span>
          </div>
          <p className="text-sm font-semibold text-white leading-none">InfluLAB</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="text-slate-300 p-1.5 -mr-1.5"
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 min-h-screen bg-slate-900 flex flex-col shrink-0 transform transition-transform duration-200 ease-out md:static md:w-60 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">IL</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">InfluLAB</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-none">Gestão Financeira</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden text-slate-400 p-1"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-3 border-t border-slate-700/60">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            <LogOut size={15} className="shrink-0" />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  )
}
