/**
 * Signature Manager
 *
 * Admin interface to:
 * - Browse signature templates
 * - Create custom signatures
 * - Edit signatures
 * - Assign to accounts
 * - Set defaults
 */
import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Copy, Check, X, Link2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import {
  listSignatureTemplates,
  listSignatures,
  createSignature,
  updateSignature,
  deleteSignature,
  getAccounts,
  getAccountSignatures,
  assignSignatureToAccount,
} from '../../api/admin'
import SignatureEditor from './SignatureEditor'

export default function SignatureManager() {
  const [templates, setTemplates] = useState([])
  const [signatures, setSignatures] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('library') // 'library', 'custom', or 'assign'
  const [showEditor, setShowEditor] = useState(false)
  const [editingSignature, setEditingSignature] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [accountSignatures, setAccountSignatures] = useState([])
  const [assigningSignature, setAssigningSignature] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [templatesData, signaturesData, accountsData] = await Promise.all([
        listSignatureTemplates(),
        listSignatures(),
        getAccounts(),
      ])
      setTemplates(templatesData.templates || [])
      setSignatures(signaturesData.signatures || [])
      setAccounts(accountsData.accounts || [])
    } catch (err) {
      toast.error('Failed to load data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadAccountSignatures = async (accountId) => {
    try {
      const data = await getAccountSignatures(accountId)
      setAccountSignatures(data.signatures || [])
    } catch (err) {
      toast.error('Failed to load account signatures')
      console.error(err)
    }
  }

  const handleCreateFromTemplate = (template) => {
    setSelectedTemplate(template)
    setEditingSignature(null)
    setShowEditor(true)
  }

  const handleEditSignature = (signature) => {
    setEditingSignature(signature)
    setSelectedTemplate(null)
    setShowEditor(true)
  }

  const handleDeleteSignature = async (id) => {
    if (!window.confirm('Delete this signature? Accounts using it will lose their custom signature.')) {
      return
    }

    try {
      await deleteSignature(id)
      setSignatures(signatures.filter(s => s.id !== id))
      toast.success('Signature deleted')
    } catch (err) {
      toast.error('Failed to delete signature')
      console.error(err)
    }
  }

  const handleSelectAccount = (account) => {
    setSelectedAccount(account)
    loadAccountSignatures(account.id)
  }

  const handleAssignSignature = async (signatureId, isDefault = false) => {
    if (!selectedAccount) return

    setAssigningSignature(signatureId)
    try {
      await assignSignatureToAccount(selectedAccount.id, {
        signature_id: signatureId,
        is_default: isDefault,
      })
      await loadAccountSignatures(selectedAccount.id)
      toast.success(`Signature assigned to ${selectedAccount.email}`)
    } catch (err) {
      toast.error('Failed to assign signature')
      console.error(err)
    } finally {
      setAssigningSignature(null)
    }
  }

  const handleSaveSignature = async (signatureData) => {
    try {
      if (editingSignature) {
        // Update existing
        const updated = await updateSignature(editingSignature.id, signatureData)
        setSignatures(signatures.map(s => s.id === editingSignature.id ? updated.signature : s))
        toast.success('Signature updated')
      } else {
        // Create new
        const created = await createSignature(signatureData)
        setSignatures([...signatures, created.signature])
        toast.success('Signature created')
      }
      setShowEditor(false)
      setEditingSignature(null)
      setSelectedTemplate(null)
    } catch (err) {
      toast.error('Failed to save signature')
      console.error(err)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Loading signatures...</div>
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-surface-border overflow-x-auto">
        <button
          onClick={() => setActiveTab('library')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
            activeTab === 'library'
              ? 'border-brand text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          📚 Template Library
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
            activeTab === 'custom'
              ? 'border-brand text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          ✨ My Signatures ({signatures.length})
        </button>
        <button
          onClick={() => setActiveTab('assign')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'assign'
              ? 'border-brand text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <Link2 size={14} />
          Assign to Accounts
        </button>
      </div>

      {/* Template Library */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Pre-made Templates</h3>
            <p className="text-xs text-gray-500">{templates.length} templates available</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {templates.map(template => (
              <div
                key={template.id}
                className="border border-surface-border rounded-lg p-4 hover:border-brand/40 transition space-y-3"
              >
                <div>
                  <h4 className="font-semibold text-white">{template.name}</h4>
                  <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                </div>

                {template.preview_image && (
                  <img
                    src={template.preview_image}
                    alt={template.name}
                    className="w-full h-24 object-cover rounded border border-surface-border"
                  />
                )}

                <div className="flex flex-wrap gap-1">
                  {template.variables?.map(v => (
                    <span
                      key={v}
                      className="px-2 py-1 bg-surface rounded text-[10px] text-gray-400"
                    >
                      {'{​{' + v + '}}'}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleCreateFromTemplate(template)}
                  className="btn-primary text-xs w-full flex items-center justify-center gap-1"
                >
                  <Copy size={12} />
                  Use Template
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Signatures */}
      {activeTab === 'custom' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">My Custom Signatures</h3>
            <button
              onClick={() => {
                setSelectedTemplate(null)
                setEditingSignature(null)
                setShowEditor(true)
              }}
              className="btn-primary text-xs flex items-center gap-1"
            >
              <Plus size={14} />
              Create Signature
            </button>
          </div>

          {signatures.length === 0 ? (
            <div className="text-center py-8 px-4 rounded-lg bg-surface-raised border border-surface-border">
              <p className="text-sm text-gray-500 mb-3">No custom signatures yet</p>
              <button
                onClick={() => setActiveTab('library')}
                className="btn-secondary text-xs"
              >
                Browse Templates
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {signatures.map(sig => (
                <div
                  key={sig.id}
                  className="p-4 bg-surface rounded-lg border border-surface-border hover:border-brand/40 transition flex items-center justify-between"
                >
                  <div className="flex-1">
                    <h4 className="font-semibold text-white">{sig.name}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">{sig.description}</p>
                    <p className="text-[10px] text-gray-600 mt-1">
                      Used by {sig.accounts?.length || 0} account{sig.accounts?.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditSignature(sig)}
                      className="p-2 hover:bg-surface-raised rounded transition"
                      title="Edit"
                    >
                      <Edit2 size={14} className="text-gray-400 hover:text-white" />
                    </button>
                    <button
                      onClick={() => handleDeleteSignature(sig.id)}
                      className="p-2 hover:bg-red-500/20 rounded transition"
                      title="Delete"
                    >
                      <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assignment Tab */}
      {activeTab === 'assign' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Assign Signatures to Accounts</h3>

          {/* Account Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-400 uppercase">Select Account</label>
            <div className="grid grid-cols-1 gap-2">
              {accounts.map(account => (
                <button
                  key={account.id}
                  onClick={() => handleSelectAccount(account)}
                  className={`p-3 text-left rounded-lg border transition ${
                    selectedAccount?.id === account.id
                      ? 'border-brand bg-brand/10 ring-1 ring-brand'
                      : 'border-surface-border bg-surface hover:border-brand/40'
                  }`}
                >
                  <p className="font-medium text-white">{account.email}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{account.display_name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Signatures for Selected Account */}
          {selectedAccount && (
            <div className="space-y-3 border-t border-surface-border pt-4">
              <div>
                <h4 className="font-medium text-white mb-2">Available Signatures</h4>
                <p className="text-xs text-gray-500 mb-3">
                  {accountSignatures.length > 0
                    ? `${accountSignatures.length} signature${accountSignatures.length === 1 ? '' : 's'} assigned`
                    : 'No signatures assigned yet'}
                </p>
              </div>

              {/* Already Assigned */}
              {accountSignatures.length > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-semibold text-gray-400">Assigned</p>
                  {accountSignatures.map(sig => (
                    <div
                      key={sig.id}
                      className="p-2 bg-surface rounded border border-surface-border flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{sig.name}</p>
                        <p className="text-xs text-gray-500">{sig.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {sig.pivot?.is_default && (
                          <span className="px-2 py-1 bg-brand/30 text-brand text-[10px] rounded font-medium">
                            DEFAULT
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Available to Assign */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400">
                  {accountSignatures.length === signatures.length ? 'All signatures assigned' : 'Available to Assign'}
                </p>
                {signatures
                  .filter(sig => !accountSignatures.find(as => as.id === sig.id))
                  .map(sig => (
                    <div
                      key={sig.id}
                      className="p-2 bg-surface rounded border border-surface-border flex items-center justify-between hover:border-brand/40 transition"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{sig.name}</p>
                        <p className="text-xs text-gray-500">{sig.description}</p>
                      </div>
                      <button
                        onClick={() => handleAssignSignature(sig.id)}
                        disabled={assigningSignature === sig.id}
                        className="ml-2 px-2 py-1 bg-brand/20 text-brand text-xs rounded font-medium hover:bg-brand/30 transition disabled:opacity-50"
                      >
                        {assigningSignature === sig.id ? 'Assigning...' : 'Assign'}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <SignatureEditor
          template={selectedTemplate}
          signature={editingSignature}
          onSave={handleSaveSignature}
          onClose={() => {
            setShowEditor(false)
            setEditingSignature(null)
            setSelectedTemplate(null)
          }}
        />
      )}
    </div>
  )
}
