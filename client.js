/**
 * Client half of the model-usage panel.
 *
 * Two registrations, no navigation code:
 *  - `sidebar.panellist` contributes the left-sidebar glyph; the shell owns the
 *    button, tooltip, aria state and the click that selects the panel.
 *  - `main` contributes the page keyed by the same id the sidebar row selects.
 *
 * Data comes from the Host half's same-origin JSON route.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-model-usage',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'modelUsage';
    const PANEL_ID = 'model-usage';
    const ENDPOINT = '/api/model-usage';
    const POLL_MS = 1500;

    const DICT = {
      zh: {
        'nav': '模型用量',
        'title': '模型用量',
        'intro': '本机统计：按模型汇总会话中的 Token 消耗与请求次数。',
        'current': '当前模型',
        'currentNone': '未选择模型',
        'reasoning': '推理强度',
        'usage': '用量统计',
        'catalog': '已配置模型',
        'model': '模型',
        'provider': '提供方',
        'requests': '请求',
        'input': '输入',
        'output': '输出',
        'cacheRead': '缓存读取',
        'reasoningTokens': '推理',
        'total': '合计',
        'lastUsed': '最近使用',
        'refresh': '重新统计',
        'loading': '读取中…',
        'idle': '尚未统计',
        'scanning': '正在统计会话…',
        'ready': '统计完成',
        'empty': '还没有记录到模型调用。',
        'failed': '读取失败',
        'sessions': '会话',
        'generatedAt': '更新于',
        'note': '数据来自本机会话日志（assistant/message 事件），不包含其它设备或已删除的会话。',
      },
      en: {
        'nav': 'Model usage',
        'title': 'Model usage',
        'intro': 'Counted on this machine: tokens and requests per model across sessions.',
        'current': 'Current model',
        'currentNone': 'No model selected',
        'reasoning': 'Reasoning effort',
        'usage': 'Usage',
        'catalog': 'Configured models',
        'model': 'Model',
        'provider': 'Provider',
        'requests': 'Requests',
        'input': 'Input',
        'output': 'Output',
        'cacheRead': 'Cache read',
        'reasoningTokens': 'Reasoning',
        'total': 'Total',
        'lastUsed': 'Last used',
        'refresh': 'Rescan',
        'loading': 'Loading…',
        'idle': 'Not counted yet',
        'scanning': 'Scanning sessions…',
        'ready': 'Up to date',
        'empty': 'No model calls recorded yet.',
        'failed': 'Could not read usage',
        'sessions': 'Sessions',
        'generatedAt': 'Updated',
        'note': 'Derived from local session logs (assistant/message events); other devices and deleted sessions are not included.',
      },
    };

    const CSS = [
      '.mu_page{box-sizing:border-box;height:100%;display:flex;flex-direction:column;align-items:center;gap:24px;padding:0 clamp(24px,4vw,48px) 48px;overflow:auto;color:var(--dsw-alias-label-primary)}',
      '.mu_page>*{width:100%;max-width:960px}',
      '.mu_head{padding-top:28px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
      '.mu_title{margin:0;font-size:20px;font-weight:500;line-height:28px}',
      '.mu_intro{margin:4px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.mu_actions{display:flex;align-items:center;gap:8px;flex:none}',
      '.mu_status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.mu_btn{font:inherit;font-size:13px;line-height:20px;padding:5px 12px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.mu_btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.mu_btn:disabled{opacity:.55;cursor:default}',
      '.mu_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:var(--dsw-radius-lg);padding:16px;box-sizing:border-box}',
      '.mu_cardHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}',
      '.mu_cardTitle{margin:0;font-size:14px;font-weight:500;line-height:22px}',
      '.mu_kv{display:flex;flex-wrap:wrap;gap:8px 32px}',
      '.mu_kv>div{display:flex;flex-direction:column;gap:2px;min-width:140px}',
      '.mu_k{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.mu_v{font-size:14px;line-height:22px;font-weight:500;overflow-wrap:anywhere}',
      '.mu_tbl{width:100%;border-collapse:collapse}',
      '.mu_tbl th{text-align:left;font-weight:500;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);padding:0 10px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}',
      '.mu_tbl td{padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:13px;line-height:20px;font-variant-numeric:tabular-nums}',
      '.mu_tbl tr:last-child td{border-bottom:0}',
      '.mu_tbl .mu_num{text-align:right;white-space:nowrap}',
      '.mu_name{display:block;font-weight:500;overflow-wrap:anywhere}',
      '.mu_mono{display:block;font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}',
      '.mu_muted{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:0}',
      '.mu_note{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.mu_err{margin:0;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}',
      '.mu_bar{height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);overflow:hidden;margin-top:10px}',
      '.mu_bar>i{display:block;height:100%;background:var(--dsw-alias-brand-primary);transition:width .3s ease}',
      '.mu_chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.mu_chip{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);padding:2px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
    ].join('\n');

    /** The sidebar row renders this glyph only; `size` and `active` are ours. */
    function PanelIcon({ size, active }) {
      const px = typeof size === 'number' ? size : 18;
      return h(
        'svg',
        {
          width: px,
          height: px,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: active ? 2 : 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', { d: 'M4 20V10' }),
        h('path', { d: 'M10 20V4' }),
        h('path', { d: 'M16 20v-7' }),
        h('path', { d: 'M22 20H2' }),
      );
    }

    const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    const fmt = (value) => number(value).toLocaleString();
    const compact = (value) => {
      const n = number(value);
      if (n < 1000) return String(n);
      if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K`;
      if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)}M`;
      return `${(n / 1e9).toFixed(1)}B`;
    };
    const when = (value) => {
      const n = number(value);
      if (!n) return '—';
      try {
        return new Date(n).toLocaleString();
      } catch {
        return '—';
      }
    };

    function UsageTable({ rows, t }) {
      return h(
        'table',
        { className: 'mu_tbl' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, t('model')),
            h('th', { className: 'mu_num' }, t('requests')),
            h('th', { className: 'mu_num' }, t('input')),
            h('th', { className: 'mu_num' }, t('output')),
            h('th', { className: 'mu_num' }, t('cacheRead')),
            h('th', { className: 'mu_num' }, t('reasoningTokens')),
            h('th', { className: 'mu_num' }, t('total')),
            h('th', null, t('lastUsed')),
          ),
        ),
        h(
          'tbody',
          null,
          rows.map((row) => {
            const key = `${row.provider}\u0000${row.model}`;
            return h(
              'tr',
              { key },
              h(
                'td',
                null,
                h('span', { className: 'mu_name' }, row.model || '—'),
                h('span', { className: 'mu_mono' }, row.provider || '—'),
              ),
              h('td', { className: 'mu_num' }, fmt(row.requests)),
              h('td', { className: 'mu_num' }, compact(row.inputTokens)),
              h('td', { className: 'mu_num' }, compact(row.outputTokens)),
              h('td', { className: 'mu_num' }, row.cacheReadTokens ? compact(row.cacheReadTokens) : '—'),
              h('td', { className: 'mu_num' }, row.reasoningTokens ? compact(row.reasoningTokens) : '—'),
              h('td', { className: 'mu_num' }, compact(row.totalTokens)),
              h('td', null, when(row.lastUsedAt)),
            );
          }),
        ),
      );
    }

    function CatalogTable({ catalog, t }) {
      return h(
        'table',
        { className: 'mu_tbl' },
        h('thead', null, h('tr', null, h('th', null, t('provider')), h('th', null, t('model')))),
        h(
          'tbody',
          null,
          catalog.flatMap((provider) => {
            const models = Array.isArray(provider.models) && provider.models.length > 0 ? provider.models : [null];
            return models.map((model, index) =>
              h(
                'tr',
                { key: `${provider.id}:${model ? model.id : index}` },
                h('td', null, index === 0 ? h('span', { className: 'mu_name' }, provider.name || provider.id) : null),
                h(
                  'td',
                  null,
                  model
                    ? [
                        h('span', { key: 'n', className: 'mu_name' }, model.name || model.id),
                        model.name && model.name !== model.id
                          ? h('span', { key: 'i', className: 'mu_mono' }, model.id)
                          : null,
                      ]
                    : h('span', { className: 'mu_muted' }, '—'),
                ),
              ),
            );
          }),
        ),
      );
    }

    function Page(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const alive = React.useRef(true);
      const timer = React.useRef(0);
      const polls = React.useRef(0);

      React.useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
          if (timer.current) clearTimeout(timer.current);
        };
      }, []);

      const load = React.useCallback(
        (options) => {
          const scan = Boolean(options && options.scan);
          if (scan) polls.current = 0;
          setBusy(true);
          const url = scan ? `${ENDPOINT}?action=scan` : ENDPOINT;
          fetch(url, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((payload) => {
              if (!alive.current) return;
              if (!payload || payload.ok !== true) throw new Error((payload && payload.error) || 'bad payload');
              setData(payload);
              setError('');
            })
            .catch((cause) => {
              if (alive.current) setError(cause && cause.message ? cause.message : String(cause));
            })
            .finally(() => {
              if (!alive.current) return;
              setBusy(false);
              if (scan || (data && data.status === 'scanning')) return;
            });
        },
        [data],
      );

      // First load, then poll only while a scan is running.
      React.useEffect(() => {
        load();
      }, []);

      const scanning = Boolean(data && data.status === 'scanning');
      const settled = Boolean(data && data.status === 'ready');
      const pollKey = data ? `${data.status}:${(data.progress && data.progress.scanned) || 0}` : 'none';
      // Poll until the Host reports a settled snapshot. Keyed on status + progress
      // so each batch schedules the next tick, and safe for a Host that only
      // reports `scanning` on a later response.
      React.useEffect(() => {
        if (!data || settled || error) return undefined;
        if (polls.current > 400) return undefined;
        polls.current += 1;
        timer.current = setTimeout(() => load(), POLL_MS);
        return () => {
          if (timer.current) clearTimeout(timer.current);
        };
      }, [pollKey, settled, error]);

      const rows = data && Array.isArray(data.usage) ? data.usage : [];
      const catalog = data && Array.isArray(data.catalog) ? data.catalog : [];
      const current = (data && data.current) || null;
      const progress = (data && data.progress) || { scanned: 0, total: 0 };
      const ratio = progress.total > 0 ? Math.min(1, progress.scanned / progress.total) : 0;

      return h(
        'div',
        { className: 'mu_page' },
        h('style', null, CSS),
        h(
          'header',
          { className: 'mu_head' },
          h(
            'div',
            null,
            h('h1', { className: 'mu_title' }, t('title')),
            h('p', { className: 'mu_intro' }, t('intro')),
          ),
          h(
            'div',
            { className: 'mu_actions' },
            data
              ? h(
                  'span',
                  { className: 'mu_status' },
                  scanning
                    ? `${t('scanning')} ${progress.scanned}/${progress.total}`
                    : `${t('ready')} · ${t('sessions')} ${data.sessions ?? 0}`,
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'mu_btn',
                disabled: busy || scanning,
                onClick: () => load({ scan: true }),
              },
              scanning ? t('scanning') : t('refresh'),
            ),
          ),
        ),
        error ? h('p', { className: 'mu_err' }, `${t('failed')}：${error}`) : null,
        data && data.error ? h('p', { className: 'mu_err' }, String(data.error)) : null,
        h(
          'section',
          { className: 'mu_card' },
          h(
            'div',
            { className: 'mu_cardHead' },
            h('h2', { className: 'mu_cardTitle' }, t('current')),
          ),
          current
            ? h(
                'div',
                { className: 'mu_kv' },
                h(
                  'div',
                  null,
                  h('span', { className: 'mu_k' }, t('provider')),
                  h('span', { className: 'mu_v' }, current.provider || '—'),
                ),
                h(
                  'div',
                  null,
                  h('span', { className: 'mu_k' }, t('model')),
                  h('span', { className: 'mu_v' }, current.model || '—'),
                ),
                current.reasoningEffort
                  ? h(
                      'div',
                      null,
                      h('span', { className: 'mu_k' }, t('reasoning')),
                      h('span', { className: 'mu_v' }, String(current.reasoningEffort)),
                    )
                  : null,
              )
            : h('p', { className: 'mu_muted' }, data === null ? t('loading') : t('currentNone')),
        ),
        h(
          'section',
          { className: 'mu_card' },
          h(
            'div',
            { className: 'mu_cardHead' },
            h('h2', { className: 'mu_cardTitle' }, t('usage')),
            data && data.generatedAt
              ? h('span', { className: 'mu_status' }, `${t('generatedAt')} ${when(data.generatedAt)}`)
              : null,
          ),
          scanning
            ? h(
                'div',
                null,
                h('p', { className: 'mu_muted' }, `${t('scanning')} ${progress.scanned}/${progress.total}`),
                h('div', { className: 'mu_bar' }, h('i', { style: { width: `${Math.round(ratio * 100)}%` } })),
              )
            : null,
          rows.length > 0
            ? h(UsageTable, { rows, t })
            : h(
                'p',
                { className: 'mu_muted' },
                data === null ? t('loading') : data.status === 'scanning' ? t('scanning') : data.status === 'idle' ? t('idle') : t('empty'),
              ),
          h('p', { className: 'mu_note', style: { marginTop: '12px' } }, t('note')),
        ),
        h(
          'section',
          { className: 'mu_card' },
          h(
            'div',
            { className: 'mu_cardHead' },
            h('h2', { className: 'mu_cardTitle' }, t('catalog')),
            catalog.length > 0
              ? h(
                  'div',
                  { className: 'mu_chips' },
                  catalog.map((provider) =>
                    h('span', { key: provider.id, className: 'mu_chip' }, `${provider.name || provider.id} · ${(provider.models || []).length}`),
                  ),
                )
              : null,
          ),
          catalog.length > 0
            ? h(CatalogTable, { catalog, t })
            : h('p', { className: 'mu_muted' }, data === null ? t('loading') : t('currentNone')),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'model-usage: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 50,
              label: () => t('nav'),
              locale: NS,
            },
            PanelIcon,
          ),
        );
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
            },
            Page,
          ),
        );
      },
    };
  },
});
