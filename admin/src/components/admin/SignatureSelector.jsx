/**
 * Signature Selector
 *
 * Dropdown to select signature for compose/bulk send
 * Shows:
 * - All signatures available for the account
 * - Default signature highlighted
 * - Live preview on hover
 * - Checkbox to include/exclude signature
 */
import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { getAccountSignatures, renderSignature } from '../../api/admin'

export default function SignatureSelector({ accountId, onSignatureChange, includeSignature = true }) {
  const [signatures, setSignatures] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [defaultId, setDefaultId] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [previewId, setPreviewId] = useState(null)
  const [preview, setPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [includeChecked, setIncludeChecked] = useState(includeSignature)

  useEffect(() => {
    loadSignatures()
  }, [accountId])

  const loadSignatures = async () => {
    try {
      const data = await getAccountSignatures(accountId)
      setSignatures(data.signatures || [])

      if (data.default_signature) {
        setDefaultId(data.default_signature.id)
        setSelectedId(data.default_signature.id)
      } else if (data.signatures?.length > 0) {
        setSelectedId(data.signatures[0].id)
      }
    } catch (err) {
      console.error('Failed to load signatures:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleShowPreview = async (sigId) => {
    if (previewId === sigId) {
      setPreviewId(null)
      setPreview('')
      return
    }

    setPreviewId(sigId)
    try {
      const sig = signatures.find(s => s.id === sigId)
      if (sig) {
        const result = await renderSignature(sigId, {
          accountEmail: 'example@company.com',
          accountName: 'John Doe',
          accountPhone: '+1 (555) 123-4567',
          companyName: 'Company Name',
          currentDate: new Date().toISOString().split('T')[0],
        })
        setPreview(result.rendered_html)
      }
    } catch (err) {
      console.error('Failed to render preview:', err)
    }
  }

  const handleSelectSignature = (sigId) => {
    setSelectedId(sigId)
    setShowDropdown(false)
    onSignatureChange?.({ signature_id: sigId, include: includeChecked })
  }

  const handleToggleInclude = () => {
    const newInclude = !includeChecked
    setIncludeChecked(newInclude)
    onSignatureChange?.({ signature_id: selectedId, include: newInclude })
  }

  const selectedSignature = signatures.find(s => s.id === selectedId)

  if (loading) {
    return <div className="text-xs text-gray-500">Loading signatures...</div>
  }

  if (signatures.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-2">
        No signatures assigned to this account. Create one from Admin Settings.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Include Checkbox */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={includeChecked}
          onChange={handleToggleInclude}
          className="rounded"
        />
        <span className="text-xs font-medium text-gray-300">Include signature in email</span>
      </label>

      {/* Signature Selector */}
      {includeChecked && (
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full p-3 bg-surface border border-surface-border rounded-lg flex items-center justify-between hover:border-brand/40 transition text-left text-sm"
          >
            <div>
              <p className="text-white font-medium">{selectedSignature?.name || 'Select signature'}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedSignature?.description || 'No description'}
              </p>
            </div>
            <ChevronDown
              size={16}
              className={`text-gray-500 transition ${showDropdown ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown Menu */}
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-raised border border-surface-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {signatures.map(sig => (
                <div key={sig.id} className="border-b border-surface-border last:border-b-0">
                  {/* Signature Item */}
                  <button
                    onClick={() => handleSelectSignature(sig.id)}
                    className={`w-full p-3 text-left transition flex items-center justify-between ${
                      selectedId === sig.id
                        ? 'bg-brand/10 border-l-2 border-brand'
                        : 'hover:bg-surface'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {sig.name}
                        {defaultId === sig.id && (
                          <span className="ml-2 text-[10px] bg-brand/30 text-brand px-2 py-0.5 rounded">
                            DEFAULT
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{sig.description}</p>
                    </div>
                  </button>

                  {/* Preview Button */}
                  <div className="px-3 pb-2">
                    <button
                      onClick={() => handleShowPreview(sig.id)}
                      className="text-xs text-brand hover:text-brand/80 font-medium"
                    >
                      {previewId === sig.id ? 'Hide' : 'Show'} Preview
                    </button>

                    {/* Preview Content */}
                    {previewId === sig.id && preview && (
                      <div className="mt-2 p-2 bg-surface rounded border border-surface-border text-[10px] max-h-32 overflow-y-auto">
                        <div dangerouslySetInnerHTML={{ __html: preview }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
