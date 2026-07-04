import { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BulkSendPill from '../mail/BulkSendPill'

export default function AdminLayout({ title, children, noPadding = false }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  )

  function toggleSidebar() {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <>
      <div className="flex h-screen bg-surface overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />

        {/* Main area shifts with sidebar width */}
        <div
          className={`flex flex-col flex-1 min-w-0 transition-[margin] duration-200 ${
            collapsed ? 'ml-14' : 'ml-60'
          }`}
        >
          <TopBar title={title} onToggle={toggleSidebar} />
          <main
            className={`flex-1 min-h-0 ${
              noPadding
                ? 'overflow-hidden flex flex-col'
                : 'overflow-y-auto p-4 lg:p-6'
            }`}
          >
            {children}
          </main>
        </div>
      </div>

      {/* Fixed bulk-send progress pill — floats over every admin page */}
      <BulkSendPill />
    </>
  )
}
