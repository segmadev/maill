import { useState, useEffect } from 'react'
import { Trash2, Download, Loader, RefreshCw, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import { listLogs, clearLog, clearAllLogs, downloadLog } from '../api/admin'

export default function LogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [selectedLog, setSelectedLog] = useState(null)
  const [logContent, setLogContent] = useState('')
  const [loadingContent, setLoadingContent] = useState(false)

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    setLoading(true)
    try {
      const data = await listLogs()
      setLogs(data.logs || [])
    } catch (err) {
      toast.error('Failed to load logs')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectLog = async (log) => {
    setSelectedLog(log)
    setLoadingContent(true)
    try {
      const data = await listLogs()
      const selected = data.logs.find(l => l.name === log.name)
      if (selected) {
        setSelectedLog(selected)
        // Note: We would need an endpoint to get log content
        // For now, just show the file info
      }
    } catch (err) {
      toast.error('Failed to load log content')
      console.error(err)
    } finally {
      setLoadingContent(false)
    }
  }

  const handleClearLog = async (filename) => {
    if (!window.confirm(`Clear log file "${filename}"?`)) return

    setDeleting(filename)
    try {
      await clearLog(filename)
      toast.success('Log cleared')
      loadLogs()
      setSelectedLog(null)
    } catch (err) {
      toast.error('Failed to clear log')
      console.error(err)
    } finally {
      setDeleting(null)
    }
  }

  const handleClearAllLogs = async () => {
    if (!window.confirm('Clear ALL log files? This cannot be undone.')) return

    setDeleting('all')
    try {
      const result = await clearAllLogs()
      toast.success(`Cleared ${result.cleared_count} log files`)
      loadLogs()
      setSelectedLog(null)
    } catch (err) {
      toast.error('Failed to clear logs')
      console.error(err)
    } finally {
      setDeleting(null)
    }
  }

  const handleDownloadLog = async (filename) => {
    try {
      const blob = await downloadLog(filename)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Downloaded')
    } catch (err) {
      toast.error('Failed to download log')
      console.error(err)
    }
  }

  const totalSizeGb = (logs.reduce((sum, log) => sum + log.size, 0) / 1024 / 1024).toFixed(2)

  return (
    <AdminLayout title="Server Logs">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Server Logs</h1>
            <p className="text-sm text-gray-500 mt-1">
              {logs.length} log file{logs.length !== 1 ? 's' : ''} • {totalSizeGb} MB total
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadLogs}
              className="text-xs px-3 py-2 rounded bg-surface hover:bg-surface-raised text-gray-300 transition flex items-center gap-1"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              onClick={handleClearAllLogs}
              disabled={deleting === 'all' || logs.length === 0}
              className="text-xs px-3 py-2 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition flex items-center gap-1 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {deleting === 'all' ? 'Clearing...' : 'Clear All'}
            </button>
          </div>
        </div>

        {/* Warning */}
        <div className="p-3 rounded-lg border bg-yellow-500/10 border-yellow-500/30 flex items-start gap-2">
          <AlertTriangle size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-yellow-300">
            <p className="font-semibold">Production Debugging</p>
            <p>These are server-side logs for debugging. Use carefully in production. Clearing logs is irreversible.</p>
          </div>
        </div>

        {/* Logs Grid */}
        {loading ? (
          <div className="text-center py-12">
            <Loader size={24} className="animate-spin text-brand mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-lg bg-surface-raised border border-surface-border">
            <p className="text-sm text-gray-500">No log files found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {logs.map((log) => (
              <div
                key={log.name}
                className={`p-3 rounded-lg border transition cursor-pointer ${
                  selectedLog?.name === log.name
                    ? 'bg-surface border-brand'
                    : 'bg-surface border-surface-border hover:border-brand/40'
                }`}
                onClick={() => handleSelectLog(log)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-white text-sm">{log.name}</h4>
                    <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                      <span>{log.size_kb} KB</span>
                      <span>Modified: {log.modified_at}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownloadLog(log.name)
                      }}
                      className="p-2 hover:bg-surface-raised rounded transition"
                      title="Download"
                    >
                      <Download size={14} className="text-gray-400 hover:text-white" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleClearLog(log.name)
                      }}
                      disabled={deleting === log.name}
                      className="p-2 hover:bg-red-500/20 rounded transition disabled:opacity-50"
                      title="Clear"
                    >
                      <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
