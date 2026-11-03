// Read the live state on each key press; rendering replaces the editor DOM.
export function createEditorKeyboardHandler({ state, render, selectCandidatePreview, exportCurrent, exportAll }) {
  return event => {
    if (event.defaultPrevented || state.uiModal) return;
    if (event.key === 'Escape' && state.campaignAssetBrowser) {
      event.preventDefault();
      state.campaignAssetBrowser = null;
      state.campaignAssetBusy = false;
      render();
      return;
    }
    if (event.key === 'Escape' && state.campaignDetailsOpen) {
      event.preventDefault();
      state.campaignDetailsOpen = false;
      render();
      return;
    }

    const tag = String(event.target?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
    if (state.page !== 'studio' || state.campaignAssetBrowser || state.campaignDetailsOpen ||
        state.addCreatorOpen || state.previewVideo || state.livePlayer) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      if (event.shiftKey) exportAll();
      else exportCurrent();
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
          event.target?.closest?.('video,audio,[role="slider"]')) return;
      const list = state.video?.candidates || [];
      if (!list.length) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = (Math.min(state.selectedCandidate || 0, list.length - 1) + direction + list.length) % list.length;
      selectCandidatePreview(next, { autoplay: false });
    }
  };
}
