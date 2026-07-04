import { useState, useEffect } from 'react'
import { AlertCircle, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import { getAccounts, getRulesForAccount, getFoldersForAccount } from '../api/admin'
import RulesList from '../components/rules/RulesList'

export default function RulesPage() {
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [rules, setRules] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(true)

  // Load accounts on mount
  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    setLoadingAccounts(true)
    try {
      const data = await getAccounts()
      setAccounts(data.accounts || [])
      if (data.accounts?.length > 0) {
        setSelectedAccount(data.accounts[0])
      }
    } catch (err) {
      toast.error('Failed to load accounts')
      console.error(err)
    } finally {
      setLoadingAccounts(false)
    }
  }

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0])
    }
  }, [accounts])

  useEffect(() => {
    if (selectedAccount) {
      loadRules()
      loadFolders()
    }
  }, [selectedAccount])

  const loadRules = async () => {
    if (!selectedAccount) return
    setLoading(true)
    try {
      const data = await getRulesForAccount(selectedAccount.id)
      setRules(data.rules || [])
    } catch (err) {
      toast.error('Failed to load rules')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadFolders = async () => {
    if (!selectedAccount) return
    try {
      const data = await getFoldersForAccount(selectedAccount.id)
      setFolders(data.folders || [])
    } catch (err) {
      console.error('Failed to load folders:', err)
    }
  }

  return (
    <AdminLayout title="Email Rules">
      <div className="space-y-6">
        {/* Account Selector */}
        <div className="bg-surface-raised rounded-lg border border-surface-border p-4">
          <label className="text-xs font-semibold text-gray-400 uppercase">Select Account</label>
          {loadingAccounts ? (
            <div className="mt-2 py-2 text-sm text-gray-500 flex items-center gap-2">
              <Loader size={14} className="animate-spin" />
              Loading accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="mt-2 py-2 text-sm text-gray-500">No accounts found</div>
          ) : (
            <select
              value={selectedAccount?.id || ''}
              onChange={(e) => {
                const account = accounts.find((a) => a.id === parseInt(e.target.value))
                setSelectedAccount(account)
              }}
              className="w-full mt-2 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Info Box */}
        <div className="p-3 rounded-lg border bg-blue-500/10 border-blue-500/30 flex items-start gap-2">
          <AlertCircle size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-blue-300">
            <p className="font-semibold mb-1">Outlook Rules</p>
            <p>
              Create rules to automatically organize, categorize, or manage your emails in Outlook. Rules are synced with your account
              and work exactly like Outlook&apos;s native rules feature.
            </p>
          </div>
        </div>

        {/* Rules List */}
        {loading ? (
          <div className="text-center py-12">
            <Loader size={24} className="animate-spin text-brand mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading rules...</p>
          </div>
        ) : (
          <RulesList
            accountId={selectedAccount?.id}
            rules={rules}
            onRulesChange={loadRules}
            folders={folders}
          />
        )}
      </div>
    </AdminLayout>
  )
}
