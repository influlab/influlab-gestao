import { Sidebar } from '@/components/sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-slate-100">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
