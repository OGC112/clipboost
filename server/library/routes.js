import { youtubeGet, searchYoutubeCreators, fetchYoutubeUploadsPage, mergeYoutubeVideos, fetchYoutubeCreator } from '../integrations/youtube.js';
import { twitchGet, twitchThumb, searchTwitchCreators, fetchTwitchCreator } from '../integrations/twitch.js';

export function registerLibraryRoutes(app, deps) {
  const { readLibrary, writeLibrary } = deps;

  app.get('/api/library/creators', async (req, res, next) => {
    try { res.json(await readLibrary()); } catch (e) { next(e); }
  });
  
  
  app.get('/api/library/youtube/search', async (req, res, next) => {
    try {
      const query = String(req.query.q || '').trim();
      if (query.length < 2) return res.json({ results: [] });
      const results = await searchYoutubeCreators(query);
      res.json({ results });
    } catch (e) { next(e); }
  });
  
  app.post('/api/library/youtube/creator', async (req, res, next) => {
    try {
      const creator = await fetchYoutubeCreator(req.body?.input);
      const library = await readLibrary();
      const existing = library.creators.findIndex(c => c.platform === 'youtube' && c.id === creator.id);
      if (existing >= 0) library.creators[existing] = creator;
      else library.creators.unshift(creator);
      await writeLibrary(library);
      res.json({ creator, library });
    } catch (e) { next(e); }
  });
  
  app.post('/api/library/youtube/refresh/:channelId', async (req, res, next) => {
    try {
      const library = await readLibrary();
      const previous = library.creators.find(c => c.platform === 'youtube' && c.id === req.params.channelId) || null;
      const creator = await fetchYoutubeCreator(req.params.channelId, previous);
      const existing = library.creators.findIndex(c => c.platform === 'youtube' && c.id === creator.id);
      if (existing >= 0) library.creators[existing] = creator;
      else library.creators.unshift(creator);
      await writeLibrary(library);
      res.json({ creator, library });
    } catch (e) { next(e); }
  });
  
  app.post('/api/library/youtube/load-more/:channelId', async (req, res, next) => {
    try {
      const library = await readLibrary();
      const index = library.creators.findIndex(c => c.platform === 'youtube' && c.id === req.params.channelId);
      if (index < 0) throw Object.assign(new Error('YouTube creator not found in library.'), { status: 404 });
      let creator = library.creators[index];
  
      // Robust history loading: do not depend on a previously persisted page token.
      // We rebuild the cursor from the oldest upload already present, then return up
      // to 50 uploads older than that boundary. This survives restarts/migrations.
      if (!creator.uploadsPlaylistId) {
        const channels = await youtubeGet('channels', { part: 'snippet,contentDetails,statistics', id: creator.id });
        const channel = channels.items?.[0];
        if (!channel) throw Object.assign(new Error('YouTube channel could not be refreshed.'), { status: 404 });
        creator.uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads || null;
        creator.videoCount = Number(channel.statistics?.videoCount || creator.videoCount || 0);
        creator.avatar = channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || creator.avatar || null;
        creator.name = channel.snippet?.title || creator.name;
        if (!creator.uploadsPlaylistId) throw Object.assign(new Error('This channel does not expose an uploads playlist.'), { status: 400 });
      }
  
      const existing = Array.isArray(creator.videos) ? creator.videos : [];
      const existingIds = new Set(existing.map(v => v?.id).filter(Boolean));
      const oldestLoadedMs = existing.reduce((min, v) => {
        const t = new Date(v?.publishedAt || 0).getTime();
        return t && t < min ? t : min;
      }, Infinity);
  
      let pageToken = null;
      let collected = [];
      let scannedPages = 0;
      let reachedBoundary = !Number.isFinite(oldestLoadedMs);
      let hasMore = false;
  
      while (scannedPages < 30 && collected.length < 50) {
        const page = await fetchYoutubeUploadsPage(creator.uploadsPlaylistId, pageToken);
        scannedPages += 1;
        const videos = page.videos || [];
  
        for (const video of videos) {
          const publishedMs = new Date(video.publishedAt || 0).getTime();
          if (!reachedBoundary) {
            if (publishedMs < oldestLoadedMs) reachedBoundary = true;
            else continue;
          }
          if (!existingIds.has(video.id) && collected.length < 50) collected.push(video);
        }
  
        pageToken = page.nextPageToken || null;
        if (!pageToken) { hasMore = false; break; }
        hasMore = true;
      }
  
      creator.videos = mergeYoutubeVideos(collected, existing);
      creator.youtubeHistoryInitialized = true;
      creator.youtubeNextPageToken = hasMore ? 'stateless' : null;
      creator.refreshedAt = new Date().toISOString();
      library.creators[index] = creator;
      await writeLibrary(library);
  
      res.json({ creator, library, loaded: collected.length, done: !hasMore, mode: 'older-than-oldest' });
    } catch (e) { next(e); }
  });
  
  app.get('/api/library/twitch/search', async (req, res, next) => {
    try {
      const query = String(req.query.q || '').trim();
      if (query.length < 2) return res.json({ results: [] });
      res.json({ results: await searchTwitchCreators(query) });
    } catch (e) { next(e); }
  });
  
  app.post('/api/library/twitch/creator', async (req, res, next) => {
    try {
      const creator = await fetchTwitchCreator(req.body?.input);
      const library = await readLibrary();
      const existing = library.creators.findIndex(c => c.platform === 'twitch' && c.id === creator.id);
      if (existing >= 0) library.creators[existing] = creator;
      else library.creators.unshift(creator);
      await writeLibrary(library);
      res.json({ creator, library });
    } catch (e) { next(e); }
  });
  
  app.post('/api/library/twitch/refresh/:userId', async (req, res, next) => {
    try {
      const library = await readLibrary();
      const existingCreator = library.creators.find(c => c.platform === 'twitch' && c.id === req.params.userId);
      if (!existingCreator) throw Object.assign(new Error('Twitch creator not found in library.'), { status: 404 });
      const creator = await fetchTwitchCreator(existingCreator.login || existingCreator.handle || existingCreator.name, existingCreator);
      const existing = library.creators.findIndex(c => c.platform === 'twitch' && c.id === creator.id);
      if (existing >= 0) library.creators[existing] = creator;
      else library.creators.unshift(creator);
      await writeLibrary(library);
      res.json({ creator, library });
    } catch (e) { next(e); }
  });
  
  app.post('/api/library/twitch/live', async (req, res, next) => {
    try {
      const library = await readLibrary();
      const twitchCreators = library.creators.filter(c => c.platform === 'twitch' && c.id);
      if (!twitchCreators.length) return res.json({ library, liveCount: 0, refreshedAt: new Date().toISOString() });
  
      // Twitch supports multiple user_id parameters on Get Streams. Refreshing all
      // followed streamers in one request keeps Live fast and avoids re-fetching
      // VODs/clips just to know who is online.
      const ids = twitchCreators.map(c => c.id).slice(0, 100);
      const streamsRes = await twitchGet('streams', { user_id: ids, first: 100 });
      const streams = streamsRes.data || [];
      const byUser = new Map(streams.map(s => [String(s.user_id), s]));
      const refreshedAt = new Date().toISOString();
  
      library.creators = library.creators.map(c => {
        if (c.platform !== 'twitch') return c;
        const stream = byUser.get(String(c.id)) || null;
        if (!stream) {
          return { ...c, isLive: false, live: null, refreshedAt };
        }
        return {
          ...c,
          isLive: true,
          title: stream.title || c.title || null,
          gameName: stream.game_name || c.gameName || null,
          live: {
            id: stream.id,
            title: stream.title || 'Live stream',
            viewerCount: Number(stream.viewer_count || 0),
            startedAt: stream.started_at || null,
            gameName: stream.game_name || null,
            thumbnail: twitchThumb(stream.thumbnail_url)
          },
          refreshedAt
        };
      });
  
      await writeLibrary(library);
      res.json({ library, liveCount: streams.length, refreshedAt });
    } catch (e) { next(e); }
  });
  
  async function refreshLibraryPlatform(platform) {
    const library = await readLibrary();
    const targets = library.creators.filter(c => c.platform === platform && c.id);
    let refreshed = 0;
    const errors = [];
  
    // Keep this sequential. It avoids bursty API usage and makes YouTube quota
    // consumption predictable while still refreshing every followed creator.
    for (const existingCreator of targets) {
      try {
        const fresh = platform === 'youtube'
          ? await fetchYoutubeCreator(existingCreator.id, existingCreator)
          : await fetchTwitchCreator(existingCreator.login || existingCreator.handle || existingCreator.name, existingCreator);
        const index = library.creators.findIndex(c => c.platform === platform && c.id === fresh.id);
        if (index >= 0) library.creators[index] = fresh;
        else library.creators.unshift(fresh);
        refreshed += 1;
      } catch (error) {
        errors.push({
          id: existingCreator.id,
          name: existingCreator.name || existingCreator.login || existingCreator.handle || existingCreator.id,
          error: error?.message || 'Refresh failed'
        });
      }
    }
  
    await writeLibrary(library);
    return { library, refreshed, errors, refreshedAt:new Date().toISOString() };
  }
  
  app.post('/api/library/youtube/refresh-all', async (req, res, next) => {
    try { res.json(await refreshLibraryPlatform('youtube')); } catch (e) { next(e); }
  });
  
  app.post('/api/library/twitch/refresh-all', async (req, res, next) => {
    try { res.json(await refreshLibraryPlatform('twitch')); } catch (e) { next(e); }
  });
  
  app.delete('/api/library/creators/:platform/:id', async (req, res, next) => {
    try {
      const library = await readLibrary();
      library.creators = library.creators.filter(c => !(c.platform === req.params.platform && c.id === req.params.id));
      await writeLibrary(library);
      res.json(library);
    } catch (e) { next(e); }
  });
}
