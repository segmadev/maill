/**
 * Signature Editor
 *
 * Rich HTML editor for creating/editing signatures
 * - Visual & HTML modes
 * - Variable picker ({{accountEmail}}, etc)
 * - Image URL support
 * - Live preview
 */
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'

const AVAILABLE_VARIABLES = [
  { key: 'accountEmail', label: 'Account Email', desc: 'sender@company.com' },
  { key: 'accountName', label: 'Account Name', desc: 'Full name of sender' },
  { key: 'accountPhone', label: 'Account Phone', desc: 'Phone number if available' },
  { key: 'companyName', label: 'Company Name', desc: 'Your app name' },
  { key: 'currentDate', label: 'Current Date', desc: 'YYYY-MM-DD format' },
]

export default function SignatureEditor({ template, signature, onSave, onClose }) {
  const [name, setName] = useState(signature?.name || template?.name || '')
  const [description, setDescription] = useState(signature?.description || '')
  const [htmlContent, setHtmlContent] = useState(
    signature?.html_content || template?.html_template || '<p>Your signature here</p>'
  )
  const [showVariablePicker, setShowVariablePicker] = useState(false)
  const [showImageUrlPrompt, setShowImageUrlPrompt] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleInsertVariable = (varKey) => {
    const textarea = document.querySelector('[data-editor-textarea]')
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const before = htmlContent.substring(0, start)
      const after = htmlContent.substring(end)
      const newHtml = before + '{{' + varKey + '}}' + after
      setHtmlContent(newHtml)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + varKey.length + 4
        textarea.focus()
      }, 0)
    }
  }

  const handleInsertImage = () => {
    if (!imageUrl.trim()) {
      toast.error('Please enter image URL')
      return
    }
    const imgHtml = `<img src="${imageUrl}" style="max-width: 100%; height: auto; margin: 10px 0;" />`
    const textarea = document.querySelector('[data-editor-textarea]')
    if (textarea) {
      const start = textarea.selectionStart
      const before = htmlContent.substring(0, start)
      const after = htmlContent.substring(start)
      setHtmlContent(before + imgHtml + after)
      setShowImageUrlPrompt(false)
      setImageUrl('')
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Signature name required')
      return
    }
    if (!htmlContent.trim()) {
      toast.error('Signature content required')
      return
    }

    setIsSaving(true)
    try {
      await onSave({
        template_id: template?.id || null,
        name,
        description,
        html_content: htmlContent,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={signature ? '✏️ Edit Signature' : '✨ Create Signature'}
      size="2xl"
    >
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {/* Name & Description */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase">Signature Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Sales Team Signature"
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase">Description</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description for this signature"
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand"
          />
        </div>

        {/* Editor and Preview - Two Column Layout */}
        <div className="space-y-2">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowVariablePicker(!showVariablePicker)}
              className="btn-secondary text-xs flex items-center gap-1"
            >
              <Plus size={12} />
              Insert Variable
            </button>
            <button
              onClick={() => setShowImageUrlPrompt(true)}
              className="btn-secondary text-xs flex items-center gap-1"
            >
              <Plus size={12} />
              Insert Image
            </button>
          </div>

          {/* Variable Picker */}
          {showVariablePicker && (
            <div className="p-2 bg-surface-raised rounded border border-surface-border space-y-1">
              {AVAILABLE_VARIABLES.map(v => (
                <button
                  key={v.key}
                  onClick={() => {
                    handleInsertVariable(v.key)
                    setShowVariablePicker(false)
                  }}
                  className="w-full text-left p-2 hover:bg-surface rounded transition text-xs"
                >
                  <div className="font-medium text-white">{`{{${v.key}}}`}</div>
                  <div className="text-gray-500 text-[10px]">{v.label}</div>
                </button>
              ))}
            </div>
          )}

          {/* Image URL Prompt */}
          {showImageUrlPrompt && (
            <div className="p-3 bg-surface-raised rounded border border-surface-border space-y-2">
              <input
                type="url"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleInsertImage}
                  className="btn-primary text-xs flex-1"
                >
                  Insert
                </button>
                <button
                  onClick={() => setShowImageUrlPrompt(false)}
                  className="btn-ghost text-xs flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Two Column Layout: Editor and Preview */}
          <div className="grid grid-cols-2 gap-3 h-64">
            {/* HTML Editor */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase">HTML Code</label>
              <textarea
                data-editor-textarea
                value={htmlContent}
                onChange={e => setHtmlContent(e.target.value)}
                className="w-full h-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-brand resize-none"
                placeholder="<div><strong>Your Signature</strong><br>HTML content here</div>"
              />
            </div>

            {/* Live Preview */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase">Preview</label>
              <div className="w-full h-full bg-white rounded px-3 py-2 border border-surface-border overflow-y-auto">
                <div
                  className="text-sm"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-surface-border">
        <button onClick={onClose} className="btn-ghost text-xs">
          Cancel
        </button>
        <button onClick={handleSave} disabled={isSaving} className="btn-primary text-xs disabled:opacity-50">
          {isSaving ? 'Saving...' : 'Save Signature'}
        </button>
      </div>
    </Modal>
  )
}
