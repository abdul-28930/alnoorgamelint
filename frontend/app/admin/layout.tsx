import type { ReactNode } from 'react'
import { AdminShell } from '@/components/ui/admin-sidebar'

// One frame for every /admin page: site header + collapsible left menu. Pages only render their own content.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
