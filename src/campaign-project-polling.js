// Campaign processing lifecycle, independent of modal DOM and editor state.
// Callers own transport and presentation; transport failures propagate unchanged.
export async function waitForCampaignProject({
  readProject,
  onProject,
  onProgress,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  const started = now();
  const timeoutMs = 30 * 60 * 1000;
  while (now() - started < timeoutMs) {
    const data = await readProject();
    onProject(data);
    const status = String(data?.status || '');
    if (['ready', 'degraded'].includes(status)) return data;

    const ingestionStage = String(data?.ingestion?.stage || '').toLowerCase();
    const analysisStage = String(data?.analysis?.stage || '').toLowerCase();
    const ingestionError = String(data?.ingestion?.error || '').trim();
    const analysisError = String(data?.analysis?.error || '').trim();
    if (status === 'failed' || ingestionStage === 'error' || analysisStage === 'error' || ingestionError) {
      throw new Error(analysisError || ingestionError || 'Campaign video processing failed.');
    }
    onProgress(data);
    await sleep(1500);
  }
  throw new Error('Campaign video processing timed out.');
}
