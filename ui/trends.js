/**
 * Trend Aggregation Functions for Thread Analytics
 * Provides data aggregation for time-series visualizations
 */

// Aggregation periods
const PERIOD = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month'
};

/**
 * Get the bucket key for a date based on period
 * @param {Date} date - The date to bucket
 * @param {string} period - 'day', 'week', or 'month'
 * @returns {string} Bucket key in ISO format
 */
function getBucketKey(date, period) {
  const d = new Date(date);
  switch (period) {
    case PERIOD.DAY:
      return d.toISOString().split('T')[0];
    case PERIOD.WEEK:
      // Get start of week (Sunday)
      const dayOfWeek = d.getDay();
      const startOfWeek = new Date(d);
      startOfWeek.setDate(d.getDate() - dayOfWeek);
      return startOfWeek.toISOString().split('T')[0];
    case PERIOD.MONTH:
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    default:
      return d.toISOString().split('T')[0];
  }
}

/**
 * Generate all date buckets between start and end dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} period - 'day', 'week', or 'month'
 * @returns {string[]} Array of bucket keys
 */
function generateDateRange(startDate, endDate, period) {
  const buckets = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    buckets.push(getBucketKey(current, period));

    // Increment based on period
    switch (period) {
      case PERIOD.DAY:
        current.setDate(current.getDate() + 1);
        break;
      case PERIOD.WEEK:
        current.setDate(current.getDate() + 7);
        break;
      case PERIOD.MONTH:
        current.setMonth(current.getMonth() + 1);
        break;
    }
  }

  // Remove duplicates and sort
  return [...new Set(buckets)].sort();
}

/**
 * Aggregate thread activity over time
 * @param {Array} threads - All threads
 * @param {string} dateField - 'created_at' or 'last_synced_at'
 * @param {string} period - 'day', 'week', 'month'
 * @returns {Object} { labels: Date[], data: number[] }
 */
function aggregateByTimePeriod(threads, dateField = 'created_at', period = PERIOD.WEEK) {
  if (!threads?.length) return { labels: [], data: [] };

  // Filter threads with valid dates
  const validThreads = threads.filter(t => t[dateField]);
  if (validThreads.length === 0) return { labels: [], data: [] };

  // Get date range
  const dates = validThreads.map(t => new Date(t[dateField]));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  // Generate all buckets
  const allBuckets = generateDateRange(minDate, maxDate, period);

  // Count threads per bucket
  const bucketCounts = new Map(allBuckets.map(b => [b, 0]));

  validThreads.forEach(thread => {
    const key = getBucketKey(new Date(thread[dateField]), period);
    bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
  });

  return {
    labels: allBuckets.map(b => new Date(b)),
    data: allBuckets.map(b => bucketCounts.get(b) || 0)
  };
}

/**
 * Aggregate by provider over time (for stacked area chart)
 * @param {Array} threads - All threads
 * @param {string} period - 'day', 'week', 'month'
 * @returns {Object} { labels: Date[], datasets: { [provider]: number[] } }
 */
function aggregateByProviderOverTime(threads, period = PERIOD.WEEK) {
  if (!threads?.length) return { labels: [], datasets: {} };

  const providers = ['chatgpt', 'claude', 'gemini', 'grok', 'copilot'];
  const validThreads = threads.filter(t => t.created_at);
  if (validThreads.length === 0) return { labels: [], datasets: {} };

  // Get date range
  const dates = validThreads.map(t => new Date(t.created_at));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  // Generate all buckets
  const allBuckets = generateDateRange(minDate, maxDate, period);

  // Initialize counts
  const bucketsByProvider = {};
  providers.forEach(p => {
    bucketsByProvider[p] = new Map(allBuckets.map(b => [b, 0]));
  });

  // Count threads per provider per bucket
  validThreads.forEach(thread => {
    const key = getBucketKey(new Date(thread.created_at), period);
    const provider = thread.provider || 'unknown';
    if (bucketsByProvider[provider]) {
      bucketsByProvider[provider].set(key, (bucketsByProvider[provider].get(key) || 0) + 1);
    }
  });

  // Convert to arrays
  const datasets = {};
  providers.forEach(p => {
    datasets[p] = allBuckets.map(b => bucketsByProvider[p].get(b) || 0);
  });

  return {
    labels: allBuckets.map(b => new Date(b)),
    datasets
  };
}

/**
 * Aggregate category/topic evolution over time
 * @param {Array} threads - All threads
 * @param {string} period - 'day', 'week', 'month'
 * @returns {Object} { labels: Date[], datasets: { [category]: number[] } }
 */
function aggregateCategoryEvolution(threads, period = PERIOD.WEEK) {
  if (!threads?.length) return { labels: [], datasets: {} };

  const validThreads = threads.filter(t => t.created_at);
  if (validThreads.length === 0) return { labels: [], datasets: {} };

  // Get date range
  const dates = validThreads.map(t => new Date(t.created_at));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  // Generate all buckets
  const allBuckets = generateDateRange(minDate, maxDate, period);

  // Collect all unique categories
  const categories = [...new Set(validThreads.map(t => t.category || 'other'))];

  // Initialize counts
  const bucketsByCategory = {};
  categories.forEach(c => {
    bucketsByCategory[c] = new Map(allBuckets.map(b => [b, 0]));
  });

  // Count threads per category per bucket
  validThreads.forEach(thread => {
    const key = getBucketKey(new Date(thread.created_at), period);
    const category = thread.category || 'other';
    if (bucketsByCategory[category]) {
      bucketsByCategory[category].set(key, (bucketsByCategory[category].get(key) || 0) + 1);
    }
  });

  // Convert to arrays
  const datasets = {};
  categories.forEach(c => {
    datasets[c] = allBuckets.map(b => bucketsByCategory[c].get(b) || 0);
  });

  return {
    labels: allBuckets.map(b => new Date(b)),
    datasets
  };
}

/**
 * Get cumulative growth over time
 * @param {Array} threads - All threads
 * @param {string} period - 'day', 'week', 'month'
 * @returns {Object} { labels: Date[], data: number[] } - Cumulative total
 */
function getCumulativeGrowth(threads, period = PERIOD.WEEK) {
  const { labels, data } = aggregateByTimePeriod(threads, 'created_at', period);

  let cumulative = 0;
  const cumulativeData = data.map(count => {
    cumulative += count;
    return cumulative;
  });

  return { labels, data: cumulativeData };
}

/**
 * Get summary statistics for threads
 * @param {Array} threads - All threads
 * @returns {Object} Summary stats
 */
function getThreadSummaryStats(threads) {
  if (!threads?.length) {
    return {
      total: 0,
      byProvider: {},
      byCategory: {},
      byStatus: {},
      avgMessagesPerThread: 0,
      threadsWithPII: 0,
      threadsWithSecrets: 0
    };
  }

  const stats = {
    total: threads.length,
    byProvider: {},
    byCategory: {},
    byStatus: {},
    avgMessagesPerThread: 0,
    threadsWithPII: 0,
    threadsWithSecrets: 0
  };

  let totalMessages = 0;

  threads.forEach(thread => {
    // By provider
    const provider = thread.provider || 'unknown';
    stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;

    // By category
    const category = thread.category || 'other';
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

    // By status
    const status = thread.status || 'unknown';
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

    // Messages
    totalMessages += thread.message_count || 0;

    // PII flags
    if (thread.contains_pii) stats.threadsWithPII++;
    if (thread.contains_security_or_secrets) stats.threadsWithSecrets++;
  });

  stats.avgMessagesPerThread = Math.round(totalMessages / threads.length);

  return stats;
}

// Provider colors for charts
const PROVIDER_COLORS = {
  chatgpt: { bg: 'rgba(116, 212, 165, 0.5)', border: 'rgb(116, 212, 165)' },
  claude: { bg: 'rgba(212, 165, 116, 0.5)', border: 'rgb(212, 165, 116)' },
  gemini: { bg: 'rgba(116, 148, 212, 0.5)', border: 'rgb(116, 148, 212)' },
  grok: { bg: 'rgba(212, 116, 165, 0.5)', border: 'rgb(212, 116, 165)' },
  copilot: { bg: 'rgba(165, 165, 212, 0.5)', border: 'rgb(165, 165, 212)' }
};

// Category colors for charts
const CATEGORY_COLORS = {
  work: { bg: 'rgba(92, 179, 255, 0.5)', border: 'rgb(92, 179, 255)' },
  personal: { bg: 'rgba(255, 219, 92, 0.5)', border: 'rgb(255, 219, 92)' },
  learning: { bg: 'rgba(92, 255, 138, 0.5)', border: 'rgb(92, 255, 138)' },
  hobbies: { bg: 'rgba(255, 138, 92, 0.5)', border: 'rgb(255, 138, 92)' },
  finance: { bg: 'rgba(138, 92, 255, 0.5)', border: 'rgb(138, 92, 255)' },
  health: { bg: 'rgba(255, 92, 138, 0.5)', border: 'rgb(255, 92, 138)' },
  admin: { bg: 'rgba(179, 179, 179, 0.5)', border: 'rgb(179, 179, 179)' },
  other: { bg: 'rgba(136, 136, 136, 0.5)', border: 'rgb(136, 136, 136)' }
};

// Export for use in view.js
if (typeof window !== 'undefined') {
  window.TrendsModule = {
    PERIOD,
    aggregateByTimePeriod,
    aggregateByProviderOverTime,
    aggregateCategoryEvolution,
    getCumulativeGrowth,
    getThreadSummaryStats,
    PROVIDER_COLORS,
    CATEGORY_COLORS
  };
}
