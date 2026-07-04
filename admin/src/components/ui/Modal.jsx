import { X } from 'lucide-react'
import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className={`relative w-full ${sizes[size]} bg-surface-raised border border-surface-border rounded-2xl shadow-2xl`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto max-h-[82vh]">{children}</div>
      </div>
    </div>
  )
}
