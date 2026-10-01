(() => {
  const debounce = (fn, wait = 80) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const hasText = (el, rx) => rx.test(text(el));
  const firstTextMatch = (root, rx) => qsa('*', root).map(text).find((t) => rx.test(t)) || '';
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

  function findTopNav() {
    return qsa('div,nav,header').find((el) => {
      const t = text(el);
      const r = el.getBoundingClientRect();
      return r.top < 120 && r.width > 420 && /Campaign Studio/.test(t) && /AI Studio/.test(t);
    });
  }

  function findButtonByText(root, rx) {
    return qsa('button,a,[role="button"]', root).find((el) => rx.test(text(el)));
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
      const t = text(el);
      const r = el.getBoundingClientRect();
      return t === 'Mint' && r.left < 180 && r.top < 120 && r.width < 220;
    });
    if (brand && !brand.dataset.mintHomeBound) {
      brand.dataset.mintHomeBound = '1';
      brand.classList.add('mint-home-brand');
      brand.addEventListener('click', () => homeBtn?.click());
    }
  }

  function scrapeCampaignData(root) {
    const allText = uniq(qsa('*', root).map(text));
    const joined = allText.join(' | ');
    const find = (rx, fallback = '') => allText.find((t) => rx.test(t)) || fallback;

    let title = find(/^Lionsgate$/i);
    if (!title) {
      const titles = qsa('h2,h3,strong,b', root).map(text).filter((t) => t && !/Campaign Studio|Smart Import|Setup|Manage|Generate|Open page|Edit/i.test(t));
      title = titles.find((t) => /^[A-Z]/.test(t) && t.length < 40) || 'Campaign';
    }

    const provider = find(/clipping\.net/i, 'Campaign workspace');
    const rate = find(/[\d.,]+\s*\$US\s*\/\s*100K views/i, 'Rate unavailable');
    const minimum = find(/^(?:\d+[.,]?\d*K|\d+)$/i, '100K');
    const tracked = find(/^0$/i, '0');
    const setup = find(/\d+%\s*setup/i, '80% setup');
    const deadline = find(/No deadline/i, 'No deadline');
    const status = find(/^ACTIVE$/i, 'ACTIVE');
    const brief = find(/No brief saved yet\.|Objective needed/i, 'Add a campaign objective before generating clips.');
    const access = find(/OPEN ACCESS/i, 'OPEN ACCESS');
    const confirmed = find(/0,00\s*\$US/i, '0,00 $US');

    return { title, provider, rate, minimum, tracked, setup, deadline, status, brief, access, confirmed, raw: joined };
  }

  function buildCampaignModal(card, data, root) {
    let modal = root.querySelector('.mint-campaign-analytics-modal');
    if (!modal) {
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
      modal.querySelector('.mint-modal-open-page').onclick = () => findButtonByText(document, /Open page/i)?.click();
    }

    modal.querySelector('.mint-modal-header').innerHTML = `
      <div>
        <div class="mint-modal-eyebrow">Campaign analytics</div>
        <h3>${data.title}</h3>
        <p>${data.provider} · ${data.status} · ${data.access}</p>
      </div>
      <span class="mint-modal-badge">${data.setup}</span>`;

    modal.querySelector('.mint-modal-grid').innerHTML = `
      <div><span>Rate</span><b>${data.rate}</b></div>
      <div><span>Minimum</span><b>${data.minimum}</b></div>
      <div><span>Tracked views</span><b>${data.tracked}</b></div>
      <div><span>Confirmed</span><b>${data.confirmed}</b></div>
      <div><span>Deadline</span><b>${data.deadline}</b></div>
      <div><span>Status</span><b>${data.status}</b></div>`;

    modal.querySelector('.mint-modal-notes').innerHTML = `
      <div class="mint-modal-note-card">
        <span>Campaign brief</span>
        <p>${data.brief}</p>
      </div>
      <div class="mint-modal-note-card">
        <span>Usage</span>
        <p>Review analytics here, then open the editor when you are ready to create campaign-specific clips.</p>
      </div>`;

    modal.classList.add('show');
  }

  function enhanceCampaignStudio() {
    const root = document.querySelector('.campaigns-page');
    if (!root) return;
    root.classList.add('mint-campaign-overhauled');

    const importSection = root.querySelector('.campaign-import') || qsa('section,div', root).find((el) => /Smart Import/i.test(text(el)) && /Paste campaign URL/i.test(text(el)));
    const largeLayout = root.querySelector('.campaign-layout-real');
    if (largeLayout) largeLayout.classList.add('mint-original-campaign-layout');

    let section = root.querySelector('.mint-campaign-card-section');
    if (!section) {
      section = document.createElement('section');
      section.className = 'mint-campaign-card-section';
      section.innerHTML = `
        <div class="mint-campaign-cards-head">
          <div>
            <div class="eyebrow">Campaign manager</div>
            <h2>Campaign cards</h2>
            <p>Each campaign becomes one clear card. Click a card to open centered analytics.</p>
          </div>
        </div>
        <div class="mint-campaign-card-grid"></div>`;
      (importSection?.parentNode || root).insertBefore(section, (largeLayout || importSection)?.nextSibling || root.lastChild);
    }

    const grid = section.querySelector('.mint-campaign-card-grid');
    grid.innerHTML = '';

    const data = scrapeCampaignData(root);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'mint-campaign-card-v152';
    card.innerHTML = `
      <div class="mint-campaign-card-top">
        <span class="state">${data.status}</span>
        <span class="provider">${data.provider}</span>
      </div>
      <h3>${data.title}</h3>
      <p>${data.brief}</p>
      <div class="mint-campaign-stat-strip">
        <div><span>Rate</span><b>${data.rate}</b></div>
        <div><span>Minimum</span><b>${data.minimum}</b></div>
        <div><span>Tracked</span><b>${data.tracked}</b></div>
      </div>
      <div class="mint-campaign-card-foot">
        <span>${data.setup}</span>
        <strong>Open analytics →</strong>
      </div>`;
    card.onclick = () => buildCampaignModal(card, data, root);
    grid.appendChild(card);
  }

  function enhanceResults() {
    const root = document.querySelector('.mint-results-nb-v1418');
    if (!root) return;
    root.classList.add('mint-results-overhauled');

    const summary = root.querySelector('.mint-results-summary-v1418');
    if (summary) {
      Array.from(summary.children).forEach((item) => item.classList.add('mint-result-summary-card'));
    }

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

    const uploadCard = root.querySelector('.upload-card');
    if (uploadCard) uploadCard.classList.add('mint-upload-strip-v152');

    const source = main.querySelector('.mint-studio-source-v142');
    const timeline = main.querySelector('.mint-studio-timeline-card-v142');
    if (source && timeline) {
      main.classList.add('mint-studio-main-organized-v152');
      main.appendChild(source);
      main.appendChild(timeline);
    }
  }

  const run = debounce(() => {
    try { enhanceNav(); } catch (e) {}
    try { enhanceCampaignStudio(); } catch (e) {}
    try { enhanceResults(); } catch (e) {}
    try { enhanceAIStudio(); } catch (e) {}
  }, 80);

  const boot = () => {
    run();
    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', run);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
