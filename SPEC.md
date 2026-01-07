# AI Thread Hub — MVP Product Spec

## 1. Product Overview & Goals
- **Purpose:** Aggregate and analyze AI chats (ChatGPT, Gemini, Claude, etc.) into unified, thread-centric records stored locally.
- **Goals:**
  - One view of threads across providers with summaries, categories, PII/sensitive flags, and outcome status.
  - Simple Chrome extension workflow: scrape open tabs, store locally, classify with OpenAI.
  - Prepare foundations for future meta-threads/graph relationships.

## 2. MVP Scope
### 2.1 Core User Story
> With ChatGPT, Gemini, and Claude tabs open, the user clicks **Sync Now**. The extension scans open tabs, scrapes each supported thread, stores data locally, calls OpenAI to summarize/categorize/flag PII, and shows a list with status, categories, and PII flags.

### 2.2 In-Scope Providers
- **Supported:** ChatGPT, Gemini, Claude.
- **Adapter contract:** detect provider tab, extract `provider_thread_id`, `title`, optional `provider_summary`, enough message text for classification, and any artifacts. Use a simple abstraction so new providers can be added later.

### 2.3 MVP Features
1. **On-demand sync from open tabs**
   - Browser action popup with **Sync Now**.
   - Background scans tabs, dispatches provider scrapers, upserts threads (new vs. update via provider + thread ID).
2. **Local storage**
   - IndexedDB (Dexie or similar). Store threads, messages, artifacts, AI analysis results, and meta-thread associations.
3. **OpenAI API integration**
   - Build compact payload per thread (title, provider summary, selected messages/partial transcript) and call OpenAI (e.g., GPT-4 class models).
   - Single-shot response includes summary, categories/tags, PII flags, status/outcome prediction, suggested next step, and custom attributes. Store results in DB.
   - API key configured locally (settings or tiny proxy), never hard-coded.
4. **Outcome / resolution tracking**
   - Fields: `status` (open/in_progress/resolved/abandoned/unknown), `outcome_prediction`, `progress_stage`, `suggested_next_step`, `user_resolution_note`, `is_ai_inferred_only`.
   - Simple labels in list + basic detail view; user can override AI guess.
5. **PII & business-sensitive detection**
   - Store boolean flags: `contains_pii`, `contains_legal_sensitive`, `contains_customer_sensitive`, `contains_hr_sensitive`, `contains_security_or_secrets`.
6. **Configurable extra columns (custom attributes)**
   - Data model supports arbitrary `attributes` (key/value). Configured via JSON in options or minimal key list UI.
   - Types: boolean or small enum. Optional AI-backed rules via prompt instructions per attribute.
7. **Basic UI**
   - Popup or simple page with thread list (title, provider, summary snippet, status, PII icons) + filters (provider, status, PII/sensitive).
   - Detail pane: full summary, PII flags, outcome prediction, editable `user_resolution_note`.
8. **Meta-thread / case model (data model only)**
   - Entities for `Case` and `CaseThreadLink` (many-to-many). Minimal/no UI; manual linking acceptable placeholder.

## 3. Data Model (MVP)
### ProviderThread
```ts
ProviderThread {
  id: string;                     // internal UUID
  provider: "chatgpt" | "gemini" | "claude" | string;
  provider_thread_id: string;     // derived from URL/DOM
  url: string;

  title: string;
  provider_summary?: string;      // provider-native summary
  ai_summary?: string;            // OpenAI-generated summary

  created_at?: string;            // best-effort from UI
  last_message_at?: string;       // best-effort
  last_synced_at: string;

  status: "open" | "in_progress" | "resolved" | "abandoned" | "unknown";
  outcome_prediction?: string;
  progress_stage?: string;
  suggested_next_step?: string;
  user_resolution_note?: string;
  is_ai_inferred_only: boolean;

  contains_pii: boolean;
  contains_legal_sensitive: boolean;
  contains_customer_sensitive: boolean;
  contains_hr_sensitive: boolean;
  contains_security_or_secrets: boolean;

  attributes: Record<string, string | number | boolean | null>;
}
```

### Message (recommended for MVP)
```ts
Message {
  id: string;
  thread_id: string;              // FK to ProviderThread
  role: "user" | "assistant" | "system" | string;
  text: string;
  created_at?: string;
  index: number;                  // position in thread
}
```

### Artifact
```ts
Artifact {
  id: string;
  thread_id: string;
  type: "document" | "html" | "web_app" | "code" | "other";
  label: string;                  // human-friendly
  url: string;                    // link or identifier
}
```

### Case (meta-thread)
```ts
Case {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "resolved" | "abandoned" | "unknown";
  created_at: string;
  last_updated_at: string;
}
```

### CaseThreadLink
```ts
CaseThreadLink {
  case_id: string;
  thread_id: string;
  relation_type: "exact_same_case" | "related" | "duplicate" | string;
}
```

### CustomColumnConfig (user-defined attributes)
```ts
CustomColumnConfig {
  key: string;                         // e.g., "is_marketing_related"
  label: string;                       // user-friendly name
  type: "boolean" | "enum" | "string";
  enum_values?: string[];
  ai_rule_prompt?: string;             // optional: instruction for AI classifier
  enabled: boolean;
}
```

## 4. OpenAI Classification (MVP)
- Build compact payload per thread: provider, title, provider summary (if any), first N and last M messages or a transcript summary.
- Single-shot classifier response schema:
```json
{
  "ai_summary": "Short summary of the thread...",
  "category": "work/project",
  "tags": ["llm-eval", "typescript"],
  "status": "open",
  "outcome_prediction": "User is still trying to debug an issue...",
  "progress_stage": "debugging",
  "suggested_next_step": "Check logs in staging env...",

  "contains_pii": false,
  "contains_legal_sensitive": true,
  "contains_customer_sensitive": true,
  "contains_hr_sensitive": false,
  "contains_security_or_secrets": false,

  "custom_attributes": {
    "is_marketing_related": false,
    "risk_level": "medium"
  }
}
```
- Extension parses JSON and writes fields into `ProviderThread` and `attributes`.

## 5. Architecture & Key Flows
### 5.1 Components
- **Content scripts (per provider):** run on provider domains; expose `scrapeThread()` returning thread metadata, summary, transcript snippets/messages, and artifacts.
- **Background/service worker:** scans tabs, triggers scrapes, upserts DB entries, calls OpenAI, manages `last_synced_at` and incremental updates.
- **Extension UI:** popup/options page with Sync Now, thread list + filters, detail view, minimal custom-attribute config UI.
- **Storage:** IndexedDB via wrapper (e.g., Dexie).

### 5.2 Sync Flow
1. User clicks **Sync Now**.
2. Background enumerates tabs.
3. For each tab: detect provider by URL, message the provider content script, and scrape thread data.
4. Background upserts `ProviderThread` and `Message` records.
5. If new/changed: build classification payload, call OpenAI, persist results and attributes.

## 6. Future Enhancements / Considerations
- Richer PII types/severity and policy-style filters.
- Full table/grid UX with inline editing, column visibility, saved views, and advanced filtering.
- Meta-threads/graph: auto case grouping via embeddings/LLM, graph of threads/artifacts/cases with related edges.
- Historical deep sync + auto-sync (pagination, hashes, configurable intervals).
- Cross-provider actions (start new chats, send thread context to providers, fork threads).
- Backup/portability: export/import JSON/Markdown; optional cloud sync (e.g., Drive).
