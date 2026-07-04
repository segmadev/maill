import { useState } from 'react'
import { Edit2, Trash2, RefreshCw, Plus, CheckCircle2, Circle } from 'lucide-react'
import toast from 'react-hot-toast'
import { createRule, updateRule, deleteRule, toggleRuleEnabled, syncRulesWithOutlook } from '../../api/admin'
import RuleBuilder from './RuleBuilder'

export default function RulesList({ accountId, rules, onRulesChange, folders }) {
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [syncing, setSyncing] = useState(false)

  const handleCreateNew = () => {
    setEditingRule(null)
    setShowBuilder(true)
  }

  const handleEdit = (rule) => {
    setEditingRule(rule)
    setShowBuilder(true)
  }

  const handleDelete = async (ruleId) => {
    if (!window.confirm('Delete this rule?')) return

    try {
      await deleteRule(accountId, ruleId)
      toast.success('Rule deleted')
      onRulesChange()
    } catch (err) {
      toast.error('Failed to delete rule')
      console.error(err)
    }
  }

  const handleToggle = async (ruleId, currentState) => {
    try {
      await toggleRuleEnabled(accountId, ruleId)
      toast.success(currentState ? 'Rule disabled' : 'Rule enabled')
      onRulesChange()
    } catch (err) {
      toast.error('Failed to toggle rule')
      console.error(err)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const data = await syncRulesWithOutlook(accountId)
      toast.success(`Synced ${data.synced} rules from Outlook`)
      onRulesChange()
    } catch (err) {
      toast.error('Failed to sync rules')
      console.error(err)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Rules</h3>
          <p className="text-xs text-gray-500 mt-1">{rules.length} rule{rules.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-xs px-3 py-2 rounded bg-surface hover:bg-surface-raised text-gray-300 transition flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            Sync Outlook
          </button>
          <button
            onClick={handleCreateNew}
            className="text-xs px-3 py-2 rounded bg-brand/20 text-brand hover:bg-brand/30 transition flex items-center gap-1"
          >
            <Plus size={12} />
            New Rule
          </button>
        </div>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="text-center py-8 px-4 rounded-lg bg-surface-raised border border-surface-border">
          <p className="text-sm text-gray-500 mb-3">No rules yet</p>
          <button
            onClick={handleCreateNew}
            className="btn-primary text-xs"
          >
            Create your first rule
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="p-3 bg-surface rounded-lg border border-surface-border hover:border-brand/40 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(rule.id, rule.is_enabled)}
                      className="p-1 hover:bg-surface-raised rounded transition"
                      title={rule.is_enabled ? 'Disable rule' : 'Enable rule'}
                    >
                      {rule.is_enabled ? (
                        <CheckCircle2 size={16} className="text-green-500" />
                      ) : (
                        <Circle size={16} className="text-gray-600" />
                      )}
                    </button>
                    <div>
                      <h4 className="font-semibold text-white text-sm">{rule.display_name}</h4>
                      {rule.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Conditions & Actions Preview */}
                  <div className="mt-2 ml-6 space-y-1">
                    <div className="text-[10px] text-gray-600">
                      <span className="text-gray-500">Conditions:</span>{' '}
                      {rule.conditions?.length > 0
                        ? `${rule.conditions.length} condition${rule.conditions.length !== 1 ? 's' : ''}`
                        : 'None'}
                    </div>
                    <div className="text-[10px] text-gray-600">
                      <span className="text-gray-500">Actions:</span>{' '}
                      {rule.actions?.length > 0
                        ? `${rule.actions.length} action${rule.actions.length !== 1 ? 's' : ''}`
                        : 'None'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(rule)}
                    className="p-2 hover:bg-surface-raised rounded transition"
                    title="Edit"
                  >
                    <Edit2 size={14} className="text-gray-400 hover:text-white" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-2 hover:bg-red-500/20 rounded transition"
                    title="Delete"
                  >
                    <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rule Builder Modal */}
      <RuleBuilder
        isOpen={showBuilder}
        onClose={() => {
          setShowBuilder(false)
          setEditingRule(null)
        }}
        onSave={async (ruleData) => {
          try {
            if (editingRule?.id) {
              // Update existing rule
              await updateRule(accountId, editingRule.id, ruleData)
              toast.success('Rule updated')
            } else {
              // Create new rule
              await createRule(accountId, ruleData)
              toast.success('Rule created')
            }
            onRulesChange()
            setShowBuilder(false)
            setEditingRule(null)
          } catch (err) {
            toast.error('Failed to save rule')
            console.error(err)
          }
        }}
        rule={editingRule}
        folders={folders}
      />
    </div>
  )
}
