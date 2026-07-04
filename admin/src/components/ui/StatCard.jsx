export default function StatCard({ label, value, sub, icon: Icon, color = 'blue', trend }) {
  const colors = {
    blue:   'bg-blue-500/10 text-blue-400',
    green:  'bg-green-500/10 text-green-400',
    purple: 'bg-purple-500/10 text-purple-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    red:    'bg-red-500/10 text-red-400',
  }
  return (
    <div className="card flex items-start gap-4">
      {Icon && (
        <div className={`p-2.5 rounded-lg ${colors[color]}`}>
          <Icon size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">
          {value ?? <span className="text-gray-600 text-lg">—</span>}
        </p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        {trend !== undefined && (
          <p className={`text-xs mt-1 font-medium ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)} today
          </p>
        )}
      </div>
    </div>
  )
}
