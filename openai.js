import { getApiKey } from './storage.js';

const CLASSIFIER_MODEL = 'gpt-4o-mini';

async function classifyThread(threadPayload, customColumns = []) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.warn('OpenAI API key not configured; skipping classification.');
    return null;
  }

  const messages = buildMessages(threadPayload, customColumns);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CLASSIFIER_MODEL,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI classification failed: ${errorText}`);
  }

  const completion = await response.json();
  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to parse OpenAI response', err, raw);
    return null;
  }
}

function buildMessages(threadPayload, customColumns) {
  const instructions = `You classify AI chat threads based on the title and first user message. Return a JSON object with these fields:

REQUIRED FIELDS:
- ai_summary: 1-2 sentence summary of what the user is asking about
- status: One of "new", "in_progress", "complete", "on_hold", "abandoned"
  - Default to "in_progress" since we only see the opening message
  - Use "new" if it's clearly just starting exploration

- category: Primary category, one of: "work", "personal", "home", "hobbies", "finance", "health", "learning", "admin", "other"

- tags: Array of 1-5 specific topic tags. Use lowercase, can include:
  - Technology: "coding", "debugging", "architecture", "devops", "ai", "web", "mobile", "data"
  - Work: "meeting", "email", "project", "planning", "review", "documentation"
  - Personal: "travel", "recipes", "shopping", "relationships", "entertainment"
  - Finance: "taxes", "investing", "budgeting", "banking"
  - Learning: "research", "tutorial", "course", "reading"
  - Create new relevant tags as needed

- outcome_prediction: Brief prediction of likely outcome
- progress_stage: Current stage (e.g., "researching", "implementing", "reviewing")
- suggested_next_step: What should happen next
- priority: "high", "medium", "low" based on urgency/importance signals

SENSITIVITY FLAGS (boolean):
- contains_pii, contains_legal_sensitive, contains_customer_sensitive, contains_hr_sensitive, contains_security_or_secrets

Include custom_attributes keyed by provided attributes.`;

  const customRules = customColumns
    .filter((c) => c.enabled)
    .map((c) => `Key: ${c.key}. Type: ${c.type}. Rule: ${c.ai_rule_prompt || 'Infer sensibly.'}`)
    .join('\n');

  const system = `${instructions}\n\nCustom attributes to infer:\n${customRules || 'None'}`;
  const user = JSON.stringify(threadPayload, null, 2);

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export { classifyThread };
