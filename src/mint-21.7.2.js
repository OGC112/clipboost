(function(){
  function route(){
    return String(location.hash||'#/home').replace(/^#\/?/,'').split(/[?&]/)[0] || 'home';
  }

  function navigate(page){
    const hidden=document.querySelector(`#sidebar [data-page="${page}"]`);
    if(hidden){ hidden.click(); return; }
    location.hash=`#/${page}`;
  }

  function ensureSettingsAccess(){
    const nav=document.querySelector('.mint-nav');
    if(!nav)return;

    let settingsBtn=nav.querySelector('[data-mint-page="settings"]');
    if(!settingsBtn){
      settingsBtn=document.createElement('button');
      settingsBtn.type='button';
      settingsBtn.dataset.mintPage='settings';
      settingsBtn.textContent='Settings';
      settingsBtn.addEventListener('click',()=>navigate('settings'));
      nav.appendChild(settingsBtn);
    }

    document.querySelectorAll('.mint-nav [data-mint-page]').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.mintPage===route());
    });

    const avatar=document.querySelector('.mint-avatar');
    if(avatar && avatar.dataset.settingsBound!=='1'){
      avatar.dataset.settingsBound='1';
      avatar.title='Settings';
      avatar.setAttribute('aria-label','Open Settings');
      avatar.addEventListener('click',()=>navigate('settings'));
    }
  }

  let queued=false;
  function run(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      ensureSettingsAccess();
    });
  }

  new MutationObserver(run).observe(document.getElementById('app'),{childList:true,subtree:true});
  window.addEventListener('hashchange',run);
  window.addEventListener('popstate',run);
  run();
})();
