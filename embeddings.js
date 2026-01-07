/**
 * Embeddings Module for AI Thread Hub
 *
 * Generates and manages vector embeddings for thread visualization
 * Uses OpenAI's text-embedding-3-small model
 */

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const OPENAI_EMBEDDING_ENDPOINT = 'https://api.openai.com/v1/embeddings';

/**
 * Generate embedding for a text string using OpenAI API
 * @param {string} text - Text to embed
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<number[]>} 1536-dimensional embedding vector
 */
export async function generateEmbedding(text, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text to embed cannot be empty');
  }

  // Truncate text to ~8000 tokens (~32000 chars) to stay within model limits
  const truncatedText = text.slice(0, 32000);

  const response = await fetch(OPENAI_EMBEDDING_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: truncatedText,
      model: EMBEDDING_MODEL,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 * OpenAI supports up to 2048 inputs per request
 * @param {string[]} texts - Array of texts to embed
 * @param {string} apiKey - OpenAI API key
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
export async function generateEmbeddingsBatch(texts, apiKey, onProgress = null) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const results = [];
  const batchSize = 100; // Process 100 at a time to avoid rate limits

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const truncatedBatch = batch.map((t) => (t || '').slice(0, 32000));

    const response = await fetch(OPENAI_EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: truncatedBatch,
        model: EMBEDDING_MODEL,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const batchEmbeddings = data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    results.push(...batchEmbeddings);

    if (onProgress) {
      onProgress({
        completed: Math.min(i + batchSize, texts.length),
        total: texts.length,
        percentage: Math.round((Math.min(i + batchSize, texts.length) / texts.length) * 100),
      });
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return results;
}

/**
 * Prepare text for embedding from a thread object
 * @param {Object} thread - Thread object
 * @returns {string} Text suitable for embedding
 */
export function prepareThreadText(thread) {
  const parts = [];

  if (thread.title) {
    parts.push(`Title: ${thread.title}`);
  }

  if (thread.ai_summary || thread.provider_summary) {
    parts.push(`Summary: ${thread.ai_summary || thread.provider_summary}`);
  }

  if (thread.category) {
    parts.push(`Category: ${thread.category}`);
  }

  if (thread.tags && thread.tags.length > 0) {
    parts.push(`Tags: ${thread.tags.join(', ')}`);
  }

  // Include a snippet of searchable content if available
  if (thread.searchable_content) {
    const snippet = thread.searchable_content.slice(0, 2000);
    parts.push(`Content: ${snippet}`);
  }

  return parts.join('\n\n');
}

/**
 * Compute a simple hash of text for change detection
 * @param {string} text - Text to hash
 * @returns {string} Hash string
 */
export function computeTextHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score between -1 and 1
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

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

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Find similar threads based on embedding similarity
 * @param {Object} targetEmbedding - Embedding record for target thread
 * @param {Object[]} allEmbeddings - All embedding records
 * @param {number} threshold - Minimum similarity threshold (default 0.7)
 * @param {number} limit - Maximum results to return
 * @returns {Object[]} Array of {thread_id, similarity} sorted by similarity
 */
export function findSimilarByEmbedding(targetEmbedding, allEmbeddings, threshold = 0.7, limit = 10) {
  if (!targetEmbedding?.embedding) {
    return [];
  }

  const similarities = [];

  for (const other of allEmbeddings) {
    if (other.thread_id === targetEmbedding.thread_id) {
      continue;
    }

    const similarity = cosineSimilarity(targetEmbedding.embedding, other.embedding);
    if (similarity >= threshold) {
      similarities.push({
        thread_id: other.thread_id,
        similarity,
      });
    }
  }

  // Sort by similarity descending
  similarities.sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, limit);
}

/**
 * Simple 2D projection using PCA-like approach
 * This is a simplified version - for better results use UMAP
 * @param {number[][]} embeddings - Array of embedding vectors
 * @returns {number[][]} Array of [x, y] coordinates
 */
export function projectTo2D(embeddings) {
  if (!embeddings || embeddings.length === 0) {
    return [];
  }

  if (embeddings.length === 1) {
    return [[0, 0]];
  }

  // Use first two principal components (simplified PCA)
  // For a proper implementation, use UMAP library

  // Compute mean
  const dims = embeddings[0].length;
  const mean = new Array(dims).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dims; i++) {
      mean[i] += emb[i] / embeddings.length;
    }
  }

  // Center the data
  const centered = embeddings.map((emb) => emb.map((v, i) => v - mean[i]));

  // Use two "random" but consistent projection vectors
  // These are derived from the data to get some separation
  const proj1 = new Array(dims).fill(0);
  const proj2 = new Array(dims).fill(0);

  // First projection: emphasize early dimensions
  for (let i = 0; i < dims; i++) {
    proj1[i] = Math.cos(i * 0.01);
    proj2[i] = Math.sin(i * 0.01 + 1);
  }

  // Normalize projection vectors
  const norm1 = Math.sqrt(proj1.reduce((sum, v) => sum + v * v, 0));
  const norm2 = Math.sqrt(proj2.reduce((sum, v) => sum + v * v, 0));
  for (let i = 0; i < dims; i++) {
    proj1[i] /= norm1;
    proj2[i] /= norm2;
  }

  // Project each embedding to 2D
  const projected = centered.map((emb) => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < dims; i++) {
      x += emb[i] * proj1[i];
      y += emb[i] * proj2[i];
    }
    return [x, y];
  });

  // Normalize to [-1, 1] range
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of projected) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return projected.map(([x, y]) => [((x - minX) / rangeX) * 2 - 1, ((y - minY) / rangeY) * 2 - 1]);
}

/**
 * Build similarity edges for visualization
 * @param {Object[]} embeddings - Array of {thread_id, embedding}
 * @param {number} threshold - Minimum similarity for an edge
 * @returns {Object[]} Array of {source, target, similarity}
 */
export function buildSimilarityEdges(embeddings, threshold = 0.8) {
  const edges = [];

  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const similarity = cosineSimilarity(embeddings[i].embedding, embeddings[j].embedding);
      if (similarity >= threshold) {
        edges.push({
          source: embeddings[i].thread_id,
          target: embeddings[j].thread_id,
          similarity,
          type: 'similarity',
        });
      }
    }
  }

  return edges;
}

// Export constants
export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
