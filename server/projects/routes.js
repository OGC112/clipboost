import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

export function registerProjectRoutes(app, deps) {
  const {
    readLibrary,
    writeMeta,
    readMeta,
    startExternalIngestion,
    metaDir,
    recoverInterruptedProject,
    projectTaskIsActive,
    stopProjectProcesses,
    deletedProjectIds,
    storageRoot,
    uploadsDir,
    previewsDir,
    trackingDir,
    processingStatus
  } = deps;

  app.post('/api/projects/from-library', async (req, res, next) => {
    try {
      const platform = String(req.body?.platform || '').trim();
      const creatorId = String(req.body?.creatorId || '').trim();
      const mediaType = String(req.body?.mediaType || '').trim();
      const mediaId = String(req.body?.mediaId || '').trim();
      if (!['youtube','twitch'].includes(platform) || !creatorId || !mediaId) {
        return res.status(400).json({ error: 'Invalid Library source.' });
      }
      const library = await readLibrary();
      const creator = library.creators.find(c => c.platform === platform && c.id === creatorId);
      if (!creator) return res.status(404).json({ error: 'Creator not found in Library.' });
      let item = null;
      if (platform === 'youtube') item = (creator.videos || []).find(v => String(v.id) === mediaId);
      else if (mediaType === 'clip') item = (creator.clips || []).find(v => String(v.id) === mediaId);
      else item = (creator.vods || []).find(v => String(v.id) === mediaId);
      if (!item) return res.status(404).json({ error: 'Video source not found in Library.' });
  
      const id = crypto.randomUUID();
      const meta = {
        id,
        originalName: item.title || `${creator.name} source`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'linked',
        details: { duration: Number(item.duration || 0) },
        candidates: [],
        externalSource: {
          platform,
          mediaType: platform === 'youtube' ? 'video' : mediaType,
          id: String(item.id),
          url: item.url || null,
          thumbnail: item.thumbnail || null,
          title: item.title || null,
          creatorName: creator.name || creator.login || creator.handle || 'Creator',
          creatorId: creator.id,
          creatorHandle: creator.handle || creator.login || null,
          publishedAt: item.publishedAt || item.createdAt || null,
          viewCount: Number(item.viewCount || 0)
        }
      };
      await writeMeta(meta);
      res.json(meta);
    } catch (e) { next(e); }
  });
  
  
  app.post('/api/projects/:id/ingest', async (req, res, next) => {
    try {
      const meta = await readMeta(req.params.id);
      if (!meta.externalSource?.url) return res.status(400).json({ error: 'This project is not linked to a Library source.' });
      if (meta.sourcePath && fsSync.existsSync(meta.sourcePath)) return res.json(meta);
      if (['ingesting','analyzing'].includes(meta.status)) return res.status(202).json(meta);
      meta.status = 'ingesting';
      delete meta.processingInterruptedAt;
      meta.analysis = { ...(meta.analysis || {}), interrupted:false, error:null };
      meta.ingestion = { ...(meta.ingestion || {}), stage: 'queued', progress: 1, engine: 'yt-dlp', error: null };
      meta.updatedAt = new Date().toISOString();
      await writeMeta(meta);
      setTimeout(() => startExternalIngestion(meta.id), 10);
      res.status(202).json(meta);
    } catch (e) { next(e); }
  });
  
  app.get('/api/projects', async (req, res, next) => {
    try {
      const names = await fs.readdir(metaDir).catch(() => []);
      const projects = [];
      for (const name of names.filter(n => n.endsWith('.json'))) {
        try {
          let meta = JSON.parse(await fs.readFile(path.join(metaDir, name), 'utf8'));
          const recovery = await recoverInterruptedProject(meta).catch(() => ({ meta, recovered:false }));
          meta = recovery.meta;
          projects.push({
            id: meta.id,
            originalName: meta.originalName,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt || meta.createdAt,
            status: meta.status,
            processingActive: projectTaskIsActive(meta.id),
            processingInterrupted: Boolean(recovery.recovered || meta.processingInterruptedAt || meta.analysis?.interrupted),
            details: meta.details || {},
            externalSource: meta.externalSource || null,
            campaignId: meta.campaignId || null,
            campaignName: meta.campaign?.name || null,
            candidateCount: Array.isArray(meta.candidates) ? meta.candidates.length : 0,
            sourceUrl: meta.sourceUrl || null,
            ingestionError: meta.ingestion?.error || null,
            analysisStage: meta.analysis?.stage || null
          });
        } catch {}
      }
      projects.sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      res.json(projects);
    } catch (e) { next(e); }
  });
  
  app.delete('/api/projects/:id', async (req, res, next) => {
    try {
      const meta = await readMeta(req.params.id);
      const stoppedProcesses = stopProjectProcesses(meta.id);
      deletedProjectIds.add(String(meta.id));
      const insideStorage = value => {
        if (!value) return false;
        const resolved = path.resolve(value);
        const rel = path.relative(storageRoot, resolved);
        return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
      };
      if (insideStorage(meta.sourcePath)) await fs.rm(path.resolve(meta.sourcePath), { force:true }).catch(() => {});
      await fs.rm(path.join(storageRoot, 'transcript-cache', meta.id), { recursive:true, force:true }).catch(() => {});
      await fs.rm(path.join(uploadsDir, '.clipboost-cache', 'transcripts', meta.id), { recursive:true, force:true }).catch(() => {});
      const previews = await fs.readdir(previewsDir).catch(() => []);
      await Promise.all(previews.filter(name => name.startsWith(`${meta.id}-`)).map(name => fs.rm(path.join(previewsDir,name), { force:true }).catch(() => {})));
      const tracks = await fs.readdir(trackingDir).catch(() => []);
      await Promise.all(tracks.filter(name => name.startsWith(`${meta.id}-`)).map(name => fs.rm(path.join(trackingDir,name), { force:true }).catch(() => {})));
      await fs.rm(path.join(metaDir, `${meta.id}.json`), { force:true });
      res.json({ ok:true, id:meta.id, processingStopped:processingStatus(meta.status), stoppedProcesses });
    } catch (e) {
      if (e?.code === 'ENOENT') return res.status(404).json({ error:'Project not found.' });
      next(e);
    }
  });
}
