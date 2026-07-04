/**
 * Smart pagination bar.
 *
 * Shows: ‹ 1 … 4 5 6 … 10 ›
 * For ≤ 7 pages shows every page number.
 */
export default function Pagination({ page, totalPages, total, label = 'items', onPage }) {
  if (totalPages <= 1) return null

  // Build page number list with ellipsis markers
  const pages = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    const lo = Math.max(2, page - 1)
    const hi = Math.min(totalPages - 1, page + 1)
    for (let i = lo; i <= hi; i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  const btn = 'w-7 h-7 text-xs rounded flex items-center justify-center transition-colors'

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-surface-border flex-wrap gap-2">
      <p className="text-xs text-gray-500">
        {total} {label}
      </p>
      <div className="flex items-center gap-0.5">
        {/* Prev */}
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className={`${btn} text-gray-500 hover:bg-surface-raised disabled:opacity-30`}
          title="Previous"
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className={`${btn} text-gray-600 cursor-default`}>
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`${btn} ${
                page === p
                  ? 'bg-brand text-white font-medium'
                  : 'text-gray-400 hover:bg-surface-raised hover:text-white'
              }`}
            >
              {p}
            </button>
          )
        )}

        {/* Next */}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className={`${btn} text-gray-500 hover:bg-surface-raised disabled:opacity-30`}
          title="Next"
        >
          ›
        </button>
      </div>
    </div>
  )
}
