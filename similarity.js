/**
 * Similarity Module - TF-IDF and Vector Similarity for Thread Matching
 * Provides local keyword-based thread suggestions without API calls
 */

// Common English stopwords to filter out
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us',
  'them', 'my', 'your', 'his', 'our', 'their', 'what', 'which', 'who', 'whom',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once',
  'if', 'unless', 'until', 'while', 'although', 'because', 'since', 'about', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'again', 'further', 'any', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
  // Common AI chat terms
  'please', 'help', 'thanks', 'thank', 'hi', 'hello', 'hey', 'okay', 'ok', 'yes',
  'no', 'sure', 'well', 'like', 'just', 'know', 'think', 'want', 'get', 'make',
  'see', 'look', 'use', 'try', 'need', 'let', 'say', 'tell', 'ask', 'give'
]);

// Minimum term length to consider
const MIN_TERM_LENGTH = 2;

// Maximum terms to keep in TF-IDF vector
const MAX_VECTOR_TERMS = 100;

/**
 * Tokenize text into terms
 * @param {string} text - Text to tokenize
 * @returns {string[]} Array of normalized terms
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];

  // Convert to lowercase
  let normalized = text.toLowerCase();

  // Split camelCase and PascalCase (e.g., "getUserData" -> "get user data")
  normalized = normalized.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Split snake_case (e.g., "get_user_data" -> "get user data")
  normalized = normalized.replace(/_/g, ' ');

  // Remove special characters, keep letters, numbers, spaces
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');

  // Split into words
  const words = normalized.split(/\s+/).filter(Boolean);

  // Filter: remove stopwords, short words, and pure numbers
  return words.filter(word =>
    word.length >= MIN_TERM_LENGTH &&
    !STOPWORDS.has(word) &&
    !/^\d+$/.test(word)
  );
}

/**
 * Compute term frequency for a document
 * @param {string[]} tokens - Array of tokens
 * @returns {Map<string, number>} Term -> frequency map
 */
function computeTermFrequency(tokens) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

/**
 * Compute IDF (Inverse Document Frequency)
 * @param {number} documentFrequency - Number of documents containing the term
 * @param {number} totalDocuments - Total number of documents
 * @returns {number} IDF score
 */
function computeIDF(documentFrequency, totalDocuments) {
  // Add 1 to avoid division by zero and smooth the value
  return Math.log((totalDocuments + 1) / (documentFrequency + 1)) + 1;
}

/**
 * Compute TF-IDF vector for a thread
 * @param {Object} thread - Thread object with title, tags, searchable_content
 * @param {Map<string, number>} documentFrequency - Global document frequency map
 * @param {number} totalDocuments - Total number of documents in corpus
 * @returns {Object} TF-IDF vector { terms: string[], scores: number[] }
 */
function computeTFIDF(thread, documentFrequency, totalDocuments) {
  // Combine text sources with weights
  const textParts = [];

  // Title has highest weight (3x)
  if (thread.title) {
    const titleTokens = tokenize(thread.title);
    for (let i = 0; i < 3; i++) textParts.push(...titleTokens);
  }

  // Tags have medium weight (2x)
  if (Array.isArray(thread.tags)) {
    const tagTokens = tokenize(thread.tags.join(' '));
    for (let i = 0; i < 2; i++) textParts.push(...tagTokens);
  }

  // Category
  if (thread.category) {
    textParts.push(...tokenize(thread.category));
  }

  // AI summary (if available)
  if (thread.ai_summary) {
    textParts.push(...tokenize(thread.ai_summary));
  }

  // Full searchable content (1x weight, but sample to avoid huge docs)
  if (thread.searchable_content) {
    // Sample first 5000 chars to keep computation reasonable
    const sample = thread.searchable_content.slice(0, 5000);
    textParts.push(...tokenize(sample));
  }

  // Compute term frequency
  const tf = computeTermFrequency(textParts);

  // Compute TF-IDF scores
  const tfidfScores = [];
  for (const [term, freq] of tf) {
    const df = documentFrequency.get(term) || 0;
    const idf = computeIDF(df, totalDocuments);
    // TF-IDF = term frequency * inverse document frequency
    // Use log(1 + tf) to dampen high-frequency terms
    const tfidf = Math.log(1 + freq) * idf;
    tfidfScores.push({ term, score: tfidf });
  }

  // Sort by score descending and take top N terms
  tfidfScores.sort((a, b) => b.score - a.score);
  const topTerms = tfidfScores.slice(0, MAX_VECTOR_TERMS);

  return {
    terms: topTerms.map(t => t.term),
    scores: topTerms.map(t => t.score),
    computed_at: new Date().toISOString()
  };
}

/**
 * Compute cosine similarity between two TF-IDF vectors
 * @param {Object} vectorA - { terms: string[], scores: number[] }
 * @param {Object} vectorB - { terms: string[], scores: number[] }
 * @returns {number} Similarity score between 0 and 1
 */
function cosineSimilarity(vectorA, vectorB) {
  if (!vectorA?.terms?.length || !vectorB?.terms?.length) return 0;

  // Build term -> score maps
  const mapA = new Map();
  for (let i = 0; i < vectorA.terms.length; i++) {
    mapA.set(vectorA.terms[i], vectorA.scores[i]);
  }

  const mapB = new Map();
  for (let i = 0; i < vectorB.terms.length; i++) {
    mapB.set(vectorB.terms[i], vectorB.scores[i]);
  }

  // Compute dot product and magnitudes
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  // Iterate over all unique terms
  const allTerms = new Set([...mapA.keys(), ...mapB.keys()]);

  for (const term of allTerms) {
    const scoreA = mapA.get(term) || 0;
    const scoreB = mapB.get(term) || 0;

    dotProduct += scoreA * scoreB;
    magnitudeA += scoreA * scoreA;
    magnitudeB += scoreB * scoreB;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Build document frequency index from all threads
 * @param {Array} threads - Array of thread objects
 * @returns {Object} { documentFrequency: Map, totalDocuments: number }
 */
function buildDocumentFrequencyIndex(threads) {
  const documentFrequency = new Map();

  for (const thread of threads) {
    // Get unique terms for this document
    const textParts = [];
    if (thread.title) textParts.push(...tokenize(thread.title));
    if (Array.isArray(thread.tags)) textParts.push(...tokenize(thread.tags.join(' ')));
    if (thread.category) textParts.push(...tokenize(thread.category));
    if (thread.ai_summary) textParts.push(...tokenize(thread.ai_summary));
    if (thread.searchable_content) {
      textParts.push(...tokenize(thread.searchable_content.slice(0, 5000)));
    }

    // Count each unique term once per document
    const uniqueTerms = new Set(textParts);
    for (const term of uniqueTerms) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  return {
    documentFrequency,
    totalDocuments: threads.length
  };
}

/**
 * Compute tag overlap score between two threads
 * @param {Object} threadA - First thread
 * @param {Object} threadB - Second thread
 * @returns {number} Score based on shared tags and category
 */
function computeTagSimilarity(threadA, threadB) {
  let score = 0;

  // Same category = 0.3 bonus
  if (threadA.category && threadB.category && threadA.category === threadB.category) {
    score += 0.3;
  }

  // Tag overlap: Jaccard similarity
  const tagsA = new Set(Array.isArray(threadA.tags) ? threadA.tags.map(t => t.toLowerCase()) : []);
  const tagsB = new Set(Array.isArray(threadB.tags) ? threadB.tags.map(t => t.toLowerCase()) : []);

  if (tagsA.size > 0 && tagsB.size > 0) {
    const intersection = [...tagsA].filter(t => tagsB.has(t)).length;
    const union = new Set([...tagsA, ...tagsB]).size;
    const jaccard = intersection / union;
    score += jaccard * 0.7; // Tag overlap contributes up to 0.7
  }

  return score;
}

/**
 * Compute cosine similarity between two dense embedding vectors
 * @param {number[]} a - First vector (e.g., 1536-dimensional OpenAI embedding)
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score between -1 and 1
 */
function embeddingCosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (normA * normB);
}

/**
 * Find similar threads using TF-IDF similarity with tag-based fallback
 * @param {Object} targetThread - The thread to find similar threads for
 * @param {Array} allThreads - All threads in the corpus
 * @param {number} topK - Number of similar threads to return
 * @param {Object} options - Optional embedding data for hybrid similarity
 * @param {Object} options.targetEmbedding - Embedding record for target thread {thread_id, embedding}
 * @param {Array} options.allEmbeddings - All embedding records [{thread_id, embedding}, ...]
 * @returns {Array} Array of { thread, score, matchType } sorted by similarity
 */
function findSimilarThreads(targetThread, allThreads, topK = 10, options = {}) {
  const { targetEmbedding, allEmbeddings } = options;

  console.log('[Similarity] findSimilarThreads called, target:', targetThread?.id, targetThread?.title);
  console.log('[Similarity] Target thread tags:', targetThread?.tags, 'category:', targetThread?.category);
  console.log('[Similarity] Total threads:', allThreads?.length);
  console.log('[Similarity] Embeddings available - target:', !!targetEmbedding?.embedding, 'all:', allEmbeddings?.length || 0);
  if (targetEmbedding?.embedding) {
    console.log('[Similarity] Target embedding length:', targetEmbedding.embedding.length);
  }

  if (!targetThread || !allThreads?.length) return [];

  // Exclude the target thread from comparison
  const otherThreads = allThreads.filter(t => t.id !== targetThread.id);
  console.log('[Similarity] Other threads to compare:', otherThreads.length);
  if (otherThreads.length === 0) return [];

  // Build thread lookup map for quick access
  const threadById = new Map(allThreads.map(t => [t.id, t]));

  // ========== PRIMARY: USE EMBEDDINGS IF AVAILABLE ==========
  const embeddingSimilarities = [];

  if (targetEmbedding?.embedding && allEmbeddings?.length > 0) {
    // Build embedding lookup map
    const embeddingByThreadId = new Map(allEmbeddings.map(e => [e.thread_id, e.embedding]));

    console.log('[Similarity] Computing embedding similarities...');

    for (const thread of otherThreads) {
      const otherEmbedding = embeddingByThreadId.get(thread.id);
      if (!otherEmbedding) continue;

      const score = embeddingCosineSimilarity(targetEmbedding.embedding, otherEmbedding);

      // Embedding threshold: 0.3 is meaningful semantic similarity for OpenAI embeddings
      // (typical similar content ranges 0.3-0.7, very similar 0.7+)
      if (score > 0.3) {
        embeddingSimilarities.push({ thread, score, matchType: 'embedding' });
      }
    }

    console.log('[Similarity] Embedding matches (score > 0.3):', embeddingSimilarities.length);

    // If we have enough high-quality embedding matches, use them
    if (embeddingSimilarities.length >= topK) {
      embeddingSimilarities.sort((a, b) => b.score - a.score);
      console.log('[Similarity] Using embedding results, top scores:', embeddingSimilarities.slice(0, 5).map(s => s.score.toFixed(3)));
      return embeddingSimilarities.slice(0, topK);
    }
  }

  // ========== SECONDARY: TF-IDF FOR THREADS WITHOUT EMBEDDINGS ==========
  // Build document frequency index
  const { documentFrequency, totalDocuments } = buildDocumentFrequencyIndex(allThreads);

  // Compute TF-IDF for target thread
  const targetVector = computeTFIDF(targetThread, documentFrequency, totalDocuments);

  // Track threads already matched by embeddings
  const embeddingMatchedIds = new Set(embeddingSimilarities.map(s => s.thread.id));

  // Compute TF-IDF similarity with threads not matched by embeddings
  const tfidfSimilarities = [];
  for (const thread of otherThreads) {
    // Skip threads already matched by embeddings
    if (embeddingMatchedIds.has(thread.id)) continue;

    // Use cached vector if available and recent
    let threadVector = thread.tfidf_vector;
    if (!threadVector || !threadVector.terms?.length) {
      threadVector = computeTFIDF(thread, documentFrequency, totalDocuments);
    }

    const score = cosineSimilarity(targetVector, threadVector);

    // Only include if similarity is meaningful (> 0.1)
    if (score > 0.1) {
      tfidfSimilarities.push({ thread, score, matchType: 'tfidf' });
    }
  }

  console.log('[Similarity] TF-IDF matches (score > 0.1):', tfidfSimilarities.length);

  // Combine embedding and TF-IDF results
  const combined = [...embeddingSimilarities, ...tfidfSimilarities];

  // If we have enough combined matches, return them
  if (combined.length >= topK) {
    combined.sort((a, b) => {
      // Embedding matches always come first (more semantically accurate)
      if (a.matchType === 'embedding' && b.matchType !== 'embedding') return -1;
      if (a.matchType !== 'embedding' && b.matchType === 'embedding') return 1;
      return b.score - a.score;
    });
    console.log('[Similarity] Using combined embedding+TF-IDF results:', combined.length);
    return combined.slice(0, topK);
  }

  // ========== FALLBACK: TAG-BASED SIMILARITY ==========
  console.log('[Similarity] Combined found', combined.length, 'matches, using tag fallback...');

  const matchedIds = new Set(combined.map(s => s.thread.id));
  const tagSimilarities = [];

  for (const thread of otherThreads) {
    // Skip threads already matched
    if (matchedIds.has(thread.id)) continue;

    const tagScore = computeTagSimilarity(targetThread, thread);

    // Only include if there's meaningful tag/category overlap (> 0.2)
    if (tagScore > 0.2) {
      tagSimilarities.push({ thread, score: tagScore, matchType: 'tags' });
    }
  }

  console.log('[Similarity] Tag fallback matches:', tagSimilarities.length);

  // Final combination: embeddings > TF-IDF > tags
  const final = [...combined, ...tagSimilarities];
  final.sort((a, b) => {
    // Priority: embedding > tfidf > tags
    const priority = { embedding: 3, tfidf: 2, tags: 1 };
    const aPriority = priority[a.matchType] || 0;
    const bPriority = priority[b.matchType] || 0;

    // If priorities differ significantly, respect priority
    if (aPriority !== bPriority) {
      // But only if the higher priority score isn't too low
      const higherScore = aPriority > bPriority ? a.score : b.score;
      const lowerPriorityScore = aPriority > bPriority ? b.score : a.score;

      // If lower priority has much higher score, let it win
      if (lowerPriorityScore > higherScore + 0.3) {
        return b.score - a.score;
      }
      return bPriority - aPriority;
    }
    return b.score - a.score;
  });

  const results = final.slice(0, topK);
  console.log('[Similarity] Final results:', results.length, 'of', final.length);
  results.forEach((r, i) => {
    console.log(`[Similarity] #${i + 1}: ${r.matchType} ${(r.score * 100).toFixed(1)}% - "${r.thread.title?.slice(0, 40)}..."`);
  });
  return results;
}

/**
 * Search threads using TF-IDF ranking
 * @param {string} query - Search query
 * @param {Array} threads - All threads to search
 * @param {number} topK - Maximum results to return
 * @returns {Array} Ranked results { thread, score, matchType }
 */
function tfidfSearch(query, threads, topK = 10) {
  if (!query?.trim() || !threads?.length) return [];

  const queryTerms = tokenize(query);
  if (!queryTerms.length) return [];

  const queryLower = query.toLowerCase();

  // Build document frequency index
  const { documentFrequency, totalDocuments } = buildDocumentFrequencyIndex(threads);

  // Create a pseudo TF-IDF vector for the query
  const queryTF = computeTermFrequency(queryTerms);
  const queryVector = {
    terms: [],
    scores: []
  };
  for (const [term, freq] of queryTF) {
    const df = documentFrequency.get(term) || 1;
    const idf = computeIDF(df, totalDocuments);
    queryVector.terms.push(term);
    queryVector.scores.push(Math.log(1 + freq) * idf);
  }

  // Score each thread
  const results = [];
  for (const thread of threads) {
    let score = 0;
    let matchType = 'none';

    // TF-IDF similarity
    const threadVector = thread.tfidf_vector || computeTFIDF(thread, documentFrequency, totalDocuments);
    const tfidfScore = cosineSimilarity(queryVector, threadVector);

    // Direct tag match bonus (exact or partial)
    let tagBonus = 0;
    if (Array.isArray(thread.tags)) {
      for (const tag of thread.tags) {
        const tagLower = tag.toLowerCase();
        if (tagLower === queryLower || queryLower.includes(tagLower) || tagLower.includes(queryLower)) {
          tagBonus = Math.max(tagBonus, 0.4); // Exact or strong partial
        } else if (queryTerms.some(t => tagLower.includes(t))) {
          tagBonus = Math.max(tagBonus, 0.2); // Term match
        }
      }
    }

    // Title match bonus
    let titleBonus = 0;
    const titleLower = (thread.title || '').toLowerCase();
    if (titleLower.includes(queryLower)) {
      titleBonus = 0.3; // Exact substring in title
    } else if (queryTerms.some(t => titleLower.includes(t))) {
      titleBonus = 0.1; // Term match in title
    }

    score = tfidfScore + tagBonus + titleBonus;

    if (score > 0.05) {
      matchType = tagBonus > 0 ? 'tag+tfidf' : tfidfScore > 0.1 ? 'tfidf' : 'partial';

      // Extract a snippet showing where the match was found
      let snippet = null;
      let snippetSource = null;

      // Priority: content match > summary > tags > title (title already shown)
      const content = thread.searchable_content || '';
      const contentLower = content.toLowerCase();
      const summary = thread.ai_summary || '';
      const summaryLower = summary.toLowerCase();

      // Try to find query in content
      let matchIndex = contentLower.indexOf(queryLower);
      if (matchIndex >= 0) {
        const start = Math.max(0, matchIndex - 40);
        const end = Math.min(content.length, matchIndex + queryLower.length + 60);
        snippet = (start > 0 ? '...' : '') + content.slice(start, end).trim() + (end < content.length ? '...' : '');
        snippetSource = 'content';
      } else {
        // Try matching individual query terms in content
        for (const term of queryTerms) {
          matchIndex = contentLower.indexOf(term);
          if (matchIndex >= 0) {
            const start = Math.max(0, matchIndex - 40);
            const end = Math.min(content.length, matchIndex + term.length + 60);
            snippet = (start > 0 ? '...' : '') + content.slice(start, end).trim() + (end < content.length ? '...' : '');
            snippetSource = 'content';
            break;
          }
        }
      }

      // If no content match, try summary
      if (!snippet && summaryLower.includes(queryLower)) {
        snippet = summary.slice(0, 100) + (summary.length > 100 ? '...' : '');
        snippetSource = 'summary';
      } else if (!snippet && queryTerms.some(t => summaryLower.includes(t))) {
        snippet = summary.slice(0, 100) + (summary.length > 100 ? '...' : '');
        snippetSource = 'summary';
      }

      // If still no snippet, show matching tags
      if (!snippet && tagBonus > 0) {
        const matchingTags = (thread.tags || []).filter(tag => {
          const tagLower = tag.toLowerCase();
          return tagLower.includes(queryLower) || queryTerms.some(t => tagLower.includes(t));
        });
        if (matchingTags.length > 0) {
          snippet = 'Tags: ' + matchingTags.join(', ');
          snippetSource = 'tags';
        }
      }

      // Default to summary or beginning of content
      if (!snippet) {
        if (summary) {
          snippet = summary.slice(0, 100) + (summary.length > 100 ? '...' : '');
          snippetSource = 'summary';
        } else if (content) {
          snippet = content.slice(0, 100).trim() + (content.length > 100 ? '...' : '');
          snippetSource = 'content';
        }
      }

      results.push({ thread, score, matchType, snippet, snippetSource });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Batch compute TF-IDF vectors for all threads
 * @param {Array} threads - All threads
 * @returns {Array} Threads with tfidf_vector field populated
 */
function batchComputeTFIDF(threads) {
  if (!threads?.length) return [];

  // Build document frequency index
  const { documentFrequency, totalDocuments } = buildDocumentFrequencyIndex(threads);

  // Compute TF-IDF for each thread
  return threads.map(thread => ({
    ...thread,
    tfidf_vector: computeTFIDF(thread, documentFrequency, totalDocuments)
  }));
}

/**
 * Get top keywords from a thread (for display)
 * @param {Object} thread - Thread object
 * @param {number} topN - Number of keywords to return
 * @returns {string[]} Top keywords
 */
function getTopKeywords(thread, topN = 10) {
  if (thread.tfidf_vector?.terms?.length) {
    return thread.tfidf_vector.terms.slice(0, topN);
  }

  // Fallback: compute on the fly with dummy document frequency
  const tokens = [];
  if (thread.title) tokens.push(...tokenize(thread.title));
  if (Array.isArray(thread.tags)) tokens.push(...tokenize(thread.tags.join(' ')));
  if (thread.category) tokens.push(...tokenize(thread.category));

  const tf = computeTermFrequency(tokens);
  const sorted = [...tf.entries()].sort((a, b) => b[1] - a[1]);

  return sorted.slice(0, topN).map(([term]) => term);
}

// Export functions
export {
  tokenize,
  computeTermFrequency,
  computeIDF,
  computeTFIDF,
  cosineSimilarity,
  buildDocumentFrequencyIndex,
  findSimilarThreads,
  tfidfSearch,
  batchComputeTFIDF,
  getTopKeywords,
  STOPWORDS
};
