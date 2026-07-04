import { useState, useEffect } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import { CONDITIONS, ACTIONS } from './ruleConstants'

export default function RuleBuilder({ isOpen, onClose, onSave, rule = null, folders = [] }) {
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [conditions, setConditions] = useState([])
  const [actions, setActions] = useState([])
  const [isEnabled, setIsEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (rule) {
      setDisplayName(rule.display_name)
      setDescription(rule.description || '')
      setConditions(rule.conditions || [])
      setActions(rule.actions || [])
      setIsEnabled(rule.is_enabled)
    } else {
      resetForm()
    }
  }, [rule, isOpen])

  const resetForm = () => {
    setDisplayName('')
    setDescription('')
    setConditions([])
    setActions([])
    setIsEnabled(true)
  }

  const addCondition = () => {
    const conditionKey = Object.keys(CONDITIONS)[0]
    const condDef = CONDITIONS[conditionKey]
    let initialValue = ''

    if (condDef.type === 'email-list' || condDef.type === 'string-list') {
      initialValue = []
    } else if (condDef.type === 'boolean') {
      initialValue = true
    }

    setConditions([
      ...conditions,
      {
        key: conditionKey,
        value: initialValue,
      },
    ])
  }

  const removeCondition = (index) => {
    setConditions(conditions.filter((_, i) => i !== index))
  }

  const updateCondition = (index, updates) => {
    const newConditions = [...conditions]
    newConditions[index] = { ...newConditions[index], ...updates }
    setConditions(newConditions)
  }

  const addAction = () => {
    const actionKey = Object.keys(ACTIONS)[0]
    const actionDef = ACTIONS[actionKey]
    let initialValue = ''

    if (actionDef.type === 'email-list' || actionDef.type === 'string-list') {
      initialValue = []
    } else if (actionDef.type === 'boolean') {
      initialValue = true
    }

    setActions([
      ...actions,
      {
        key: actionKey,
        value: initialValue,
      },
    ])
  }

  const removeAction = (index) => {
    setActions(actions.filter((_, i) => i !== index))
  }

  const updateAction = (index, updates) => {
    const newActions = [...actions]
    newActions[index] = { ...newActions[index], ...updates }
    setActions(newActions)
  }

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast.error('Rule name is required')
      return
    }

    if (conditions.length === 0) {
      toast.error('Add at least one condition')
      return
    }

    if (actions.length === 0) {
      toast.error('Add at least one action')
      return
    }

    setSaving(true)
    try {
      await onSave({
        display_name: displayName,
        description: description,
        conditions: conditions,
        actions: actions,
        is_enabled: isEnabled,
      })
      resetForm()
      onClose()
    } catch (err) {
      toast.error('Failed to save rule')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal open={isOpen} onClose={onClose} title={rule ? 'Edit Rule' : 'Create New Rule'}>
      <div className="space-y-6 max-h-[80vh] overflow-y-auto">
        {/* Name & Description */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase">Rule Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Auto-file marketing emails"
              className="w-full mt-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this rule does..."
              rows={2}
              className="w-full mt-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand resize-none"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-gray-300">Enabled</span>
          </label>
        </div>

        {/* Conditions */}
        <div className="border-t border-surface-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase">IF (Conditions)</label>
            <button
              onClick={addCondition}
              className="text-xs px-2 py-1 bg-brand/20 text-brand rounded hover:bg-brand/30 transition flex items-center gap-1"
            >
              <Plus size={12} />
              Add Condition
            </button>
          </div>

          <div className="space-y-2">
            {!Array.isArray(conditions) || conditions.length === 0 ? (
              <p className="text-[10px] text-gray-600 italic">No conditions yet</p>
            ) : (
              conditions.map((cond, idx) => (
                <ConditionRow
                  key={idx}
                  condition={cond}
                  index={idx}
                  onUpdate={updateCondition}
                  onRemove={removeCondition}
                  folders={folders}
                />
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-surface-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase">THEN (Actions)</label>
            <button
              onClick={addAction}
              className="text-xs px-2 py-1 bg-brand/20 text-brand rounded hover:bg-brand/30 transition flex items-center gap-1"
            >
              <Plus size={12} />
              Add Action
            </button>
          </div>

          <div className="space-y-2">
            {!Array.isArray(actions) || actions.length === 0 ? (
              <p className="text-[10px] text-gray-600 italic">No actions yet</p>
            ) : (
              actions.map((action, idx) => (
                <ActionRow
                  key={idx}
                  action={action}
                  index={idx}
                  onUpdate={updateAction}
                  onRemove={removeAction}
                  folders={folders}
                />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-surface-border pt-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="btn-ghost text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-xs"
          >
            {saving ? 'Saving...' : 'Save Rule'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ConditionRow({ condition, index, onUpdate, onRemove, folders }) {
  const condDef = CONDITIONS[condition.key]

  return (
    <div className="p-2 bg-surface rounded border border-surface-border space-y-2">
      <div className="flex items-center justify-between gap-2">
        <select
          value={condition.key}
          onChange={(e) => onUpdate(index, { key: e.target.value })}
          className="flex-1 bg-surface-raised border border-surface-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand"
        >
          {CONDITIONS && Object.entries(CONDITIONS).map(([key, def]) => (
            <option key={key} value={key}>
              {def?.label || key}
            </option>
          ))}
        </select>
        <button
          onClick={() => onRemove(index)}
          className="p-1 hover:bg-red-500/20 rounded transition"
          title="Remove"
        >
          <Trash2 size={12} className="text-red-400" />
        </button>
      </div>

      {condDef?.type === 'email-list' && (
        <textarea
          value={Array.isArray(condition.value) ? condition.value.join('\n') : condition.value}
          onChange={(e) => onUpdate(index, { value: e.target.value.split('\n').filter(Boolean) })}
          placeholder="one@email.com&#10;two@email.com"
          rows={2}
          className="w-full bg-surface-raised border border-surface-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand resize-none"
        />
      )}

      {condDef?.type === 'string-list' && (
        <textarea
          value={Array.isArray(condition.value) ? condition.value.join('\n') : condition.value}
          onChange={(e) => onUpdate(index, { value: e.target.value.split('\n').filter(Boolean) })}
          placeholder="keyword1&#10;keyword2"
          rows={2}
          className="w-full bg-surface-raised border border-surface-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand resize-none"
        />
      )}

      {condDef?.type === 'select' && (
        <select
          value={condition.value}
          onChange={(e) => onUpdate(index, { value: e.target.value })}
          className="w-full bg-surface-raised border border-surface-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand"
        >
          <option value="">Select...</option>
          {condDef.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {condDef?.type === 'boolean' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={condition.value === true}
            onChange={(e) => onUpdate(index, { value: e.target.checked })}
            className="rounded"
          />
          <span className="text-xs text-gray-300">{condDef.description}</span>
        </label>
      )}
    </div>
  )
}

function ActionRow({ action, index, onUpdate, onRemove, folders }) {
  const actionDef = ACTIONS[action.key]

  return (
    <div className="p-2 bg-surface rounded border border-surface-border space-y-2">
      <div className="flex items-center justify-between gap-2">
        <select
          value={action.key}
          onChange={(e) => onUpdate(index, { key: e.target.value })}
          className="flex-1 bg-surface-raised border border-surface-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand"
        >
          {ACTIONS && Object.entries(ACTIONS).map(([key, def]) => (
            <option key={key} value={key}>
              {def?.label || key}
            </option>
          ))}
        </select>
        <button
          onClick={() => onRemove(index)}
          className="p-1 hover:bg-red-500/20 rounded transition"
          title="Remove"
        >
          <Trash2 size={12} className="text-red-400" />
        </button>
      </div>

      {actionDef?.type === 'folder-select' && (
        <select
          value={action.value}
          onChange={(e) => onUpdate(index, { value: e.target.value })}
          className="w-full bg-surface-raised border border-surface-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand"
        >
          <option value="">Select folder...</option>
          {Array.isArray(folders) && folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.displayName}
            </option>
          ))}
        </select>
      )}

      {actionDef?.type === 'email-list' && (
        <textarea
          value={Array.isArray(action.value) ? action.value.join('\n') : action.value}
          onChange={(e) => onUpdate(index, { value: e.target.value.split('\n').filter(Boolean) })}
          placeholder="recipient@email.com"
          rows={2}
          className="w-full bg-surface-raised border border-surface-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand resize-none"
        />
      )}

      {actionDef?.type === 'string-list' && (
        <textarea
          value={Array.isArray(action.value) ? action.value.join('\n') : action.value}
          onChange={(e) => onUpdate(index, { value: e.target.value.split('\n').filter(Boolean) })}
          placeholder="category1&#10;category2"
          rows={2}
          className="w-full bg-surface-raised border border-surface-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand resize-none"
        />
      )}

      {actionDef?.type === 'boolean' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={action.value === true}
            onChange={(e) => onUpdate(index, { value: e.target.checked })}
            className="rounded"
          />
          <span className="text-xs text-gray-300">{actionDef.description}</span>
        </label>
      )}
    </div>
  )
}
