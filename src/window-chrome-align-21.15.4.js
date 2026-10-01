(() => {
  const apply = () => {
    const controls = document.querySelector('.mint-window-controls');
    const gear = document.querySelector('.mint-settings-gear');
    const topbar = document.querySelector('.mint-red-topbar') || document.querySelector('header');

    controls?.classList.add('mint-corner-controls-v154');
    gear?.classList.add('mint-menu-aligned-gear-v154');
    topbar?.classList.add('mint-topbar-pad-v154');
  };

  const boot = () => {
    apply();
    new MutationObserver(apply).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    window.addEventListener('resize', apply);
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
