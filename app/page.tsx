'use client'

import { useState, useEffect } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { getSchedule, pauseSchedule, resumeSchedule, getScheduleLogs, cronToHuman, Schedule, ExecutionLog } from '@/lib/scheduler'
import { FiSettings, FiRefreshCw, FiPlay, FiPause, FiChevronDown, FiChevronUp, FiClock, FiCalendar, FiCheck, FiX, FiAlertCircle } from 'react-icons/fi'

// TypeScript interfaces based on agent response schema
interface Story {
  headline: string
  summary: string
  source: string
}

interface Category {
  category_name: string
  stories: Story[]
}

interface DigestData {
  digest_date: string
  categories: Category[]
  total_stories: number
  slack_posted: boolean
}

interface DigestHistory {
  id: string
  date: string
  data: DigestData
  timestamp: number
}

const AGENT_ID = '698e0e01d53462d0905232e3'
const SCHEDULE_ID = '698e0e07ebe6fd87d1dcc1b9'

// Helper component for status badges
function StatusBadge({ status }: { status: 'sent' | 'pending' | 'failed' | 'active' | 'paused' }) {
  const styles = {
    sent: 'bg-accent text-accent-foreground',
    active: 'bg-accent text-accent-foreground',
    pending: 'bg-chart-3 text-foreground',
    failed: 'bg-destructive text-destructive-foreground',
    paused: 'bg-muted text-muted-foreground',
  }

  const labels = {
    sent: 'Sent',
    active: 'Active',
    pending: 'Pending',
    failed: 'Failed',
    paused: 'Paused',
  }

  return (
    <span className={`inline-block px-3 py-1 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

// Helper component for category badges
function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    'Breaking': 'bg-destructive text-destructive-foreground',
    'Research': 'bg-chart-3 text-foreground',
    'Trends': 'bg-chart-4 text-foreground',
    'Startups': 'bg-accent text-accent-foreground',
  }

  const color = colors[category] || 'bg-muted text-muted-foreground'

  return (
    <span className={`inline-block px-2 py-1 text-xs font-medium ${color}`}>
      {category}
    </span>
  )
}

// Story card component
function StoryCard({ story, category }: { story: Story; category: string }) {
  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <CategoryBadge category={category} />
      </div>
      <h4 className="font-serif font-bold text-lg tracking-tight leading-tight">
        {story.headline}
      </h4>
      <p className="text-sm leading-relaxed text-foreground/90">
        {story.summary}
      </p>
      <p className="text-xs text-muted-foreground">
        Source: {story.source}
      </p>
    </div>
  )
}

// Settings modal component
function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [slackChannel, setSlackChannel] = useState('')
  const [deliveryTime, setDeliveryTime] = useState('10:00')
  const [timezone, setTimezone] = useState('America/New_York')
  const [categories, setCategories] = useState({
    breaking: true,
    research: true,
    trends: true,
    startups: true,
  })
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      // Load settings from localStorage
      const saved = localStorage.getItem('ai-news-digest-settings')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          setSlackChannel(parsed.slackChannel || '')
          setDeliveryTime(parsed.deliveryTime || '10:00')
          setTimezone(parsed.timezone || 'America/New_York')
          setCategories(parsed.categories || categories)
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }, [isOpen])

  function handleSave() {
    const settings = { slackChannel, deliveryTime, timezone, categories }
    localStorage.setItem('ai-news-digest-settings', JSON.stringify(settings))
    setStatusMessage('Settings saved successfully')
    setTimeout(() => {
      setStatusMessage('')
      onClose()
    }, 1500)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif font-bold text-2xl tracking-tight">Settings</h2>
            <button onClick={onClose} className="p-2 hover:bg-muted">
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Slack Configuration */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Slack Configuration</h3>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Channel ID</label>
              <input
                type="text"
                value={slackChannel}
                onChange={(e) => setSlackChannel(e.target.value)}
                placeholder="C01234567890"
                className="w-full px-3 py-2 bg-input border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80">
              Test Connection
            </button>
          </div>

          {/* Schedule Settings */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Schedule Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Delivery Time</label>
                <input
                  type="time"
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Current schedule: Daily at {deliveryTime} {timezone.split('/')[1]?.replace('_', ' ')}
            </p>
          </div>

          {/* Category Preferences */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Category Preferences</h3>
            <div className="space-y-2">
              {[
                { key: 'breaking', label: 'Breaking News' },
                { key: 'research', label: 'Research Papers' },
                { key: 'trends', label: 'Industry Trends' },
                { key: 'startups', label: 'Startup News' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={categories[key as keyof typeof categories]}
                    onChange={(e) => setCategories(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="w-4 h-4 bg-input border border-border focus:ring-1 focus:ring-ring"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div className="p-3 bg-accent text-accent-foreground text-sm">
              {statusMessage}
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="w-full py-3 bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [digest, setDigest] = useState<DigestData | null>(null)
  const [history, setHistory] = useState<DigestHistory[]>([])
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set(['Breaking', 'Research', 'Trends', 'Startups']))
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Schedule state
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([])

  useEffect(() => {
    loadHistory()
    loadScheduleStatus()
  }, [])

  function loadHistory() {
    const saved = localStorage.getItem('ai-news-digest-history')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setHistory(parsed)
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  function saveToHistory(digestData: DigestData) {
    const newItem: DigestHistory = {
      id: Date.now().toString(),
      date: digestData.digest_date || new Date().toLocaleDateString(),
      data: digestData,
      timestamp: Date.now(),
    }

    const updated = [newItem, ...history].slice(0, 20) // Keep last 20
    setHistory(updated)
    localStorage.setItem('ai-news-digest-history', JSON.stringify(updated))
  }

  async function loadScheduleStatus() {
    setScheduleLoading(true)
    const scheduleData = await getSchedule(SCHEDULE_ID)
    if (scheduleData?.success && scheduleData.schedule) {
      setSchedule(scheduleData.schedule)
    }

    const logsData = await getScheduleLogs(SCHEDULE_ID, { limit: 10 })
    if (logsData.success && Array.isArray(logsData.executions)) {
      setExecutionLogs(logsData.executions)
    }
    setScheduleLoading(false)
  }

  async function fetchNews() {
    setLoading(true)
    setStatusMessage('')

    try {
      const result = await callAIAgent('Generate today\'s AI news digest', AGENT_ID)

      if (result.success && result.response?.result) {
        const digestData = result.response.result as DigestData

        // Validate structure
        if (digestData && Array.isArray(digestData.categories)) {
          setDigest(digestData)
          saveToHistory(digestData)
          setStatusMessage('✓ News digest fetched successfully')
        } else {
          setStatusMessage('✗ Invalid response format')
        }
      } else {
        setStatusMessage('✗ Failed to fetch news: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      setStatusMessage('✗ Error: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  async function toggleSchedule() {
    if (!schedule) return

    setScheduleLoading(true)
    const result = schedule.is_active
      ? await pauseSchedule(SCHEDULE_ID)
      : await resumeSchedule(SCHEDULE_ID)

    if (result.success) {
      await loadScheduleStatus()
    }
    setScheduleLoading(false)
  }

  function toggleHistoryItem(id: string) {
    setExpandedHistory(prev => {
      const updated = new Set(prev)
      if (updated.has(id)) {
        updated.delete(id)
      } else {
        updated.add(id)
      }
      return updated
    })
  }

  function toggleCategoryFilter(category: string) {
    setCategoryFilters(prev => {
      const updated = new Set(prev)
      if (updated.has(category)) {
        updated.delete(category)
      } else {
        updated.add(category)
      }
      return updated
    })
  }

  function getFilteredCategories(categories: Category[]) {
    if (!Array.isArray(categories)) return []
    return categories.filter(cat => categoryFilters.has(cat.category_name))
  }

  function formatNextRun(isoString?: string | null): string {
    if (!isoString) return 'Not scheduled'

    try {
      const date = new Date(isoString)
      const now = new Date()
      const diffMs = date.getTime() - now.getTime()

      if (diffMs < 0) return 'Past due'

      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

      if (diffHours < 1) {
        return `In ${diffMins} minute${diffMins !== 1 ? 's' : ''}`
      } else if (diffHours < 24) {
        return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}`
      } else {
        const options: Intl.DateTimeFormatOptions = {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }
        return date.toLocaleString('en-US', options)
      }
    } catch (error) {
      return 'Invalid date'
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="sticky top-0 border-b border-border bg-background z-40">
        <div className="mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
          <h1 className="font-serif font-bold text-3xl tracking-tight">AI News Daily</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${schedule?.is_active ? 'bg-accent' : 'bg-destructive'}`} />
              <span className="text-xs text-muted-foreground">
                {schedule?.is_active ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 hover:bg-muted transition-colors"
              aria-label="Settings"
            >
              <FiSettings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        {/* Today's Digest Panel */}
        <div className="border border-border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif font-bold text-2xl tracking-tight mb-2">Today's Digest</h2>
              <p className="text-sm text-muted-foreground">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            {digest && (
              <StatusBadge status={digest.slack_posted ? 'sent' : 'pending'} />
            )}
          </div>

          {digest && Array.isArray(digest.categories) ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Total Stories: {digest.total_stories}
              </p>
              <div className="flex flex-wrap gap-3">
                {digest.categories.map((cat, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <CategoryBadge category={cat.category_name} />
                    <span className="text-muted-foreground">
                      {Array.isArray(cat.stories) ? cat.stories.length : 0} stories
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No digest loaded yet. Click "Fetch Latest News" to generate today's digest.</p>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={fetchNews}
          disabled={loading}
          className="w-full py-3 bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <FiRefreshCw className="w-5 h-5 animate-spin" />
              <span>Fetching News...</span>
            </>
          ) : (
            <>
              <FiRefreshCw className="w-5 h-5" />
              <span>Fetch Latest News</span>
            </>
          )}
        </button>

        {/* Status Message */}
        {statusMessage && (
          <div className={`p-3 text-sm ${statusMessage.startsWith('✓') ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'}`}>
            {statusMessage}
          </div>
        )}

        {/* Schedule Management Section */}
        <div className="border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif font-bold text-xl tracking-tight">Schedule</h2>
            {schedule && (
              <StatusBadge status={schedule.is_active ? 'active' : 'paused'} />
            )}
          </div>

          {schedule ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FiClock className="w-4 h-4" />
                    <span>Schedule</span>
                  </div>
                  <p className="text-sm font-medium">
                    {schedule.cron_expression ? cronToHuman(schedule.cron_expression) : 'Not configured'}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FiCalendar className="w-4 h-4" />
                    <span>Next Run</span>
                  </div>
                  <p className="text-sm font-medium">
                    {formatNextRun(schedule.next_run_time)}
                  </p>
                </div>
              </div>

              <button
                onClick={toggleSchedule}
                disabled={scheduleLoading}
                className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 flex items-center gap-2"
              >
                {schedule.is_active ? (
                  <>
                    <FiPause className="w-4 h-4" />
                    <span>Pause Schedule</span>
                  </>
                ) : (
                  <>
                    <FiPlay className="w-4 h-4" />
                    <span>Resume Schedule</span>
                  </>
                )}
              </button>

              {/* Run History */}
              {Array.isArray(executionLogs) && executionLogs.length > 0 && (
                <div className="pt-4 border-t border-border space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent Executions</h3>
                  <div className="space-y-2">
                    {executionLogs.slice(0, 5).map((log) => (
                      <div key={log.id} className="flex items-center justify-between text-sm p-2 bg-muted/30">
                        <div className="flex items-center gap-3">
                          {log.success ? (
                            <FiCheck className="w-4 h-4 text-accent" />
                          ) : (
                            <FiX className="w-4 h-4 text-destructive" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.executed_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                        </div>
                        <span className="text-xs">
                          {log.success ? 'Success' : 'Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FiAlertCircle className="w-4 h-4" />
              <span>Loading schedule information...</span>
            </div>
          )}
        </div>

        {/* News History Section */}
        <div className="border border-border bg-card p-6 space-y-4">
          <h2 className="font-serif font-bold text-xl tracking-tight">History</h2>

          {/* Category Filter Chips */}
          <div className="flex flex-wrap gap-2">
            {['Breaking', 'Research', 'Trends', 'Startups'].map((category) => (
              <button
                key={category}
                onClick={() => toggleCategoryFilter(category)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  categoryFilters.has(category)
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* History List */}
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No history yet. Fetch news to see digests here.</p>
            ) : (
              history.map((item) => {
                const isExpanded = expandedHistory.has(item.id)
                const filteredCategories = getFilteredCategories(item.data.categories || [])

                return (
                  <div key={item.id} className="border border-border bg-card">
                    <button
                      onClick={() => toggleHistoryItem(item.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    >
                      <div className="text-left">
                        <p className="font-medium text-sm">{item.date}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.data.total_stories || 0} stories
                        </p>
                      </div>
                      {isExpanded ? (
                        <FiChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <FiChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="p-4 border-t border-border space-y-4">
                        {filteredCategories.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No stories match selected category filters.</p>
                        ) : (
                          filteredCategories.map((category, catIdx) => (
                            <div key={catIdx} className="space-y-3">
                              <h3 className="font-serif font-bold text-lg tracking-tight">
                                {category.category_name}
                              </h3>
                              <div className="space-y-3">
                                {Array.isArray(category.stories) && category.stories.map((story, storyIdx) => (
                                  <StoryCard
                                    key={storyIdx}
                                    story={story}
                                    category={category.category_name}
                                  />
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
