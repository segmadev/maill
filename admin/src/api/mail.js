import client from './client'

// ── OAuth ─────────────────────────────────────────────────────────────────────
export const getMicrosoftRedirectUrl = () =>
  client.get('/auth/microsoft/redirect', {
    params: { return_url: window.location.origin },
  }).then(r => r.data)

// Returns the Microsoft admin-consent URL — share with the org's IT admin so
// they can approve the app once for their entire organization.
export const getMicrosoftAdminConsentUrl = () =>
  client.get('/auth/microsoft/admin-consent-url').then(r => r.data)

// ── Device Code flow ─────────────────────────────────────────────────────────
// Step 1 — get user_code + encrypted device_code_token from the server
export const startDeviceCode = () =>
  client.post('/auth/microsoft/device-code/start').then(r => r.data)

// Step 2 — poll until status changes from 'pending'
export const pollDeviceCode = (deviceCodeToken) =>
  client.post('/auth/microsoft/device-code/poll', { device_code_token: deviceCodeToken }).then(r => r.data)

// Progressive consent: silently upgrade the stored refresh token to include
// Mail.Read when the user first needs to access their inbox.
// Returns { status: 'granted' | 'consent_required' | 'no_account' | 'error' }
export const upgradeMailAccess = () =>
  client.post('/user/upgrade-mail-access').then(r => r.data)

// ── My Accounts (current logged-in user) ─────────────────────────────────────
export const getMyAccounts      = ()   => client.get('/accounts').then(r => r.data)
export const deleteMyAccount    = (id) => client.delete(`/accounts/${id}`).then(r => r.data)
// Attempt a server-side token refresh using the stored refresh_token.
// Returns { token_expires_at, token_status } on success.
// Returns { error:'refresh_failed', needs_reconnect:true } on failure.
export const refreshAccountToken = (id) => client.post(`/accounts/${id}/refresh`).then(r => r.data)

// ── Folders ───────────────────────────────────────────────────────────────────
export const getFolders = (accountId, refresh = false) =>
  client.get(`/accounts/${accountId}/folders${refresh ? '?refresh=1' : ''}`).then(r => r.data)

// ── Emails ────────────────────────────────────────────────────────────────────
export const getEmails = (accountId, folderId, page = 1, perPage = 50) =>
  client.get(`/accounts/${accountId}/emails`, {
    params: { folder_id: folderId, page, per_page: perPage },
  }).then(r => r.data)

export const getEmail       = (id)                            => client.get(`/emails/${id}`).then(r => r.data)
export const markRead       = (id, isRead = true)             => client.patch(`/emails/${id}/read`, { is_read: isRead }).then(r => r.data)
export const flagEmail      = (id, flagged = true)            => client.patch(`/emails/${id}/flag`, { flagged }).then(r => r.data)
export const moveEmail      = (id, destinationId)             => client.post(`/emails/${id}/move`, { destination_id: destinationId }).then(r => r.data)
export const deleteEmail    = (id)                            => client.delete(`/emails/${id}`).then(r => r.data)
export const sendEmail      = (payload)                       => client.post('/emails/send', payload).then(r => r.data)
export const replyEmail     = (id, comment, replyAll = false) => client.post(`/emails/${id}/reply`, { comment, reply_all: replyAll }).then(r => r.data)
export const forwardEmail   = (id, comment, to)               => client.post(`/emails/${id}/forward`, { comment, to }).then(r => r.data)
export const getAttachments = (id)                            => client.get(`/emails/${id}/attachments`).then(r => r.data)

// ── Search ────────────────────────────────────────────────────────────────────
export const searchEmails = (q) => client.get('/search', { params: { q } }).then(r => r.data)

// ── Drafts ────────────────────────────────────────────────────────────────────
export const getDrafts   = ()         => client.get('/drafts').then(r => r.data)
export const createDraft = (data)     => client.post('/drafts', data).then(r => r.data)
export const updateDraft = (id, data) => client.patch(`/drafts/${id}`, data).then(r => r.data)
export const deleteDraft = (id)       => client.delete(`/drafts/${id}`).then(r => r.data)

// ── Keywords ──────────────────────────────────────────────────────────────────
export const getKeywords       = ()                              => client.get('/keywords').then(r => r.data)
export const addKeyword        = (keyword, color = 'blue')       => client.post('/keywords', { keyword, color }).then(r => r.data)
export const updateKeyword     = (id, keyword, color)            => client.patch(`/keywords/${id}`, { keyword, color }).then(r => r.data)
export const deleteKeyword     = (id)                            => client.delete(`/keywords/${id}`).then(r => r.data)
export const getKeywordMatches = ()                              => client.get('/keywords/matches').then(r => r.data)

// ── Bulk Mail ─────────────────────────────────────────────────────────────────
export const parseBulkImport = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/bulk/parse', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const bulkSendEmail = (payload) => client.post('/admin/bulk/send', payload).then(r => r.data)
