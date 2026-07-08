// Web search — grounds GENERAL answers (not brain answers) in current info so
// time-sensitive questions ("who is the CM of Tamil Nadu", prices, "latest ...")
// aren't answered from the model's stale training memory.
//
// Provider is auto-selected by which key is set:
//   1. TAVILY_API_KEY — recommended. Free tier (~1,000 searches/mo), LLM-ready
//      snippets. Get one at https://tavily.com.
//   2. BRAVE_API_KEY  — Brave Search API (has a free tier).
//   3. neither        -> disabled; the app still answers, just from model memory
//      (with today's date injected so at least the framing is right).
//
// This never throws into the request path: any failure returns [] and the reply
// proceeds without web grounding.

const tavilyKey = () => process.env.TAVILY_API_KEY;
const braveKey = () => process.env.BRAVE_API_KEY;

// "auto" (default): search when the question looks like it wants a real-world
// fact. "always": search every general (non-brain) message. "off": never.
const mode = () => (process.env.WEB_SEARCH_MODE || "auto").toLowerCase();

export function webSearchProvider() {
  if (tavilyKey()) return "tavily";
  if (braveKey()) return "brave";
  return null;
}
export function webSearchAvailable() {
  return webSearchProvider() !== null && mode() !== "off";
}

// Quick greetings / obvious creative-or-transform tasks don't need the web.
// Everything else is treated as a possible fact question -> search (in "auto").
const GREETING = /^(hi|hey|hello|yo|sup|thanks|thank you|thx|ok|okay|cool|nice|lol)\b/i;
const TASK_LIKE = /\b(write|compose|draft|rewrite|reword|paraphrase|translate|summari[sz]e|code|coding|debug|refactor|fix (this|the|my)|brainstorm|roleplay|role-play|pretend|act as|poem|story|essay|haiku|joke|song|lyrics|regex|sql|function|script)\b/i;

// Should we run a web search for this (general-path) message?
export function shouldWebSearch(query) {
  if (!webSearchAvailable()) return false;
  const q = (query || "").trim();
  if (q.length < 3) return false;
  if (mode() === "always") return true;
  if (GREETING.test(q)) return false;
  if (TASK_LIKE.test(q)) return false;
  return true; // auto: default to searching factual/informational questions
}

// query -> [{ title, url, content }]  (empty array on any problem).
export async function webSearch(query, { maxResults = 5 } = {}) {
  const provider = webSearchProvider();
  if (!provider) return [];
  try {
    const results = provider === "tavily"
      ? await searchTavily(query, maxResults)
      : await searchBrave(query, maxResults);
    // trim each snippet so the prompt stays lean
    return results
      .filter((r) => r && r.url && (r.title || r.content))
      .slice(0, maxResults)
      .map((r) => ({
        title: (r.title || r.url).slice(0, 160),
        url: r.url,
        content: (r.content || "").replace(/\s+/g, " ").trim().slice(0, 600),
      }));
  } catch (err) {
    console.error("web search failed — answering without it:", err.message);
    return [];
  }
}

async function searchTavily(query, maxResults) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Newer Tavily uses Bearer auth; older accepts api_key in the body. We send
      // both so it works regardless of the account/API version.
      Authorization: `Bearer ${tavilyKey()}`,
    },
    body: JSON.stringify({
      api_key: tavilyKey(),
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.results || []).map((r) => ({ title: r.title, url: r.url, content: r.content }));
}

async function searchBrave(query, maxResults) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": braveKey() },
  });
  if (!res.ok) throw new Error(`Brave (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.web?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.description,
  }));
}

// System prompt that forces the model to answer from the (current) web results
// and to trust them over its own memory for anything time-sensitive.
export function buildWebSearchPrompt(results, today) {
  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
    .join("\n\n");

  return (
    `You are Alim AI. Today's date is ${today}.\n` +
    `Answer using the WEB RESULTS below, which were just retrieved and are current as of today.\n` +
    `RULES:\n` +
    `- These results are more up to date than your training data. When they conflict with what you remember, TRUST THE RESULTS — especially for current officeholders, election outcomes, prices, standings, releases, and anything time-sensitive.\n` +
    `- Lead with the direct, current answer. Be concise — a few sentences or a short list.\n` +
    `- Do NOT say "as of my last update" or give a stale date; use today's date (${today}) as "now".\n` +
    `- Cite sources inline as markdown links like [1](${results[0]?.url || "url"}), matching the numbers below.\n` +
    `- If the results don't actually answer the question, say so plainly, then give your best general answer and note it may be outdated.\n` +
    `- Plain sentences or a short bullet list. No big tables, no raw HTML tags.\n\n` +
    `=== WEB RESULTS (retrieved ${today}) ===\n${context}\n=== END ===`
  );
}
