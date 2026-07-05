/**
 * bulkSendStore
 *
 * Owns the entire lifecycle of a bulk-send job so the job survives
 * the modal being closed.
 *
 * Recipients shape: Array<{ email: string, data: Record<string, any> }>
 * Subject / body are stored as templates (may contain {{key}} tokens).
 * Templates are resolved per-recipient at send time before calling the API.
 */
import { create } from 'zustand'
import { bulkSendEmail } from '../api/mail'
import { updateCampaignBatch, updateRecipientTracking } from '../api/admin'
import { resolveTemplate } from '../utils/templateUtils'

// Cancellable sleep: checks the stop signal every 500 ms.
async function sleep(ms, shouldStop) {
  const TICK = 500
  let rem = ms
  while (rem > 0) {
    if (shouldStop()) return
    await new Promise(r => setTimeout(r, Math.min(TICK, rem)))
    rem -= TICK
  }
}

const useBulkSendStore = create((set, get) => ({
  // ── job config ─────────────────────────────────────────────────────────────
  accountId:        null,
  subjectTemplate:  '',
  bodyTemplate:     '',
  recipients:       [],          // Array<{ email, data }>
  base64Fields:     [],          // field names whose stored values are base64-encoded
  batchSize:        10,
  batchDelay:       2000,

  // ── progress ───────────────────────────────────────────────────────────────
  status:          'idle',       // 'idle'|'running'|'paused'|'cancelled'|'done'
  sent:            0,
  failed:          [],           // Array<{ email, reason }>
  processedCount:  0,
  currentBatch:    0,
  totalBatches:    0,
  totalRecipients: 0,

  // ── batch history ──────────────────────────────────────────────────────────
  batchHistory:    [],

  // ── timing ─────────────────────────────────────────────────────────────────
  nextBatchAt:     null,
  batchDurations:  [],

  // ── control flags ──────────────────────────────────────────────────────────
  pauseSignal:  false,
  cancelSignal: false,

  // ── modal open request ─────────────────────────────────────────────────────
  requestOpen: false,

  // ─────────────────────────────────────────────────────────────────────────
  pause:            () => set({ pauseSignal: true,  status: 'paused'  }),
  resume:           () => set({ pauseSignal: false, status: 'running' }),
  cancel:           () => set({ cancelSignal: true, pauseSignal: false }),
  openModal:        () => set({ requestOpen: true  }),
  clearRequestOpen: () => set({ requestOpen: false }),
  setLiveBatchSize: (n)  => set({ batchSize:  n  }),
  setLiveDelay:     (ms) => set({ batchDelay: ms }),

  reset: () => set({
    status: 'idle', sent: 0, failed: [], processedCount: 0,
    currentBatch: 0, totalBatches: 0, totalRecipients: 0,
    batchHistory: [], nextBatchAt: null, batchDurations: [],
    pauseSignal: false, cancelSignal: false, requestOpen: false,
  }),

  // ── retry helpers ───────────────────────────────────────────────────────────
  retryAllFailed: () => {
    const { accountId, subjectTemplate, bodyTemplate, failed, batchSize, batchDelay, base64Fields } = get()
    if (!failed.length) return
    const originalRecs = get().recipients
    const retryRecs = failed.map(f => {
      const orig = originalRecs.find(r => r.email === f.email)
      return orig ?? { email: f.email, data: {} }
    })
    get().startSending({ accountId, subjectTemplate, bodyTemplate, recipients: retryRecs, batchSize, batchDelay, base64Fields })
  },

  retryAddresses: (emails) => {
    const { accountId, subjectTemplate, bodyTemplate, batchSize, batchDelay, base64Fields } = get()
    const originalRecs = get().recipients
    const retryRecs = emails.map(email => {
      const orig = originalRecs.find(r => r.email === email)
      return orig ?? { email, data: {} }
    })
    get().startSending({ accountId, subjectTemplate, bodyTemplate, recipients: retryRecs, batchSize, batchDelay, base64Fields })
  },

  // ── main entry point ────────────────────────────────────────────────────────
  startSending: (config) => {
    const {
      accountId,
      subjectTemplate,
      bodyTemplate,
      recipients,
      batchSize,
      batchDelay,
      base64Fields = [],
      campaignId,
      signatureId,
      includeSignature = true,
      markAsImportant = false,
      campaignSettings = {},
    } = config

    set({
      accountId, subjectTemplate, bodyTemplate, recipients, batchSize, batchDelay, base64Fields,
      status:          'running',
      sent:            0,
      failed:          [],
      processedCount:  0,
      currentBatch:    0,
      totalBatches:    Math.ceil(recipients.length / batchSize),
      totalRecipients: recipients.length,
      batchHistory:    [],
      nextBatchAt:     null,
      batchDurations:  [],
      pauseSignal:     false,
      cancelSignal:    false,
    })

    ;(async () => {
      const recs         = recipients
      let sent           = 0
      let failed         = []
      let processedCount = 0
      let batchNum       = 0

      while (processedCount < recs.length) {
        if (get().cancelSignal) break

        while (get().pauseSignal && !get().cancelSignal) {
          await new Promise(r => setTimeout(r, 200))
        }
        if (get().cancelSignal) break

        const bs    = get().batchSize
        const batch = recs.slice(processedCount, processedCount + bs)
        batchNum++

        const totalBatchesNow = (batchNum - 1) + Math.ceil((recs.length - processedCount) / bs)
        set({ currentBatch: batchNum, totalBatches: totalBatchesNow })

        const batchStart  = Date.now()
        const batchSentAt = new Date().toISOString()
        let   batchSent   = 0
        let   batchFailed = []

        // Resolve templates per recipient (fuzzy engine + auto base64 decoding)
        const b64Set = new Set(base64Fields)
        const resolvedBatch = batch.map(r => ({
          email:   r.email,
          subject: resolveTemplate(subjectTemplate, r.data, b64Set),
          body:    resolveTemplate(bodyTemplate,    r.data, b64Set),
        }))

        try {
          const res = await bulkSendEmail({
            account_id: accountId,
            recipients: resolvedBatch,
            signature_id: signatureId,
            include_signature: includeSignature,
            markAsImportant: markAsImportant,
            emailsPerHour: campaignSettings.emailsPerHour,
            dailyLimit: campaignSettings.dailyLimit,
            ipRotation: campaignSettings.ipRotation,
            enableIpWarmup: campaignSettings.enableIpWarmup,
          })
          batchSent   = res.sent ?? batch.length
          batchFailed = res.failed ?? []
          sent   += batchSent
          failed  = [...failed, ...batchFailed]
        } catch (err) {
          const errorCode = err.response?.data?.error
          const errorMsg = err.response?.data?.message ?? err.message ?? 'Send error'

          // Check if it's an account suspension issue
          if (errorCode === 'graph_forbidden' && errorMsg?.includes('suspended')) {
            console.error(`Account ${accountId} is suspended. User needs to verify their Microsoft account.`)
            // Stop sending for this account
            set({ cancelSignal: true })
            break
          }

          batchFailed = batch.map(r => ({
            email:  r.email,
            reason: errorCode === 'graph_forbidden' ? 'Account suspended - verify with Microsoft' : errorMsg,
          }))
          failed = [...failed, ...batchFailed]
        }

        const batchDuration = Date.now() - batchStart
        processedCount += batch.length

        const historyEntry = {
          batchNum,
          sentAt:     batchSentAt,
          durationMs: batchDuration,
          recipients: batch.map(r => r.email),
          sent:       batchSent,
          failed:     batchFailed,
        }

        const newDurations = [...get().batchDurations.slice(-9), batchDuration]
        set({
          sent, failed, processedCount,
          batchDurations: newDurations,
          batchHistory:   [...get().batchHistory, historyEntry],
        })

        // Update campaign progress in database (fire-and-forget to not block sending)
        if (campaignId) {
          updateCampaignBatch(campaignId, {
            batch_num: batchNum,
            sent: batchSent,
            failed: batchFailed,
            duration_ms: batchDuration,
          }).catch(err => {
            console.error('Failed to update campaign batch in database:', err)
            // Don't throw - let sending continue
          })

          // Also update recipient tracking status
          const updates = batch.map(r => ({
            email: r.email,
            status: batchFailed.some(f => f.email === r.email) ? 'failed' : 'sent',
            reason: batchFailed.find(f => f.email === r.email)?.reason || null,
          }))

          updateRecipientTracking(campaignId, { updates }).catch(err => {
            console.error('Failed to update recipient tracking:', err)
            // Don't throw - let sending continue
          })
        }

        if (processedCount < recs.length) {
          const delay = get().batchDelay
          if (delay > 0) {
            set({ nextBatchAt: Date.now() + delay })
            await sleep(delay, () => get().cancelSignal || get().pauseSignal)
            set({ nextBatchAt: null })
          }
        }
      }

      set({ status: get().cancelSignal ? 'cancelled' : 'done', nextBatchAt: null })
    })()
  },
}))

export default useBulkSendStore
