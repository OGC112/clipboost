const polish = {
  route(){
    return String(location.hash||'#/home').replace(/^#\/?/,'').split(/[?&]/)[0] || 'home';
  },
  heroArt(){
    if(this.route()!=='home') return;
    const hero=document.querySelector('.mint-home-hero');
    if(!hero || hero.querySelector('.mint-hero-art')) return;
    const art=document.createElement('div');
    art.className='mint-hero-art';
    art.setAttribute('aria-hidden','true');
    art.innerHTML=`
      <div class="mint-media-card card-a"><span>9:16</span><i></i><b></b></div>
      <div class="mint-media-card card-b"><span>AI</span><i></i><b></b></div>
      <div class="mint-media-card card-c"><span>LIVE</span><i></i><b></b></div>
      <div class="mint-play-orb">▶</div>
      <div class="mint-spark one">✦</div><div class="mint-spark two">✦</div>
    `;
    hero.appendChild(art);
  },
  studioHeader(){
    if(this.route()!=='studio')return;
    const content=document.querySelector('.mint-studio');
    if(!content)return;
    const main=content.querySelector('.studio-main');
    const controls=content.querySelector('.controls');
    const shortPanel=content.querySelector('.short-panel');
    if(main)main.dataset.mintLabel='Editor';
    if(shortPanel)shortPanel.dataset.mintLabel='Preview';
    if(controls)controls.dataset.mintLabel='AI tools';
  },
  campaign(){
    if(this.route()!=='campaigns')return;
    document.querySelectorAll('.campaign-studio-v2-grid > .card, .campaign-studio-v2-grid > section').forEach(x=>x.classList.add('mint-campaign-light-panel'));
  },
  projects(){
    if(this.route()!=='projects')return;
    const host=document.querySelector('.mint-projects .projects');
    if(!host)return;
    host.querySelectorAll('.project-row').forEach((row,i)=>{
      row.classList.add('mint-project-card');
      if(row.querySelector('.mint-project-badge'))return;
      const meta=row.children?.[1];
      if(meta){
        const badge=document.createElement('span');
        badge.className='mint-project-badge';
        badge.textContent=(meta.textContent||'').includes('Campaign')?'Campaign Studio':'AI Studio';
        meta.prepend(badge);
      }
    });
  },
  results(){
    if(this.route()!=='analytics')return;
    const content=document.querySelector('.mint-analytics');
    if(!content)return;
    const table=content.querySelector('.mint-results-table');
    if(!table || table.querySelector('.mint-results-context'))return;
    const total=[...content.querySelectorAll('.mint-results-kpis b')].reduce((s,x)=>s+(parseFloat((x.textContent||'').replace(/[^0-9.-]/g,''))||0),0);
    if(total===0){
      const empty=document.createElement('div');
      empty.className='mint-results-context';
      empty.innerHTML=`<span class="mint-results-orb">↗</span><div><b>Performance will appear here as soon as you publish and track campaign clips.</b><small>Mint keeps this page factual: no estimated views or invented growth curves are shown before real tracking exists.</small></div>`;
      table.before(empty);
    }
  },
  run(){
    this.heroArt();
    this.studioHeader();
    this.campaign();
    this.projects();
    this.results();
  }
};
let mintPolishQueued=false;
const mintPolishRun=()=>{
  if(mintPolishQueued)return;
  mintPolishQueued=true;
  requestAnimationFrame(()=>{mintPolishQueued=false;try{polish.run()}catch(e){console.warn('Mint polish skipped',e)}});
};
new MutationObserver(mintPolishRun).observe(document.getElementById('app'),{subtree:true,childList:true});
window.addEventListener('hashchange',mintPolishRun);
mintPolishRun();
