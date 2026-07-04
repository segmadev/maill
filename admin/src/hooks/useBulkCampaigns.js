import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import * as adminApi from '../api/admin'

export function useBulkCampaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [perPage, setPerPage] = useState(20)
  const [status, setStatus] = useState(null)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.listBulkCampaigns({
        page,
        per_page: perPage,
        status,
      })
      setCampaigns(data.campaigns || [])
      setTotal(data.total || 0)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch campaigns')
    } finally {
      setLoading(false)
    }
  }, [page, perPage, status])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  const createCampaign = useCallback(async (data) => {
    try {
      const result = await adminApi.createBulkCampaign(data)
      // Reset to first page to show new campaign
      setPage(1)
      // Small delay to ensure backend has processed
      await new Promise(resolve => setTimeout(resolve, 300))
      // Fetch fresh campaigns list
      const freshData = await adminApi.listBulkCampaigns({
        page: 1,
        per_page: perPage,
        status,
      })
      setCampaigns(freshData.campaigns || [])
      setTotal(freshData.total || 0)
      return result.campaign
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to create campaign'
      toast.error(message)
      throw err
    }
  }, [perPage, status])

  const updateCampaign = useCallback(async (id, action) => {
    try {
      const result = await adminApi.updateBulkCampaign(id, { action })
      toast.success(`Campaign ${action}ed successfully`)
      await fetchCampaigns()
      return result.campaign
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} campaign`)
      throw err
    }
  }, [fetchCampaigns])

  const deleteCampaign = useCallback(async (id) => {
    try {
      await adminApi.deleteBulkCampaign(id)
      toast.success('Campaign deleted')
      await fetchCampaigns()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete campaign')
      throw err
    }
  }, [fetchCampaigns])

  return {
    campaigns,
    loading,
    page,
    setPage,
    total,
    perPage,
    setPerPage,
    status,
    setStatus,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    refetch: fetchCampaigns,
  }
}

export function useBulkCampaignDetail(campaignId) {
  const [campaign, setCampaign] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchCampaign = useCallback(async () => {
    if (!campaignId) return

    setLoading(true)
    try {
      const data = await adminApi.getBulkCampaign(campaignId)
      setCampaign(data.campaign)
      setStats(data.stats)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch campaign')
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  // Auto-refresh stats when campaign is running
  useEffect(() => {
    if (!campaignId || !autoRefresh || campaign?.status !== 'running') return

    // Initial fetch
    fetchCampaign()

    // Set up polling
    const interval = setInterval(() => {
      fetchCampaign()
    }, 3000) // Refresh every 3 seconds

    return () => clearInterval(interval)
  }, [campaignId, autoRefresh, campaign?.status, fetchCampaign])

  const getStats = useCallback(async () => {
    try {
      const data = await adminApi.getCampaignStats(campaignId)
      setStats(data.stats)
      return data.stats
    } catch (err) {
      toast.error('Failed to fetch stats')
      throw err
    }
  }, [campaignId])

  return {
    campaign,
    stats,
    loading,
    autoRefresh,
    setAutoRefresh,
    refetch: fetchCampaign,
    getStats,
  }
}

export function useCampaignQueue(campaignId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState(null)

  const fetchQueue = useCallback(async () => {
    if (!campaignId) return

    setLoading(true)
    try {
      const data = await adminApi.listCampaignQueue(campaignId, {
        page,
        per_page: 20,
        status,
      })
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch queue')
    } finally {
      setLoading(false)
    }
  }, [campaignId, page, status])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  return {
    items,
    loading,
    page,
    setPage,
    total,
    status,
    setStatus,
    refetch: fetchQueue,
  }
}
