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
  Users,
} from 'lucide-react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import '../../components/mail/MailCompose.css'
import { tryDecodeBase64, resolveTemplate } from '../../utils/templateUtils'

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
}) {
  const [showVars, setShowVars] = useState(true)
  const quillRef = useRef(null)
  const quillContainerRef = useRef(null)
  const subjectRef = useRef(null)

  const b64Set = new Set(base64Fields ?? [])
  const vars = recipients.length > 0
    ? Object.keys(recipients[0].data).filter(k => k.toLowerCase() !== 'email')
    : []

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

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-surface-border">
        <button onClick={onBack} className="btn-ghost text-xs">← Accounts</button>
        <button onClick={handleNext} className="btn-primary text-xs">Settings →</button>
      </div>
    </div>
  )
}
