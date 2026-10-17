const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 6000;
const REQUEST_TIMEOUT_MS = 25000;

const PROVIDER_META = {
  gemini: {
    label: "gemini",
    defaultModel: "gemini-2.0-flash",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
  },
  groq: {
    label: "groq",
    defaultModel: "llama-3.3-70b-versatile",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
  },
  openrouter: {
    label: "openrouter",
    defaultModel: "openai/gpt-4o-mini",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
  },
};

function resolveProvider(env) {
  const key = (value) => (typeof value === "string" && value.trim() ? value.trim() : "");
  if (key(env.GEMINI_API_KEY) || key(env.GOOGLE_API_KEY)) {
    return { id: "gemini", apiKey: key(env.GEMINI_API_KEY) || key(env.GOOGLE_API_KEY) };
  }
  if (key(env.GROQ_API_KEY)) return { id: "groq", apiKey: key(env.GROQ_API_KEY) };
  if (key(env.OPENROUTER_API_KEY)) return { id: "openrouter", apiKey: key(env.OPENROUTER_API_KEY) };
  return null;
}

function normalizeMessages(input) {
  const list = Array.isArray(input) ? input : [];
  const cleaned = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "assistant" || item.role === "system" ? item.role : "user";
    const content = String(item.content || "").slice(0, MAX_MESSAGE_CHARS);
    if (!content.trim()) continue;
    cleaned.push({ role, content });
  }
  return cleaned.slice(-MAX_MESSAGES);
}

function toGeminiPayload(messages) {
  const system = messages
    .filter((item) => item.role === "system")
    .map((item) => item.content)
    .join("\n\n");
  const contents = messages
    .filter((item) => item.role !== "system")
    .map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }],
    }));
  const payload = {
    contents,
    generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  return payload;
}

function extractContent(providerId, payload) {
  if (!payload || typeof payload !== "object") return "";
  if (providerId === "gemini") {
    const candidate = Array.isArray(payload.candidates) ? payload.candidates[0] : null;
    const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
    return parts.map((part) => (part && typeof part.text === "string" ? part.text : "")).join("").trim();
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  const content = choice && choice.message ? choice.message.content : "";
  return typeof content === "string" ? content.trim() : "";
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function callGemini({ env, apiKey, messages, signal }) {
  const meta = PROVIDER_META.gemini;
  const model = (env.AI_MODEL || env.GEMINI_MODEL || meta.defaultModel).trim();
  const url = `${meta.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toGeminiPayload(messages)),
    signal,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(`Gemini responded with ${response.status}`);
  }
  return { model, payload };
}

async function callOpenAiCompatible({ env, apiKey, messages, providerId, signal }) {
  const meta = PROVIDER_META[providerId];
  const model = (env.AI_MODEL || (providerId === "groq" ? env.GROQ_MODEL : env.OPENROUTER_MODEL) || meta.defaultModel).trim();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (providerId === "openrouter") {
    headers["HTTP-Referer"] = env.APP_ORIGIN || "https://warq-demo.vercel.app";
    headers["X-Title"] = "WarQ demo";
  }
  const response = await fetch(meta.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: 1024 }),
    signal,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(`${meta.label} responded with ${response.status}`);
  }
  return { model, payload };
}

async function runWithTimeout(task) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method_not_allowed", message: "Use POST." });
    return;
  }

  const provider = resolveProvider(process.env);
  if (!provider) {
    res.status(503).json({
      error: "ai_unconfigured",
      message: "No AI provider key is configured. The WarQ assistant will use its offline answers.",
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const messages = normalizeMessages(body && body.messages);
  if (!messages.length) {
    res.status(400).json({ error: "invalid_request", message: "Provide a non-empty messages array." });
    return;
  }

  try {
    const result = await runWithTimeout(async (signal) => {
      const options = { env: process.env, apiKey: provider.apiKey, messages, signal };
      if (provider.id === "gemini") return callGemini(options);
      return callOpenAiCompatible({ ...options, providerId: provider.id });
    });
    const content = extractContent(provider.id, result.payload);
    if (!content) {
      res.status(502).json({ error: "ai_empty_reply", message: "The model returned an empty reply." });
      return;
    }
    res.status(200).json({ content, provider: provider.id, model: result.model });
  } catch (error) {
    res.status(502).json({
      error: "ai_proxy_failed",
      message: error && error.message ? error.message : "The AI proxy failed.",
    });
  }
}
