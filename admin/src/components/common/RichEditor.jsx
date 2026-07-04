import { useRef, useEffect } from 'react'
import Quill from 'quill'

export default function RichEditor({
  value,
  onChange,
  placeholder = 'Write your message…',
  quillInstanceRef,
  toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['blockquote', 'code-block'],
    ['link'],
    ['clean'],
  ],
  minHeight = '200px',
}) {
  const containerRef = useRef(null)
  const quillRef = useRef(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    // Only initialize once
    if (initializedRef.current || !containerRef.current) return

    // Remove any existing Quill instance
    const existing = containerRef.current.querySelector('.ql-editor')
    if (existing) return

    try {
      quillRef.current = new Quill(containerRef.current, {
        theme: 'snow',
        placeholder,
        modules: {
          toolbar,
        },
      })

      // Set initial content
      if (value) {
        const delta = quillRef.current.clipboard.convert({ html: value })
        quillRef.current.setContents(delta)
      }

      // Handle text changes
      const handleChange = () => {
        if (quillRef.current) {
          onChange(quillRef.current.root.innerHTML)
        }
      }

      quillRef.current.on('text-change', handleChange)
      initializedRef.current = true

      // Expose quill instance to parent
      if (quillInstanceRef) {
        quillInstanceRef.current = quillRef.current
      }
    } catch (err) {
      console.error('Quill initialization error:', err)
    }

    return () => {
      if (quillRef.current) {
        quillRef.current.off('text-change')
      }
    }
  }, []) // Initialize only once

  return (
    <div
      ref={containerRef}
      className="quill-editor-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight,
      }}
    />
  )
}
