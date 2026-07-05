/**
 * AccountSelectionStep
 *
 * Multi-account selection with search, filtering, and distribution strategy
 * Optimized UI for users with many connected accounts
 */
import { useState } from 'react'
import { Search, ChevronDown, Lock, Mail, CheckCircle2, Users, AlertCircle, Eye, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../../store/mailStore'
import { getMyAccounts } from '../../api/mail'

export default function AccountSelectionStep({
  recipients,
  accounts,
  accountId,
  setAccountId,
  onBack,
  onNext,
  previousSelection = null,
  previousCustomDistribution = null,
  previousAllocationStrategy = 'round-robin',
}) {
  const [searchQuery, setSearchQuery] = useState('')
  // Use previousSelection if available (when going back), otherwise use accountId
  const [selectedAccounts, setSelectedAccounts] = useState(
    previousSelection && previousSelection.length > 0 && previousSelection[0] !== null
      ? previousSelection
      : [accountId]
  )
  const [allocationStrategy, setAllocationStrategy] = useState(previousAllocationStrategy)
  const [customDistribution, setCustomDistribution] = useState(previousCustomDistribution || {})
  const [filterType, setFilterType] = useState('all') // 'all', 'oauth', 'smtp'
  const [isReloading, setIsReloading] = useState(false)
  const { setAccounts } = useMailStore()

  const handleReloadAccounts = async () => {
    setIsReloading(true)
    try {
      const data = await getMyAccounts()
      setAccounts(data.accounts || [])
      toast.success(`Loaded ${data.accounts?.length || 0} accounts`)
    } catch (err) {
      toast.error('Failed to reload accounts')
      console.error(err)
    } finally {
      setIsReloading(false)
    }
  }

  // Filter accounts
  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = account.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = filterType === 'all' || account.connection_type === filterType
    return matchesSearch && matchesType
  })

  // Group accounts by type
  const groupedAccounts = {
    oauth: filteredAccounts.filter(a => a.connection_type === 'oauth'),
    smtp: filteredAccounts.filter(a => a.connection_type === 'smtp'),
    oauth_manual: filteredAccounts.filter(a => a.connection_type === 'oauth_manual'),
  }

  const handleSelectAccount = (id) => {
    if (selectedAccounts.includes(id)) {
      const newSelected = selectedAccounts.filter(x => x !== id)
      setSelectedAccounts(newSelected.length ? newSelected : [accounts[0].id])
    } else {
      setSelectedAccounts([...selectedAccounts, id])
      setAccountId(id)
    }
  }

  const handleSelectAll = () => {
    if (selectedAccounts.length === filteredAccounts.length) {
      setSelectedAccounts([accounts[0].id])
    } else {
      setSelectedAccounts(filteredAccounts.map(a => a.id))
    }
  }

  const handleNext = () => {
    if (!selectedAccounts.length) {
      toast.error('Select at least one account')
      return
    }

    // Validate custom distribution if selected
    if (allocationStrategy === 'custom') {
      let totalEmails = 0
      for (const accId of selectedAccounts) {
        const customCount = parseInt(customDistribution[accId] || 0)
        if (customCount <= 0) {
          toast.error('All accounts must have a number greater than 0 for custom distribution')
          return
        }
        totalEmails += customCount
      }
      if (totalEmails === 0) {
        toast.error('Total emails must be greater than 0')
        return
      }
      if (totalEmails > recipients.length) {
        toast.error(`Total custom distribution (${totalEmails}) cannot exceed total recipients (${recipients.length})`)
        return
      }
    }

    // Store selection in window for next steps
    window.__accountSelection = {
      selectedAccounts,
      allocationStrategy,
      customDistribution: allocationStrategy === 'custom' ? customDistribution : null,
    }
    onNext()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Select Sending Accounts</h3>
          <p className="text-xs text-gray-500 mt-1">{recipients.length} recipients will be sent through selected accounts</p>
        </div>
        <button
          onClick={handleReloadAccounts}
          disabled={isReloading}
          title="Reload accounts from server"
          className="p-2 rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={`text-gray-400 ${isReloading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-3 text-gray-600" />
          <input
            type="text"
            placeholder="Search accounts by email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-surface-border rounded-lg pl-10 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand"
          />
        </div>
        <div className="flex gap-1 bg-surface border border-surface-border rounded-lg p-1">
          {['all', 'oauth', 'smtp'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filterType === type
                  ? 'bg-brand/20 text-brand'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {type === 'all' ? 'All' : type.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSelectAll}
          className="text-xs px-3 py-2 rounded bg-surface-raised hover:bg-gray-700 text-gray-300 transition-colors flex items-center gap-1"
        >
          <CheckCircle2 size={12} />
          {selectedAccounts.length === filteredAccounts.length ? 'Deselect All' : 'Select All'}
        </button>
        <div className="flex-1" />
        <span className="text-xs text-gray-500 py-2">
          {selectedAccounts.length} of {accounts.length} selected
        </span>
      </div>

      {/* Account List - Grouped */}
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
        {/* OAuth Accounts */}
        {groupedAccounts.oauth.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Lock size={12} /> OAuth Accounts ({groupedAccounts.oauth.length})
            </p>
            <div className="space-y-1">
              {groupedAccounts.oauth.map(account => (
                <AccountCard
                  key={account.id}
                  account={account}
                  isSelected={selectedAccounts.includes(account.id)}
                  onSelect={() => handleSelectAccount(account.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* SMTP Accounts */}
        {groupedAccounts.smtp.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Mail size={12} /> SMTP Accounts ({groupedAccounts.smtp.length})
            </p>
            <div className="space-y-1">
              {groupedAccounts.smtp.map(account => (
                <AccountCard
                  key={account.id}
                  account={account}
                  isSelected={selectedAccounts.includes(account.id)}
                  onSelect={() => handleSelectAccount(account.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Manual OAuth Accounts */}
        {groupedAccounts.oauth_manual.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Lock size={12} /> Manual OAuth ({groupedAccounts.oauth_manual.length})
            </p>
            <div className="space-y-1">
              {groupedAccounts.oauth_manual.map(account => (
                <AccountCard
                  key={account.id}
                  account={account}
                  isSelected={selectedAccounts.includes(account.id)}
                  onSelect={() => handleSelectAccount(account.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State - No Accounts Connected */}
        {accounts.length === 0 && (
          <div className="text-center py-12 px-4 rounded-lg bg-surface-raised border border-surface-border">
            <AlertCircle size={32} className="mx-auto text-yellow-500 mb-3" />
            <p className="text-sm font-semibold text-white mb-1">No Accounts Connected</p>
            <p className="text-xs text-gray-500 mb-4">You need to connect at least one account before sending emails.</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleReloadAccounts}
                disabled={isReloading}
                className="btn-secondary text-xs flex items-center gap-1"
              >
                <RefreshCw size={12} className={isReloading ? 'animate-spin' : ''} />
                {isReloading ? 'Reloading...' : 'Reload Accounts'}
              </button>
              <button
                onClick={() => window.location.href = '/accounts'}
                className="btn-primary text-xs"
              >
                Connect Account
              </button>
            </div>
          </div>
        )}

        {/* Empty State - Filtered Results */}
        {accounts.length > 0 && filteredAccounts.length === 0 && (
          <div className="text-center py-12 px-4 rounded-lg bg-surface-raised border border-surface-border">
            <Eye size={32} className="mx-auto text-blue-500 mb-3" />
            <p className="text-sm font-semibold text-white mb-1">No Matching Accounts</p>
            <p className="text-xs text-gray-500 mb-4">
              {searchQuery && `No accounts match "${searchQuery}"`}
              {!searchQuery && filterType !== 'all' && `No ${filterType.toUpperCase()} accounts found`}
            </p>
            <button
              onClick={() => {
                setSearchQuery('')
                setFilterType('all')
              }}
              className="btn-secondary text-xs flex items-center gap-1 mx-auto"
            >
              <Eye size={12} />
              Show All Accounts
            </button>
          </div>
        )}
      </div>

      {/* Distribution Strategy (Multi-account) */}
      {selectedAccounts.length > 1 && (
        <div className="bg-surface-raised rounded-lg p-4 border border-brand/20 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Distribution Formula</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'round-robin', label: '⚖️ Round Robin', desc: 'Alternate' },
              { value: 'equal', label: '📊 Equal', desc: 'Divide equally' },
              { value: 'sequential', label: '→ Sequential', desc: 'Fill accounts' },
              { value: 'custom', label: '✏️ Custom', desc: 'Set per account' },
            ].map(strategy => (
              <label
                key={strategy.value}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-colors text-center ${
                  allocationStrategy === strategy.value
                    ? 'border-brand bg-brand/10'
                    : 'border-surface-border hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="allocation"
                  value={strategy.value}
                  checked={allocationStrategy === strategy.value}
                  onChange={e => setAllocationStrategy(e.target.value)}
                  className="hidden"
                />
                <p className="text-xs font-medium text-white">{strategy.label}</p>
                <p className="text-[10px] text-gray-500 mt-1">{strategy.desc}</p>
              </label>
            ))}
          </div>

          {/* Custom Distribution Inputs */}
          {allocationStrategy === 'custom' && (
            <div className="pt-3 border-t border-surface-border space-y-2">
              <p className="text-[10px] text-gray-600">Emails per account:</p>
              <div className="space-y-2">
                {selectedAccounts.map(id => {
                  const account = accounts.find(a => a.id === id)
                  const totalAssigned = Object.values(customDistribution).reduce((sum, v) => sum + (parseInt(v) || 0), 0)
                  const remaining = recipients.length - totalAssigned
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 flex-1 truncate">{account?.email}</span>
                      <input
                        type="number"
                        min="0"
                        max={recipients.length}
                        value={customDistribution[id] || ''}
                        onChange={e => setCustomDistribution({
                          ...customDistribution,
                          [id]: e.target.value
                        })}
                        placeholder="0"
                        className="w-20 px-2 py-1 bg-surface border border-surface-border rounded text-xs text-white text-center focus:outline-none focus:border-brand"
                      />
                    </div>
                  )
                })}
              </div>

              {/* Distribution Summary */}
              <div className="pt-2 border-t border-surface-border space-y-1.5">
                {Object.values(customDistribution).some(v => v) && (
                  <>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-600">Assigned:</span>
                      <span className="text-brand font-medium">{Object.values(customDistribution).reduce((sum, v) => sum + (parseInt(v) || 0), 0)} / {recipients.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`${recipients.length - Object.values(customDistribution).reduce((sum, v) => sum + (parseInt(v) || 0), 0) === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                        Remaining:
                      </span>
                      <span className={`font-medium ${recipients.length - Object.values(customDistribution).reduce((sum, v) => sum + (parseInt(v) || 0), 0) === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                        {recipients.length - Object.values(customDistribution).reduce((sum, v) => sum + (parseInt(v) || 0), 0)}
                      </span>
                    </div>
                  </>
                )}
                {!Object.values(customDistribution).some(v => v) && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-600">Available to assign:</span>
                    <span className="text-gray-400 font-medium">{recipients.length}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Distribution Preview */}
          {allocationStrategy !== 'custom' && (
            <div className="pt-3 border-t border-surface-border space-y-2">
              <p className="text-[10px] text-gray-600">Estimated distribution:</p>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {selectedAccounts.map(id => {
                  const account = accounts.find(a => a.id === id)
                  const perAccount = Math.ceil(recipients.length / selectedAccounts.length)
                  return (
                    <div key={id} className="flex items-center justify-between text-[10px] p-2 bg-surface rounded">
                      <span className="text-gray-400 truncate">{account?.email}</span>
                      <span className="text-brand font-medium">{perAccount}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Buttons */}
      <div className="flex justify-between pt-4 border-t border-surface-border">
        <button onClick={onBack} className="btn-ghost text-xs">← Import</button>
        <button onClick={handleNext} className="btn-primary text-xs">Content →</button>
      </div>
    </div>
  )
}

function AccountCard({ account, isSelected, onSelect }) {
  const TypeIcon = account.connection_type.includes('oauth') ? Lock : Mail
  const typeLabel = account.connection_type === 'oauth_manual' ? 'Manual OAuth' : account.connection_type.toUpperCase()

  return (
    <label className="flex items-center gap-3 p-3 rounded-lg border border-surface-border hover:border-brand/40 hover:bg-surface-raised cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onSelect}
        className="rounded"
      />
      <TypeIcon size={14} className={isSelected ? 'text-brand' : 'text-gray-600'} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate">{account.email}</p>
        <p className="text-[10px] text-gray-600">{typeLabel}</p>
      </div>
      {isSelected && (
        <CheckCircle2 size={14} className="text-brand flex-shrink-0" />
      )}
    </label>
  )
}
