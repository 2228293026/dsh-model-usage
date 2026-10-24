/**
 * Host half of the model-usage panel.
 *
 * Serves one read-only JSON endpoint, `/api/model-usage`, that the Client page
 * fetches from the same origin:
 *
 *   GET /api/model-usage            -> current snapshot (starts a scan lazily)
 *   GET /api/model-usage?action=scan -> rescan changed sessions, then snapshot
 *
 * Usage is folded from the only durable source: `assistant/message` session
 * events, whose `data.usage` carries the token counters and whose
 * `data.message.source` names the provider and model. Sessions are read once and
 * cached by their persistence revision, so a restart only rereads what changed.
 */
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Route prefix owned by this plugin. */
const ROUTE = '/api/model-usage';
/** Cache schema version; bump when the folded shape changes. */
const CACHE_VERSION = 1;
/** Sessions folded between event-loop yields during a scan. */
const BATCH = 4;

/** Cordis services that must exist for the endpoint to be mounted at all. */
export const inject = ['webServer'];

export function apply(ctx) {
  const state = {
    status: 'idle', // idle | scanning | ready
    scanned: 0,
    total: 0,
    startedAt: 0,
    finishedAt: 0,
    error: '',
    scan: null,
    current: null,
    catalog: [],
    catalogAt: 0,
  };
  /** sessionId -> { revision, models: Map<key, counters> } */
  const sessions = new Map();
  let cacheFile = '';
  let cacheLoaded = false;
  let dirty = false;

  ctx.effect(() => {
    const reset = () => {
      state.current = null;
      state.catalog = [];
      state.catalogAt = 0;
    };
    const dispose = ctx.on('llm/adapters-updated', reset);
    return () => {
      dispose?.();
    };
  }, 'model-usage: invalidate model catalog');

  /** One model key: provider plus model id, both may contain slashes. */
  const keyOf = (provider, model) => `${provider}\u0000${model}`;
  const splitKey = (key) => {
    const at = key.indexOf('\u0000');
    return at === -1 ? ['', key] : [key.slice(0, at), key.slice(at + 1)];
  };

  const blank = () => ({
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    lastUsedAt: 0,
  });

  /** Fold one `assistant/message` event into a per-session map. */
  const fold = (models, event) => {
    const data = event && event.data;
    const usage = data && data.usage;
    if (!usage) return false;
    const source = data.message && data.message.source;
    if (!source || source.kind !== 'model') return false;
    const key = keyOf(String(source.provider ?? ''), String(source.model ?? ''));
    let row = models.get(key);
    if (!row) {
      row = blank();
      models.set(key, row);
    }
    row.requests += 1;
    row.inputTokens += Number(usage.inputTokens) || 0;
    row.outputTokens += Number(usage.outputTokens) || 0;
    row.cacheReadTokens += Number(usage.cacheReadTokens) || 0;
    row.cacheWriteTokens += Number(usage.cacheWriteTokens) || 0;
    row.reasoningTokens += Number(usage.reasoningTokens) || 0;
    const time = Number(event.time) || 0;
    if (time > row.lastUsedAt) row.lastUsedAt = time;
    return true;
  };

  // Live top-up: the appended event is already durable when this fires.
  ctx.effect(
    () =>
      ctx.on('session/event', (session, event) => {
        if (!event || event.type !== 'assistant/message') return;
        const id = session?.header?.id ?? session?.id;
        if (!id) return;
        let entry = sessions.get(id);
        if (!entry) {
          entry = { revision: undefined, models: new Map() };
          sessions.set(id, entry);
        }
        if (fold(entry.models, event)) dirty = true;
      }),
    'model-usage: live usage top-up',
  );

  const cacheDir = () =>
    path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'plugin-data', 'dsh-model-usage');

  const loadCache = async () => {
    if (cacheLoaded) return;
    cacheLoaded = true;
    try {
      cacheFile = path.join(cacheDir(), 'usage-cache.json');
      const text = await fsp.readFile(cacheFile, 'utf8');
      const parsed = JSON.parse(text);
      if (!parsed || parsed.version !== CACHE_VERSION || typeof parsed.sessions !== 'object') return;
      for (const [id, raw] of Object.entries(parsed.sessions)) {
        if (!raw || typeof raw !== 'object') continue;
        const models = new Map();
        for (const [key, counters] of Object.entries(raw.models || {})) {
          if (!counters || typeof counters !== 'object') continue;
          models.set(key, { ...blank(), ...counters });
        }
        sessions.set(id, { revision: raw.revision, models });
      }
    } catch {
      // A missing or unreadable cache only costs a full rescan.
    }
  };

  const saveCache = async () => {
    if (!cacheFile) return;
    try {
      const out = { version: CACHE_VERSION, savedAt: Date.now(), sessions: {} };
      for (const [id, entry] of sessions) {
        const models = {};
        for (const [key, counters] of entry.models) models[key] = counters;
        out.sessions[id] = { revision: entry.revision, models };
      }
      await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(out), 'utf8');
      await fsp.rename(tmp, cacheFile);
      dirty = false;
    } catch {
      // Persistence is an optimisation; the in-memory fold stays authoritative.
    }
  };

  /** Merged per-model totals across every folded session. */
  const totals = () => {
    const merged = new Map();
    for (const entry of sessions.values()) {
      for (const [key, row] of entry.models) {
        let into = merged.get(key);
        if (!into) {
          into = blank();
          merged.set(key, into);
        }
        into.requests += row.requests || 0;
        into.inputTokens += row.inputTokens || 0;
        into.outputTokens += row.outputTokens || 0;
        into.cacheReadTokens += row.cacheReadTokens || 0;
        into.cacheWriteTokens += row.cacheWriteTokens || 0;
        into.reasoningTokens += row.reasoningTokens || 0;
        if ((row.lastUsedAt || 0) > into.lastUsedAt) into.lastUsedAt = row.lastUsedAt || 0;
      }
    }
    const rows = [...merged.entries()].map(([key, row]) => {
      const [provider, model] = splitKey(key);
      return {
        provider,
        model,
        requests: row.requests,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        reasoningTokens: row.reasoningTokens,
        // Never trust the provider's optional totalTokens: compute it.
        totalTokens: row.inputTokens + row.outputTokens,
        lastUsedAt: row.lastUsedAt || null,
      };
    });
    rows.sort((a, b) => b.totalTokens - a.totalTokens || b.requests - a.requests);
    return rows;
  };

  /** Current selection plus the configured provider/model catalog. */
  const refreshCatalog = async () => {
    const llm = ctx.get('llm');
    if (llm) {
      try {
        const providers = await llm.listProviders();
        const catalog = [];
        for (const provider of providers || []) {
          let models = [];
          try {
            models = (await llm.listModels(provider.id)) || [];
          } catch {
            models = [];
          }
          catalog.push({
            id: provider.id,
            name: provider.name || provider.id,
            models: models.map((model) => ({ id: model.id, name: model.name || model.id })),
          });
        }
        state.catalog = catalog;
        state.catalogAt = Date.now();
      } catch (error) {
        state.error = `模型目录读取失败：${messageOf(error)}`;
      }
    }
    const selection = ctx.get('agentDefaultModel');
    if (selection) {
      try {
        state.current = selection.currentSelection() || null;
      } catch {
        state.current = null;
      }
    }
  };

  /** Fold every session whose persistence revision changed since the cache. */
  const runScan = () => {
    if (state.scan) return state.scan;
    const query = ctx.get('sessionQuery');
    if (!query) {
      state.status = 'ready';
      state.error = 'sessionQuery 服务不可用，无法统计历史用量。';
      return null;
    }
    // The transition must be synchronous: the HTTP response that starts a scan
    // is built in the same tick and has to report `scanning`, or the page stops
    // polling before the first batch lands.
    state.status = 'scanning';
    state.scanned = 0;
    state.total = 0;
    state.startedAt = Date.now();
    state.finishedAt = 0;
    state.error = '';
    const persistence = ctx.get('sessionPersistence');
    const task = (async () => {
      try {
        await loadCache();
        const records = (await query.listSessions()) || [];
        state.total = records.length;
        let processed = 0;
        for (const record of records) {
          const id = record?.header?.id ?? record?.id;
          if (!id) continue;
          let revision;
          if (persistence && typeof persistence.stat === 'function') {
            try {
              revision = (await persistence.stat(id))?.revision;
            } catch {
              revision = undefined;
            }
          }
          const cached = sessions.get(id);
          const fresh = revision !== undefined && cached !== undefined && cached.revision === revision;
          if (!fresh) {
            try {
              const snapshot = await query.readSession(id);
              const models = new Map();
              for (const event of snapshot?.events || []) {
                if (event && event.type === 'assistant/message') fold(models, event);
              }
              sessions.set(id, { revision, models });
              dirty = true;
            } catch {
              // Unreadable sessions are skipped rather than failing the scan.
            }
          }
          processed += 1;
          state.scanned = processed;
          if (processed % BATCH === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        state.status = 'ready';
        state.finishedAt = Date.now();
        if (dirty) await saveCache();
      } catch (error) {
        state.status = 'ready';
        state.finishedAt = Date.now();
        state.error = `统计中断：${messageOf(error)}`;
      }
    })();
    state.scan = task;
    void task.catch(() => {}).then(() => {
      if (state.scan === task) state.scan = null;
    });
    return task;
  };

  const snapshot = () => ({
    ok: true,
    generatedAt: Date.now(),
    status: state.status,
    progress: { scanned: state.scanned, total: state.total },
    startedAt: state.startedAt || null,
    finishedAt: state.finishedAt || null,
    error: state.error || null,
    current: state.current,
    catalog: state.catalog,
    usage: totals(),
    sessions: sessions.size,
  });

  ctx.inject(['llm', 'agentDefaultModel', 'sessionQuery', 'sessionPersistence', 'webServer'], (scoped) => {
    scoped.effect(
      () =>
        scoped.webServer.register({
          kind: 'prefix',
          path: ROUTE,
          handler: async (req, res) => {
            if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
            const method = String(req.method || 'GET').toUpperCase();
            if (method !== 'GET' && method !== 'HEAD') {
              return sendJson(res, 405, { ok: false, error: 'method not allowed' });
            }
            try {
              const url = new URL(String(req.url || '/'), 'http://localhost');
              const action = url.searchParams.get('action');
              if (state.catalog.length === 0 || Date.now() - state.catalogAt > 60_000) await refreshCatalog();
              if (action === 'scan' && state.status !== 'scanning') void runScan();
              else if (state.status === 'idle') void runScan();
              return sendJson(res, 200, snapshot());
            } catch (error) {
              return sendJson(res, 500, { ok: false, error: messageOf(error) });
            }
          },
        }),
      'model-usage: /api/model-usage route',
    );
  });
}

/** Escape hatch used by the single endpoint and the diagnostics branches. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Same-origin guard copied from the shipped plugin pattern. */
function sameOrigin(req) {
  const origin = req?.headers?.origin;
  if (!origin) return true;
  try {
    return new URL(String(origin)).host === String(req.headers.host || '');
  } catch {
    return false;
  }
}

/** Minimal JSON responder for a node:http response. */
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
}
