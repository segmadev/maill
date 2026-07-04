/**
 * Signature Editor
 *
 * Rich HTML editor for creating/editing signatures
 * - Quill rich text editor (same as compose area)
 * - Variable picker ({{accountEmail}}, etc)
 * - Image URL support
 * - Live preview
 */
import { useState, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import RichEditor from '../common/RichEditor'

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
  const quillRef = useRef(null)

  const handleInsertVariable = (varKey) => {
    if (quillRef.current) {
      const range = quillRef.current.getSelection()
      const index = range ? range.index : quillRef.current.getLength()
      quillRef.current.insertText(index, '{{' + varKey + '}}')
      quillRef.current.setSelection(index + varKey.length + 4)
      quillRef.current.focus()
    }
  }

  const handleInsertImage = () => {
    if (!imageUrl.trim()) {
      toast.error('Please enter image URL')
      return
    }

    if (quillRef.current) {
      const range = quillRef.current.getSelection()
      const index = range ? range.index : quillRef.current.getLength()
      quillRef.current.insertEmbed(index, 'image', imageUrl)
      quillRef.current.setSelection(index + 1)
      quillRef.current.focus()
    }

    setShowImageUrlPrompt(false)
    setImageUrl('')
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Signature name required')
      return
    }
    if (!htmlContent.trim() || htmlContent === '<p><br></p>') {
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
      open={true}
      onClose={onClose}
      title={signature ? '✏️ Edit Signature' : '✨ Create Signature'}
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Name & Description */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase">Signature Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Professional Signature"
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this signature is for..."
            rows={2}
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand resize-none"
          />
        </div>

        {/* Rich Text Editor */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase">Signature Content</label>
          <div className="border border-surface-border rounded overflow-hidden bg-surface">
            <RichEditor
              value={htmlContent}
              onChange={setHtmlContent}
              placeholder="Your signature content..."
              quillInstanceRef={quillRef}
              minHeight="250px"
            />
          </div>
        </div>

        {/* Variable & Image Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowVariablePicker(!showVariablePicker)}
            className="text-xs px-3 py-2 bg-brand/20 text-brand rounded hover:bg-brand/30 transition flex items-center gap-1"
          >
            <Plus size={12} />
            Insert Variable
          </button>
          <button
            onClick={() => setShowImageUrlPrompt(!showImageUrlPrompt)}
            className="text-xs px-3 py-2 bg-brand/20 text-brand rounded hover:bg-brand/30 transition flex items-center gap-1"
          >
            <Plus size={12} />
            Insert Image
          </button>
        </div>

        {/* Variable Picker */}
        {showVariablePicker && (
          <div className="p-3 border border-surface-border rounded bg-surface-raised space-y-2">
            <p className="text-xs font-semibold text-gray-400">Available Variables</p>
            <div className="space-y-2">
              {AVAILABLE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => {
                    handleInsertVariable(v.key)
                    setShowVariablePicker(false)
                  }}
                  className="w-full text-left p-2 rounded bg-surface hover:bg-surface-border transition text-[10px]"
                >
                  <div className="font-medium text-gray-300">{`{{${v.key}}}`} – {v.label}</div>
                  <div className="text-gray-600">{v.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Image URL Prompt */}
        {showImageUrlPrompt && (
          <div className="p-3 border border-surface-border rounded bg-surface-raised space-y-2">
            <p className="text-xs font-semibold text-gray-400">Insert Image</p>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.png"
              className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInsertImage()
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleInsertImage}
                className="flex-1 text-xs px-2 py-1 bg-brand text-white rounded hover:bg-brand/80 transition"
              >
                Insert
              </button>
              <button
                onClick={() => {
                  setShowImageUrlPrompt(false)
                  setImageUrl('')
                }}
                className="flex-1 text-xs px-2 py-1 bg-surface border border-surface-border rounded hover:bg-surface-raised transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Live Preview */}
        <div className="space-y-2 border-t border-surface-border pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Preview</p>
          <div
            className="p-3 rounded bg-white border border-surface-border min-h-[80px] text-sm text-gray-800"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end border-t border-surface-border pt-3">
          <button
            onClick={onClose}
            className="btn-ghost text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary text-xs"
          >
            {isSaving ? 'Saving...' : 'Save Signature'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
