import { cookies } from 'next/headers'
import { Sidebar } from '@/components/sidebar'
import { RoleProvider } from '@/components/role-context'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const role = cookieStore.get('user_role')?.value ?? 'admin'

  return (
    <div className="flex h-full">
      <Sidebar />
      <RoleProvider role={role}>
        <main className="flex-1 overflow-auto bg-slate-100">
          <div className="p-8">
            {children}
          </div>
        </main>
      </RoleProvider>
    </div>
  )
}
