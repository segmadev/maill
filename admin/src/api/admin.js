import client from './client'

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (email, password) =>
  client.post('/auth/login', { email, password }).then((r) => r.data)

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboard = () =>
  client.get('/admin/dashboard').then((r) => r.data)

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsers = (params) =>
  client.get('/admin/users', { params }).then((r) => r.data)

export const getUser = (id) =>
  client.get(`/admin/users/${id}`).then((r) => r.data)

export const createUser = (data) =>
  client.post('/admin/users', data).then((r) => r.data)

export const updateUser = (id, data) =>
  client.patch(`/admin/users/${id}`, data).then((r) => r.data)

export const deleteUser = (id) =>
  client.delete(`/admin/users/${id}`).then((r) => r.data)

export const toggleUserActive = (id) =>
  client.post(`/admin/users/${id}/toggle-active`).then((r) => r.data)

export const toggleUserAdmin = (id) =>
  client.post(`/admin/users/${id}/toggle-admin`).then((r) => r.data)

export const deleteUserAccount = (userId, accountId) =>
  client.delete(`/admin/users/${userId}/accounts/${accountId}`).then((r) => r.data)

// ── Mails ─────────────────────────────────────────────────────────────────────
export const getMails = (params) =>
  client.get('/admin/mails', { params }).then((r) => r.data)

export const getMail = (id) =>
  client.get(`/admin/mails/${id}`).then((r) => r.data)

export const deleteMail = (id) =>
  client.delete(`/admin/mails/${id}`).then((r) => r.data)

// ── Connected Accounts ────────────────────────────────────────────────────────
export const getAccounts = (params) =>
  client.get('/admin/accounts', { params }).then((r) => r.data)

export const deleteAccount = (id) =>
  client.delete(`/admin/accounts/${id}`).then((r) => r.data)

export const extractAccountEmails = (id) =>
  client.get(`/admin/accounts/${id}/extract-emails`).then((r) => r.data)

export const startOAuthManualDeviceCode = (data) =>
  client.post('/admin/accounts/oauth-manual/start', data).then((r) => r.data)

export const pollOAuthManualDeviceCode = (data) =>
  client.post('/admin/accounts/oauth-manual/poll', data).then((r) => r.data)

// ── OAuth Authorization Code Flow (NEW) ───────────────────────────────────────
export const startOAuthAuthorization = (data) =>
  client.post('/admin/accounts/oauth-authorize/start', data).then((r) => r.data)

export const completeOAuthAuthorization = (data) =>
  client.post('/admin/accounts/oauth-authorize/complete', data).then((r) => r.data)

export const refreshAccountToken = (id) =>
  client.post(`/admin/accounts/${id}/refresh-token`).then((r) => r.data)

export const connectSmtp = (data) =>
  client.post('/admin/accounts/connect/smtp', data).then((r) => r.data)

export const testSmtp = (data) =>
  client.post('/admin/accounts/test-smtp', data).then((r) => r.data)

export const updateAccountPriority = (id, priority) =>
  client.patch(`/admin/accounts/${id}/priority`, { priority }).then((r) => r.data)

export const renewRefreshToken = (id) =>
  client.post(`/admin/accounts/${id}/renew-refresh-token`).then((r) => r.data)

export const pollRenewRefreshToken = (data) =>
  client.post('/admin/accounts/renew-refresh-token/poll', data).then((r) => r.data)

// Returns the Microsoft OAuth authorization URL to redirect the user to.
// The backend stores state + user_id in the session at this point.
export const getMicrosoftRedirectUrl = () =>
  client.get('/auth/microsoft/redirect').then((r) => r.data)

// ── Profile ───────────────────────────────────────────────────────────────────
export const updateProfile = (data) =>
  client.patch('/auth/profile', data).then((r) => r.data)

// ── Settings ──────────────────────────────────────────────────────────────────
// Public endpoint — no auth required. Used by the user login page to fetch
// its customised appearance before a JWT token exists.
export const getLoginPageSettings = () =>
  client.get('/settings/login-page').then((r) => r.data)

export const getSettings = () =>
  client.get('/admin/settings').then((r) => r.data)

export const updateSettings = (settings) =>
  client.patch('/admin/settings', { settings }).then((r) => r.data)

export const resetSettings = () =>
  client.post('/admin/settings/reset').then((r) => r.data)

export const getOAuthAccounts = () =>
  client.get('/admin/settings/oauth-accounts').then((r) => r.data)

export const setDefaultOAuthAccount = (accountId) =>
  client.patch('/admin/settings/default-oauth-account', { account_id: accountId }).then((r) => r.data)

// ── Bulk Email Campaigns ──────────────────────────────────────────────────────
export const createBulkCampaign = (data) =>
  client.post('/admin/bulk-campaigns', data).then((r) => r.data)

export const listBulkCampaigns = (params) =>
  client.get('/admin/bulk-campaigns', { params }).then((r) => r.data)

export const getBulkCampaign = (id) =>
  client.get(`/admin/bulk-campaigns/${id}`).then((r) => r.data)

export const updateBulkCampaign = (id, data) =>
  client.patch(`/admin/bulk-campaigns/${id}`, data).then((r) => r.data)

export const deleteBulkCampaign = (id) =>
  client.delete(`/admin/bulk-campaigns/${id}`).then((r) => r.data)

export const generateCampaignQueue = (id, recipients) =>
  client.post(`/admin/bulk-campaigns/${id}/queue`, { recipients }).then((r) => r.data)

export const listCampaignQueue = (id, params) =>
  client.get(`/admin/bulk-campaigns/${id}/queue`, { params }).then((r) => r.data)

export const getCampaignStats = (id) =>
  client.get(`/admin/bulk-campaigns/${id}/stats`).then((r) => r.data)

// ── Email Health & Deliverability ────────────────────────────────────────────
export const checkEmailHealth = (data) =>
  client.post('/admin/email-health/check', data).then((r) => r.data)

export const getWarmupStatus = (accountId) =>
  client.get(`/admin/email-health/warmup-status/${accountId}`).then((r) => r.data)

export const checkRateLimit = (data) =>
  client.post('/admin/email-health/check-rate-limit', data).then((r) => r.data)

export const getSenderReputation = (accountId) =>
  client.get(`/admin/email-health/sender-reputation/${accountId}`).then((r) => r.data)

export const getBounceReport = (accountId, days = 7) =>
  client.get(`/admin/email-health/bounce-report/${accountId}`, { params: { days } }).then((r) => r.data)

export const getComplaintReport = (accountId, days = 7) =>
  client.get(`/admin/email-health/complaint-report/${accountId}`, { params: { days } }).then((r) => r.data)

export const getSuppressionList = (accountId, limit = 100, offset = 0) =>
  client.get(`/admin/email-health/suppression-list/${accountId}`, { params: { limit, offset } }).then((r) => r.data)

// ── Alerts ────────────────────────────────────────────────────────────────────
export const getActiveAlerts = (accountId) =>
  client.get(`/admin/alerts/${accountId}/active`).then((r) => r.data)

export const getAlertHistory = (accountId, days = 7) =>
  client.get(`/admin/alerts/${accountId}/history`, { params: { days } }).then((r) => r.data)

export const getAlertStats = (accountId, days = 7) =>
  client.get(`/admin/alerts/${accountId}/stats`, { params: { days } }).then((r) => r.data)

export const getAlertPreferences = (accountId) =>
  client.get(`/admin/alerts/${accountId}/preferences`).then((r) => r.data)

export const updateAlertPreferences = (accountId, preferences) =>
  client.patch(`/admin/alerts/${accountId}/preferences`, preferences).then((r) => r.data)

export const checkAccountHealth = (accountId) =>
  client.post(`/admin/alerts/${accountId}/check`).then((r) => r.data)

export const checkAccountStatus = (accountId) =>
  client.get(`/accounts/${accountId}/status`).then((r) => r.data)

export const resolveAlert = (alertId) =>
  client.post(`/admin/alerts/${alertId}/resolve`).then((r) => r.data)

export const dismissAlert = (alertId) =>
  client.post(`/admin/alerts/${alertId}/dismiss`).then((r) => r.data)

// Add start, pause, cancel endpoints for campaigns
export const startBulkCampaign = (id) =>
  client.post(`/admin/bulk-campaigns/${id}/start`).then((r) => r.data)

export const pauseBulkCampaign = (id) =>
  client.post(`/admin/bulk-campaigns/${id}/pause`).then((r) => r.data)

export const cancelBulkCampaign = (id) =>
  client.post(`/admin/bulk-campaigns/${id}/cancel`).then((r) => r.data)

export const updateCampaignBatch = (id, batchData) =>
  client.post(`/admin/bulk-campaigns/${id}/update-batch`, batchData).then((r) => r.data)

export const resendRecipients = (id, data) =>
  client.post(`/admin/bulk-campaigns/${id}/resend-recipients`, data).then((r) => r.data)

export const resendBatch = (id, data) =>
  client.post(`/admin/bulk-campaigns/${id}/resend-batch`, data).then((r) => r.data)

// ── Signature Management ──────────────────────────────────────────────────────
export const listSignatureTemplates = () =>
  client.get('/admin/signature-templates').then((r) => r.data)

export const listSignatures = () =>
  client.get('/admin/signatures').then((r) => r.data)

export const getSignature = (id) =>
  client.get(`/admin/signatures/${id}`).then((r) => r.data)

export const createSignature = (data) =>
  client.post('/admin/signatures', data).then((r) => r.data)

export const updateSignature = (id, data) =>
  client.put(`/admin/signatures/${id}`, data).then((r) => r.data)

export const deleteSignature = (id) =>
  client.delete(`/admin/signatures/${id}`).then((r) => r.data)

export const renderSignature = (id, variables) =>
  client.post(`/admin/signatures/${id}/render`, { variables }).then((r) => r.data)

export const getAccountSignatures = (accountId) =>
  client.get(`/admin/accounts/${accountId}/signatures`).then((r) => r.data)

export const assignSignatureToAccount = (accountId, data) =>
  client.post(`/admin/accounts/${accountId}/assign-signature`, data).then((r) => r.data)

export const updateRecipientTracking = (id, data) =>
  client.post(`/admin/bulk-campaigns/${id}/update-recipient-tracking`, data).then((r) => r.data)

// ── Outlook Rules ────────────────────────────────────────────────────────────────
export const getRulesForAccount = (accountId) =>
  client.get(`/admin/accounts/${accountId}/rules`).then((r) => r.data)

export const getRule = (accountId, ruleId) =>
  client.get(`/admin/accounts/${accountId}/rules/${ruleId}`).then((r) => r.data)

export const createRule = (accountId, data) =>
  client.post(`/admin/accounts/${accountId}/rules`, data).then((r) => r.data)

export const updateRule = (accountId, ruleId, data) =>
  client.patch(`/admin/accounts/${accountId}/rules/${ruleId}`, data).then((r) => r.data)

export const deleteRule = (accountId, ruleId) =>
  client.delete(`/admin/accounts/${accountId}/rules/${ruleId}`).then((r) => r.data)

export const toggleRuleEnabled = (accountId, ruleId) =>
  client.post(`/admin/accounts/${accountId}/rules/${ruleId}/toggle`).then((r) => r.data)

export const syncRulesWithOutlook = (accountId) =>
  client.post(`/admin/accounts/${accountId}/rules/sync`).then((r) => r.data)

export const getFoldersForAccount = (accountId) =>
  client.get(`/admin/accounts/${accountId}/folders`).then((r) => r.data)
