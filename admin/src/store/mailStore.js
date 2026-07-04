import { create } from 'zustand'

const useMailStore = create((set, get) => ({
  // ── Accounts & folders ─────────────────────────────────────────────────────
  accounts:        [],
  folders:         {},        // { [accountId]: [...folders] }
  activeFolderKey: null,      // "accountId:graphFolderId"

  // ── Email list ─────────────────────────────────────────────────────────────
  emails:          [],
  emailsTotal:     0,
  emailsPage:      1,
  loadingEmails:   false,

  // ── Open email ─────────────────────────────────────────────────────────────
  openEmail:       null,
  loadingEmail:    false,

  // ── Compose  (mode: 'new'|'reply'|'replyAll'|'forward'|'draft') ───────────
  compose:         null,

  // ── Search ─────────────────────────────────────────────────────────────────
  searchQuery:     '',
  searchResults:   null,

  // ── Local drafts ───────────────────────────────────────────────────────────
  drafts:          [],

  // ── Smart-label keywords ───────────────────────────────────────────────────
  keywords:        [],
  activeKeyword:   null,      // keyword string when in keyword-filter view
  keywordEmails:   [],
  activeView:      'folder',  // 'folder' | 'keyword'

  // ── Setters ────────────────────────────────────────────────────────────────
  setAccounts:        (accounts)         => set({ accounts }),
  setFolders:         (accountId, list)  => set(s => ({ folders: { ...s.folders, [accountId]: list } })),
  setActiveFolderKey: (key)              => set({
    activeFolderKey: key,
    emails: [], emailsTotal: 0, emailsPage: 1,
    openEmail: null,
    activeView: 'folder', activeKeyword: null,
  }),
  setEmails:          (emails, total)    => set({ emails, emailsTotal: total }),
  appendEmails:       (more, total)      => set(s => ({ emails: [...s.emails, ...more], emailsTotal: total })),
  setEmailsPage:      (page)             => set({ emailsPage: page }),
  setLoadingEmails:   (v)                => set({ loadingEmails: v }),
  setOpenEmail:       (email)            => set({ openEmail: email }),
  setLoadingEmail:    (v)                => set({ loadingEmail: v }),
  setCompose:         (compose)          => set({ compose }),
  setSearchQuery:     (q)                => set({ searchQuery: q }),
  setSearchResults:   (r)                => set({ searchResults: r }),

  // Drafts
  setDrafts:          (drafts)           => set({ drafts }),
  addOrUpdateDraft:   (draft)            => set(s => {
    const exists = s.drafts.find(d => d.id === draft.id)
    if (exists) return { drafts: s.drafts.map(d => d.id === draft.id ? draft : d) }
    return { drafts: [draft, ...s.drafts] }
  }),
  removeDraft:        (id)               => set(s => ({ drafts: s.drafts.filter(d => d.id !== id) })),

  // Keywords
  setKeywords:        (keywords)         => set({ keywords }),
  setKeywordEmails:   (emails)           => set({ keywordEmails: emails }),
  setActiveKeyword:   (keyword)          => set({
    activeKeyword: keyword,
    activeView: 'keyword',
    openEmail: null,
  }),

  // ── Local-mutation helpers ─────────────────────────────────────────────────
  markReadLocal: (id, isRead) => set(s => ({
    emails:        s.emails.map(e        => e.id === id ? { ...e, is_read: isRead } : e),
    keywordEmails: s.keywordEmails.map(e => e.id === id ? { ...e, is_read: isRead } : e),
    openEmail:     s.openEmail?.id === id ? { ...s.openEmail, is_read: isRead } : s.openEmail,
  })),

  removeEmailLocal: (id) => set(s => ({
    emails:        s.emails.filter(e        => e.id !== id),
    keywordEmails: s.keywordEmails.filter(e => e.id !== id),
    openEmail:     s.openEmail?.id === id ? null : s.openEmail,
  })),

  toggleFlagLocal: (id, flagged) => set(s => ({
    emails:        s.emails.map(e        => e.id === id ? { ...e, flagged } : e),
    keywordEmails: s.keywordEmails.map(e => e.id === id ? { ...e, flagged } : e),
    openEmail:     s.openEmail?.id === id ? { ...s.openEmail, flagged } : s.openEmail,
  })),

  // ── Derived helpers ────────────────────────────────────────────────────────
  getActiveFolder: () => {
    const key = get().activeFolderKey
    if (!key) return null
    const [accountId, folderId] = key.split(':')
    return { accountId: parseInt(accountId), folderId }
  },
}))

export default useMailStore
