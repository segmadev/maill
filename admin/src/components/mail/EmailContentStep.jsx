/**
 * EmailContentStep
 *
 * Focused UI for composing email subject and body
 * Simplified from original BulkComposeStep
 */
import { useState, useRef, useEffect } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, Link2, Code2, Eye,
  Braces, ChevronDown, Type, Eraser, AlignLeft, AlignCenter, AlignRight,
  Users, Eye as EyeIcon,
} from 'lucide-react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import '../../components/mail/MailCompose.css'
import { tryDecodeBase64, resolveTemplate } from '../../utils/templateUtils'
import SignatureSelector from '../admin/SignatureSelector'

export default function EmailContentStep({
  recipients,
  accounts,
  base64Fields,
  accountId,
  subject,
  setSubject,
  body,
  setBody,
  onBack,
  onNext,
  selectedAccountIds = [],
}) {
  const [showVars, setShowVars] = useState(true)
  const [showSignature, setShowSignature] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [signatureMode, setSignatureMode] = useState('dynamic')
  const [signatureConfig, setSignatureConfig] = useState({ signature_id: null, include: true })
  const [previewAccountId, setPreviewAccountId] = useState(selectedAccountIds?.[0] || null)
  const [accountSignatures, setAccountSignatures] = useState({})
  const quillRef = useRef(null)
  const quillContainerRef = useRef(null)
  const subjectRef = useRef(null)

  const b64Set = new Set(base64Fields ?? [])
  const vars = recipients.length > 0
    ? Object.keys(recipients[0].data).filter(k => k.toLowerCase() !== 'email')
    : []

  // Fetch signatures for selected accounts
  useEffect(() => {
    if (!selectedAccountIds || selectedAccountIds.length === 0) return

    const fetchSignatures = async () => {
      try {
        const { getAccountSignatures } = await import('../../api/admin')
        const sigs = {}

        for (const accId of selectedAccountIds) {
          try {
            const data = await getAccountSignatures(accId)
            const defaultSig = data.signatures?.find(s => s.pivot?.is_default)
            sigs[accId] = defaultSig || data.signatures?.[0] || null
          } catch (err) {
            console.error(`Failed to fetch signatures for account ${accId}:`, err)
            sigs[accId] = null
          }
        }

        setAccountSignatures(sigs)
        // Set preview account to first one if not set
        if (!previewAccountId && selectedAccountIds[0]) {
          setPreviewAccountId(selectedAccountIds[0])
        }
      } catch (err) {
        console.error('Failed to import getAccountSignatures:', err)
      }
    }

    fetchSignatures()
  }, [selectedAccountIds])

  // Initialize Quill editor (only once)
  useEffect(() => {
    if (!quillContainerRef.current || quillRef.current) return

    try {
      // Check if already initialized
      if (quillContainerRef.current.querySelector('.ql-editor')) {
        return
      }

      // Create Quill instance
      quillRef.current = new Quill(quillContainerRef.current, {
        theme: 'snow',
        placeholder: 'Write your message...',
        modules: {
          toolbar: [
            ['bold', 'italic', 'underline', 'strike'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ align: [] }],
            ['blockquote', 'code-block'],
            ['link'],
            ['clean'],
          ],
        },
      })

      // Set initial content
      if (body) {
        const delta = quillRef.current.clipboard.convert({ html: body })
        quillRef.current.setContents(delta)
      }

      // Handle changes
      quillRef.current.on('text-change', () => {
        setBody(quillRef.current.root.innerHTML)
      })
    } catch (err) {
      console.error('Quill init error:', err)
    }
  }, [])

  const insertVar = (token) => {
    if (editorMode === 'html') {
      setHtmlSource(htmlSource + token)
      setBody(htmlSource + token)
    } else {
      editorRef.current?.focus()
      document.execCommand('insertText', false, token)
      if (editorRef.current) setBody(editorRef.current.innerHTML)
    }
  }

  const handleNext = () => {
    if (!subject.trim()) {
      alert('Subject is required')
      return
    }
    const currentBody = quillRef.current?.root.innerHTML ?? body
    if (!currentBody || !currentBody.trim()) {
      alert('Message body is required')
      return
    }
    if (quillRef.current) setBody(quillRef.current.root.innerHTML)

    // Store signature settings in window for next steps
    window.__emailSignatureConfig = {
      signature_mode: signatureMode,
      signature_id: signatureMode === 'static' ? signatureConfig.signature_id : null,
      include_signature: signatureMode === 'static' ? signatureConfig.include : true,
    }

    onNext()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Compose Email</h3>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <Users size={12} />
            From: {accounts.find(a => a.id === accountId)?.email}
          </p>
        </div>
      </div>

      {/* Subject */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">Subject</label>
        <input
          ref={subjectRef}
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Email subject..."
          className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand"
        />
      </div>

      {/* Variables Panel */}
      {vars.length > 0 && (
        <div className="bg-surface-raised rounded-lg overflow-hidden border border-surface-border">
          <button
            onClick={() => setShowVars(!showVars)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:bg-surface-raised transition-colors"
          >
            <span className="flex items-center gap-2">
              <Braces size={12} className="text-brand/60" />
              Variables ({vars.length} available)
            </span>
            <ChevronDown size={11} className={`transition-transform ${showVars ? 'rotate-180' : ''}`} />
          </button>
          {showVars && (
            <div className="px-3 pb-3 pt-1 border-t border-surface-border bg-surface-raised/30 flex flex-wrap gap-2">
              {vars.map(k => (
                <button
                  key={k}
                  onMouseDown={e => { e.preventDefault(); insertVar(`{{${k}}}`) }}
                  className="text-[10px] px-2 py-1 rounded bg-brand/10 text-brand/80 border border-brand/20 hover:bg-brand/20 hover:text-brand whitespace-nowrap"
                >
                  {`{{${k}}}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message Editor */}
      <div>
        <label className="text-xs text-gray-500 font-medium block mb-2">Message</label>
        <div
          ref={quillContainerRef}
          className="quill-editor-container"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '256px',
            borderRadius: '8px',
            border: '1px solid #2d2d4d',
            overflow: 'hidden',
          }}
        />
      </div>

      {/* Signature Settings */}
      {(selectedAccountIds && selectedAccountIds.length > 0) && (
        <div className="bg-surface-raised rounded-lg overflow-hidden border border-surface-border">
          <button
            onClick={() => setShowSignature(!showSignature)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:bg-surface transition-colors"
          >
            <span className="font-semibold">Email Signature</span>
            <ChevronDown size={12} className={`transition-transform ${showSignature ? 'rotate-180' : ''}`} />
          </button>

          {showSignature && (
            <div className="px-4 pb-4 pt-2 border-t border-surface-border space-y-4 bg-surface">
              {/* Signature Mode Toggle */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase">Signature Mode</label>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 flex-1 p-2 rounded border border-surface-border cursor-pointer hover:bg-surface-raised transition" style={{borderColor: signatureMode === 'dynamic' ? '#10b981' : 'inherit'}}>
                    <input
                      type="radio"
                      name="signature_mode"
                      value="dynamic"
                      checked={signatureMode === 'dynamic'}
                      onChange={e => setSignatureMode(e.target.value)}
                    />
                    <div>
                      <p className="text-xs font-medium text-white">Dynamic</p>
                      <p className="text-[10px] text-gray-500">Each account uses its own signature</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 flex-1 p-2 rounded border border-surface-border cursor-pointer hover:bg-surface-raised transition" style={{borderColor: signatureMode === 'static' ? '#10b981' : 'inherit'}}>
                    <input
                      type="radio"
                      name="signature_mode"
                      value="static"
                      checked={signatureMode === 'static'}
                      onChange={e => setSignatureMode(e.target.value)}
                    />
                    <div>
                      <p className="text-xs font-medium text-white">Static</p>
                      <p className="text-[10px] text-gray-500">Use same signature for all</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Static Mode: Signature Selector */}
              {signatureMode === 'static' && (
                <div className="space-y-2 border-t border-surface-border pt-3">
                  <label className="text-xs font-semibold text-gray-400 uppercase">Select Signature</label>
                  {selectedAccountIds && selectedAccountIds.length > 0 && selectedAccountIds[0] ? (
                    <>
                      <SignatureSelector
                        accountId={selectedAccountIds[0]}
                        onSignatureChange={setSignatureConfig}
                        includeSignature={signatureConfig.include}
                      />
                      <p className="text-[10px] text-gray-600">
                        This signature will be used for all accounts in the campaign.
                      </p>
                    </>
                  ) : (
                    <div className="p-2 bg-red-500/10 rounded border border-red-500/30 text-[10px] text-red-300">
                      ⚠️ No account selected. Please go back and select an account first.
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Mode: Info */}
              {signatureMode === 'dynamic' && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <p className="text-[10px] text-green-300">
                    ✓ Each account will use its default signature (or Outlook's signature if not configured).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Message Preview */}
      <div className="bg-surface-raised rounded-lg overflow-hidden border border-surface-border">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:bg-surface transition-colors"
        >
          <span className="flex items-center gap-2">
            <EyeIcon size={12} />
            Message Preview
          </span>
          <ChevronDown size={12} className={`transition-transform ${showPreview ? 'rotate-180' : ''}`} />
        </button>

        {showPreview && (
          <div className="px-4 pb-4 pt-3 border-t border-surface-border space-y-3 bg-surface max-h-[600px] overflow-y-auto">
            {/* Account selector for dynamic mode */}
            {signatureMode === 'dynamic' && selectedAccountIds && selectedAccountIds.length > 1 && (
              <div className="space-y-2">
                <label className="text-xs text-gray-600 font-semibold">Preview Signature From Account:</label>
                <select
                  value={previewAccountId || ''}
                  onChange={(e) => setPreviewAccountId(parseInt(e.target.value))}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
                >
                  {selectedAccountIds.map(accId => {
                    const acc = accounts.find(a => a.id === accId)
                    return (
                      <option key={accId} value={accId}>
                        {acc?.email} {accountSignatures[accId] ? '(has signature)' : '(no signature)'}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            {/* Preview Box - Mimics Email Client */}
            <div className="p-4 bg-black/40 rounded-lg border border-surface-border space-y-3">
              {/* Email Header */}
              <div className="space-y-1 pb-3 border-b border-gray-700">
                <div className="text-xs text-gray-600">
                  <span className="font-semibold text-gray-400">From:</span> {accounts.find(a => a.id === previewAccountId)?.email || 'Account'}
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-white">Subject:</span> <span className="text-gray-300">{subject || '(no subject)'}</span>
                </div>
              </div>

              {/* Email Body */}
              <div className="space-y-4">
                <div
                  className="text-sm text-gray-300"
                  dangerouslySetInnerHTML={{ __html: body || '<em>(message body)</em>' }}
                />

                {/* Signature Preview */}
                {signatureMode === 'static' && signatureConfig.signature_id && (
                  <div className="pt-3 border-t border-gray-700">
                    <p className="text-xs text-gray-600 mb-2 italic">-- Signature --</p>
                    <div className="text-[10px] text-gray-400 whitespace-pre-wrap">
                      Static signature will be appended here
                    </div>
                  </div>
                )}

                {signatureMode === 'dynamic' && accountSignatures[previewAccountId] && (
                  <div className="pt-3 border-t border-gray-700">
                    <p className="text-xs text-gray-600 mb-2 italic">-- Signature --</p>
                    <div
                      className="text-[10px] text-gray-400"
                      dangerouslySetInnerHTML={{ __html: accountSignatures[previewAccountId]?.html_content || '(signature content)' }}
                    />
                  </div>
                )}

                {signatureMode === 'dynamic' && !accountSignatures[previewAccountId] && (
                  <div className="pt-3 border-t border-gray-700">
                    <p className="text-xs text-gray-600 italic">No signature configured for this account</p>
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-[10px] text-blue-300">
                {signatureMode === 'dynamic'
                  ? '✓ Each account will use its own default signature'
                  : '✓ All emails will include the selected signature'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-surface-border">
        <button onClick={onBack} className="btn-ghost text-xs">← Accounts</button>
        <button onClick={handleNext} className="btn-primary text-xs">Settings →</button>
      </div>
    </div>
  )
}
