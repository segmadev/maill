import { useState } from 'react'
import { Folder } from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../../store/mailStore'
import { moveEmail } from '../../api/mail'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

export default function MailMoveModal({ open, onClose }) {
  const { openEmail, folders, removeEmailLocal } = useMailStore()
  const [moving, setMoving] = useState(false)

  if (!openEmail) return null

  const accountFolders = folders[openEmail.account_id] ?? []

  async function handleMove(folderId) {
    setMoving(true)
    try {
      await moveEmail(openEmail.id, folderId)
      removeEmailLocal(openEmail.id)
      toast.success('Email moved.')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to move email.')
    } finally {
      setMoving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Move to Folder" size="sm">
      {moving ? (
        <div className="flex justify-center py-8"><Spinner size={24} /></div>
      ) : (
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {accountFolders.map(folder => (
            <button key={folder.id} onClick={() => handleMove(folder.graph_folder_id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-left transition-colors">
              <Folder size={13} className="text-gray-500 flex-shrink-0" />
              <span className="text-sm text-gray-300">{folder.display_name}</span>
              {folder.unread_items > 0 && (
                <span className="ml-auto text-[10px] text-gray-600">{folder.unread_items} unread</span>
              )}
            </button>
          ))}
          {accountFolders.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-6">No folders available.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
