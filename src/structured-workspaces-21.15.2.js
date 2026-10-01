(() => {
  const debounce = (fn, wait = 80) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  function findTopNav() {
    return qsa('div,nav,header').find((el) => {
      const t = txt(el);
      const r = el.getBoundingClientRect();
      return r.top < 120 && r.width > 420 && /Campaign Studio/.test(t) && /AI Studio/.test(t);
    });
  }

  function findButtonByText(root, rx) {
    return qsa('button,a,[role="button"]', root).find((el) => rx.test(txt(el)));
  }

  function enhanceNav() {
    const topNav = findTopNav();
    if (topNav) topNav.classList.add('mint-nav-xxl');

    const homeBtn = findButtonByText(document, /^Home$/i);
    if (homeBtn) {
      homeBtn.classList.add('mint-hidden-home-nav');
      homeBtn.setAttribute('aria-hidden', 'true');
    }

    const brand = qsa('div,span,strong,h1,a', document).find((el) => {
      const t = txt(el);
      const r = el.getBoundingClientRect();
      return t === 'Mint' && r.left < 180 && r.top < 120 && r.width < 220;
    });

    if (brand && !brand.dataset.mintHomeBound) {
      brand.dataset.mintHomeBound = '1';
      brand.classList.add('mint-home-brand');
      brand.addEventListener('click', () => homeBtn?.click());
    }
  }

  function metricFromCard(card, label) {
    const row = qsa('.campaign-card-metrics span', card).find((el) =>
      txt(el).toLowerCase().includes(label.toLowerCase())
    );
    if (!row) return '—';
    const b = row.querySelector('b');
    return txt(b) || '—';
  }

  function campaignDataFromCard(card) {
    return {
      id: card.getAttribute('data-campaign-select') || '',
      title: txt(card.querySelector(':scope > strong')) || 'Campaign',
      provider: txt(card.querySelector('.campaign-provider')) || 'Campaign',
      status: txt(card.querySelector('.campaign-state')) || 'Active',
      rate: txt(card.querySelector('.campaign-real-payment b')) || '—',
      views: metricFromCard(card, 'views'),
      minimum: metricFromCard(card, 'minimum'),
      confirmed: metricFromCard(card, 'confirmed'),
      deadline: txt(card.querySelector('.campaign-card-footer small')) || '—',
      setup: txt(card.querySelector('.campaign-ready-dot')) || '—'
    };
  }

  function selectedDetailData(root, fallback) {
    const detail = root.querySelector('.campaign-detail');
    if (!detail) return fallback;

    const kpis = qsa('.campaign-primary-kpis > div', detail);
    const earnings = qsa('.campaign-earnings-card > div', detail);

    const readLabeled = (nodes, label, fallbackValue='—') => {
      const node = nodes.find((el) => {
        const span = txt(el.querySelector('span,small'));
        return span.toLowerCase().includes(label.toLowerCase());
      });
      return txt(node?.querySelector('b')) || fallbackValue;
    };

    return {
      ...fallback,
      title: txt(detail.querySelector('.campaign-hero-copy h2')) || fallback.title,
      brief: txt(detail.querySelector('.campaign-brief-preview')) || 'No campaign brief saved yet.',
      payment: readLabeled(kpis, 'Payment', fallback.rate),
      minimum: readLabeled(kpis, 'Minimum', fallback.minimum),
      tracked: readLabeled(kpis, 'Tracked views', fallback.views),
      deadline: readLabeled(kpis, 'Deadline', fallback.deadline),
      estimated: readLabeled(earnings, 'Estimated payout', '—'),
      confirmed: readLabeled(earnings, 'Confirmed payout', fallback.confirmed),
      best: readLabeled(earnings, 'Best clip', '—'),
      average: readLabeled(earnings, 'Average', '—'),
      readiness: txt(detail.querySelector('.campaign-readiness-compact strong')) || fallback.setup
    };
  }

  function ensureModal(root) {
    let modal = root.querySelector('.mint-campaign-analytics-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'mint-campaign-analytics-modal';
    modal.innerHTML = `
      <div class="mint-campaign-analytics-dialog" role="dialog" aria-modal="true" aria-label="Campaign analytics">
        <button type="button" class="mint-modal-close" aria-label="Close">×</button>
        <div class="mint-modal-header"></div>
        <div class="mint-modal-grid"></div>
        <div class="mint-modal-notes"></div>
        <div class="mint-modal-actions">
          <button type="button" class="btn secondary mint-modal-generate">Generate clips</button>
          <button type="button" class="btn secondary mint-modal-open-page">Open page</button>
          <button type="button" class="btn primary mint-modal-close-action">Close</button>
        </div>
      </div>`;

    root.appendChild(modal);

    const close = () => modal.classList.remove('show');
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('.mint-modal-close').onclick = close;
    modal.querySelector('.mint-modal-close-action').onclick = close;
    modal.querySelector('.mint-modal-generate').onclick = () => findButtonByText(document, /Generate clips/i)?.click();
    modal.querySelector('.mint-modal-open-page').onclick = () => findButtonByText(document, /^Open page/i)?.click();

    return modal;
  }

  function openCampaignAnalytics(root, originalCard, fallback) {
    originalCard?.click();

    setTimeout(() => {
      const data = selectedDetailData(root, fallback);
      const modal = ensureModal(root);

      modal.querySelector('.mint-modal-header').innerHTML = `
        <div>
          <div class="mint-modal-eyebrow">Campaign analytics</div>
          <h3>${data.title}</h3>
          <p>${data.provider} · ${data.status}</p>
        </div>
        <span class="mint-modal-badge">${data.readiness || data.setup}</span>`;

      modal.querySelector('.mint-modal-grid').innerHTML = `
        <div><span>Payment</span><b>${data.payment || data.rate}</b></div>
        <div><span>Minimum</span><b>${data.minimum}</b></div>
        <div><span>Tracked views</span><b>${data.tracked || data.views}</b></div>
        <div><span>Estimated payout</span><b>${data.estimated || '—'}</b></div>
        <div><span>Confirmed payout</span><b>${data.confirmed}</b></div>
        <div><span>Deadline</span><b>${data.deadline}</b></div>
        <div><span>Best clip</span><b>${data.best || '—'}</b></div>
        <div><span>Average views</span><b>${data.average || '—'}</b></div>
        <div><span>Setup</span><b>${data.readiness || data.setup}</b></div>`;

      modal.querySelector('.mint-modal-notes').innerHTML = `
        <div class="mint-modal-note-card mint-modal-note-wide">
          <span>Campaign brief</span>
          <p>${data.brief || 'No campaign brief saved yet.'}</p>
        </div>`;

      modal.classList.add('show');
    }, 40);
  }

  function enhanceCampaignStudio() {
    const root = document.querySelector('.campaigns-page');
    if (!root) return;

    root.classList.add('mint-campaign-overhauled');

    const nativeLayout = root.querySelector('.campaign-layout-real');
    if (!nativeLayout) return;

    const nativeCards = qsa('.real-campaign-card', nativeLayout);
    if (!nativeCards.length) return;

    let section = root.querySelector('.mint-campaign-card-section');
    if (!section) {
      section = document.createElement('section');
      section.className = 'mint-campaign-card-section';
      section.innerHTML = `
        <div class="mint-campaign-cards-head">
          <div>
            <div class="eyebrow">CAMPAIGNS</div>
            <h2>Your campaigns</h2>
            <p>Select a campaign to view its analytics or continue into the campaign editor.</p>
          </div>
        </div>
        <div class="mint-campaign-card-grid"></div>`;

      nativeLayout.parentNode.insertBefore(section, nativeLayout);
    }

    const grid = section.querySelector('.mint-campaign-card-grid');
    grid.innerHTML = '';

    nativeCards.forEach((originalCard) => {
      const data = campaignDataFromCard(originalCard);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mint-campaign-card-v152 mint-campaign-card-fixed-v156';
      card.innerHTML = `
        <div class="mint-campaign-card-top">
          <span class="state">${data.status}</span>
          <span class="provider">${data.provider}</span>
        </div>
        <h3>${data.title}</h3>
        <div class="mint-campaign-stat-strip">
          <div><span>Rate</span><b>${data.rate}</b></div>
          <div><span>Minimum</span><b>${data.minimum}</b></div>
          <div><span>Tracked</span><b>${data.views}</b></div>
        </div>
        <div class="mint-campaign-card-foot">
          <span>${data.setup}</span>
          <strong>Open analytics →</strong>
        </div>`;

      card.onclick = () => openCampaignAnalytics(root, originalCard, data);
      grid.appendChild(card);
    });

    nativeLayout.classList.add('mint-original-campaign-layout');
  }

  function enhanceResults() {
    const root = document.querySelector('.mint-results-nb-v1418');
    if (!root) return;
    root.classList.add('mint-results-overhauled');

    const summary = root.querySelector('.mint-results-summary-v1418');
    if (summary) Array.from(summary.children).forEach((item) => item.classList.add('mint-result-summary-card'));

    const list = root.querySelector('.mint-results-list-v1418');
    if (list) {
      list.classList.add('mint-results-performance-board');
      qsa('.mint-results-row-v1418', list).forEach((row) => row.classList.add('mint-results-card-row'));
    }
  }

  function enhanceAIStudio() {
    const root = document.querySelector('.mint-studio-page-v142');
    if (!root) return;
    root.classList.add('mint-studio-overhauled-v152');

    const toolstrip = root.querySelector('.mint-studio-toolstrip-v142');
    if (toolstrip) toolstrip.style.display = 'none';

    const workspace = root.querySelector('.mint-studio-workspace-v142');
    const main = root.querySelector('.mint-studio-main-v142');
    const side = root.querySelector('.mint-studio-side-v142');
    if (!workspace || !main || !side) return;

    if (!side.querySelector('.mint-studio-right-stack-v152')) {
      const stack = document.createElement('div');
      stack.className = 'mint-studio-right-stack-v152';
      const preview = side.querySelector('.mint-preview-card-v142');
      const tools = side.querySelector('.mint-ai-tools-v142');
      if (preview) stack.appendChild(preview);
      if (tools) stack.appendChild(tools);
      side.innerHTML = '';
      side.appendChild(stack);
    }

    root.querySelector('.upload-card')?.classList.add('mint-upload-strip-v152');

    const source = main.querySelector('.mint-studio-source-v142');
    const timeline = main.querySelector('.mint-studio-timeline-card-v142');
    if (source && timeline) {
      main.classList.add('mint-studio-main-organized-v152');
      main.appendChild(source);
      main.appendChild(timeline);
    }
  }

  const run = debounce(() => {
    try { enhanceNav(); } catch {}
    try { enhanceCampaignStudio(); } catch {}
    try { enhanceResults(); } catch {}
    try { enhanceAIStudio(); } catch {}
  }, 80);

  const boot = () => {
    run();
    new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', run);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
