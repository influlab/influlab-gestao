'use client'

import { createContext, useContext } from 'react'

const RoleContext = createContext<'admin' | 'member'>('admin')

export function RoleProvider({ role, children }: { role: string; children: React.ReactNode }) {
  const safe: 'admin' | 'member' = role === 'member' ? 'member' : 'admin'
  return <RoleContext.Provider value={safe}>{children}</RoleContext.Provider>
}

export function useIsAdmin() {
  return useContext(RoleContext) === 'admin'
}
