export function youtubeKey() {
  const key = String(process.env.YOUTUBE_API_KEY || '').trim();
  if (!key) throw Object.assign(new Error('YOUTUBE_API_KEY is missing. Add it to .env and restart ClipBoost.'), { status: 503 });
  return key;
}
export async function youtubeGet(endpoint, params = {}) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({ ...params, key: youtubeKey() }).forEach(([k,v]) => v !== undefined && v !== null && url.searchParams.set(k, String(v)));
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `YouTube API request failed (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body;
}
export function parseYoutubeInput(raw = '') {
  const input = String(raw).trim();
  if (!input) throw Object.assign(new Error('Enter a YouTube @handle, channel URL, or channel ID.'), { status: 400 });
  if (/^UC[\w-]{20,}$/i.test(input)) return { id: input };
  if (input.startsWith('@')) return { forHandle: input };
  try {
    const u = new URL(input.includes('://') ? input : `https://${input}`);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'channel' && parts[1]) return { id: parts[1] };
    if (parts[0]?.startsWith('@')) return { forHandle: parts[0] };
    if (parts[0] === 'user' && parts[1]) return { forUsername: parts[1] };
  } catch {}
  return { forHandle: input.startsWith('@') ? input : `@${input.replace(/^@/, '')}` };
}
export function isoDurationToSeconds(value='PT0S') {
  const m = String(value).match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  return (Number(m[1]||0)*86400)+(Number(m[2]||0)*3600)+(Number(m[3]||0)*60)+Number(m[4]||0);
}
export function formatYoutubeVideo(item, details = {}) {
  const snippet = item.snippet || details.snippet || {};
  const videoId = item.contentDetails?.videoId || snippet.resourceId?.videoId || details.id;
  const thumbs = snippet.thumbnails || details.snippet?.thumbnails || {};
  return {
    id: videoId,
    title: snippet.title || details.snippet?.title || 'Untitled video',
    publishedAt: item.contentDetails?.videoPublishedAt || snippet.publishedAt || details.snippet?.publishedAt || null,
    thumbnail: thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null,
    duration: isoDurationToSeconds(details.contentDetails?.duration),
    isShort: isoDurationToSeconds(details.contentDetails?.duration) > 0 && isoDurationToSeconds(details.contentDetails?.duration) <= 180,
    viewCount: Number(details.statistics?.viewCount || 0),
    likeCount: Number(details.statistics?.likeCount || 0),
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
  };
}

const youtubeSearchCache = new Map();
export function youtubeChannelSummary(channel) {
  const thumbnails = channel.snippet?.thumbnails || {};
  return {
    platform: 'youtube',
    id: channel.id,
    handle: channel.snippet?.customUrl || null,
    name: channel.snippet?.title || 'YouTube creator',
    description: channel.snippet?.description || '',
    avatar: thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null,
    subscribers: Number(channel.statistics?.subscriberCount || 0),
    totalViews: Number(channel.statistics?.viewCount || 0),
    videoCount: Number(channel.statistics?.videoCount || 0),
    channelUrl: channel.snippet?.customUrl ? `https://www.youtube.com/${channel.snippet.customUrl}` : `https://www.youtube.com/channel/${channel.id}`
  };
}
export async function searchYoutubeCreators(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (query.length < 2) return [];
  const cacheKey = query.toLowerCase();
  const cached = youtubeSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.results;

  const parsed = parseYoutubeInput(query);
  const looksExact = query.startsWith('@') || /^UC[\w-]{20,}$/i.test(query) || /youtube\.com/i.test(query);
  let channels = [];
  if (looksExact) {
    const exact = await youtubeGet('channels', { part: 'snippet,statistics', ...parsed });
    channels = exact.items || [];
  } else {
    const search = await youtubeGet('search', { part: 'snippet', type: 'channel', q: query, maxResults: 6 });
    const ids = (search.items || []).map(item => item.snippet?.channelId || item.id?.channelId).filter(Boolean);
    if (ids.length) {
      const details = await youtubeGet('channels', { part: 'snippet,statistics', id: ids.join(',') });
      const map = new Map((details.items || []).map(c => [c.id, c]));
      channels = ids.map(id => map.get(id)).filter(Boolean);
    }
  }
  const results = channels.map(youtubeChannelSummary);
  youtubeSearchCache.set(cacheKey, { at: Date.now(), results });
  return results;
}
export async function fetchYoutubeUploadsPage(playlistId, pageToken = null) {
  if (!playlistId) return { videos: [], nextPageToken: null };
  const playlist = await youtubeGet('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: 50,
    pageToken: pageToken || undefined
  });
  const ids = (playlist.items || []).map(x => x.contentDetails?.videoId || x.snippet?.resourceId?.videoId).filter(Boolean);
  let detailMap = new Map();
  if (ids.length) {
    const details = await youtubeGet('videos', { part: 'snippet,contentDetails,statistics', id: ids.join(',') });
    detailMap = new Map((details.items || []).map(v => [v.id, v]));
  }
  const videos = (playlist.items || []).map(item => {
    const id = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
    const details = detailMap.get(id);
    return details ? formatYoutubeVideo(item, details) : null;
  }).filter(Boolean);
  return { videos, nextPageToken: playlist.nextPageToken || null };
}

export function youtubeRecentCutoffDate() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d;
}

export async function fetchYoutubeRecentWindow(playlistId) {
  const cutoff = youtubeRecentCutoffDate();
  let pageToken = null;
  let nextPageToken = null;
  let videos = [];
  let pages = 0;
  // Upload playlists are newest-first. Fetch only until we cross the 3-month
  // boundary, then keep the returned nextPageToken for explicit older-history loading.
  do {
    const page = await fetchYoutubeUploadsPage(playlistId, pageToken);
    videos = mergeYoutubeVideos(videos, page.videos || []);
    nextPageToken = page.nextPageToken || null;
    pages += 1;
    const oldest = (page.videos || []).reduce((min, v) => {
      const t = new Date(v.publishedAt || 0).getTime();
      return t && t < min ? t : min;
    }, Infinity);
    if (!nextPageToken || oldest <= cutoff.getTime()) break;
    pageToken = nextPageToken;
  } while (pages < 20);
  return { videos, nextPageToken, cutoff: cutoff.toISOString(), pages };
}

export function mergeYoutubeVideos(fresh = [], existing = []) {
  const map = new Map();
  for (const video of [...fresh, ...existing]) if (video?.id && !map.has(video.id)) map.set(video.id, video);
  return [...map.values()].sort((a,b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

export async function fetchYoutubeCreator(input, existingCreator = null) {
  const filter = parseYoutubeInput(input);
  const channels = await youtubeGet('channels', { part: 'snippet,contentDetails,statistics', ...filter });
  const channel = channels.items?.[0];
  if (!channel) throw Object.assign(new Error('YouTube channel not found. Try its @handle or /channel/ URL.'), { status: 404 });
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  const recentWindow = await fetchYoutubeRecentWindow(uploads);
  const thumbnails = channel.snippet?.thumbnails || {};
  const previousVideos = existingCreator?.id === channel.id ? (existingCreator.videos || []) : [];
  return {
    platform: 'youtube',
    id: channel.id,
    handle: channel.snippet?.customUrl || null,
    name: channel.snippet?.title || 'YouTube creator',
    description: channel.snippet?.description || '',
    avatar: thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null,
    subscribers: Number(channel.statistics?.subscriberCount || 0),
    totalViews: Number(channel.statistics?.viewCount || 0),
    videoCount: Number(channel.statistics?.videoCount || 0),
    channelUrl: channel.snippet?.customUrl ? `https://www.youtube.com/${channel.snippet.customUrl}` : `https://www.youtube.com/channel/${channel.id}`,
    uploadsPlaylistId: uploads || null,
    videos: mergeYoutubeVideos(recentWindow.videos, previousVideos),
    youtubeNextPageToken: recentWindow.nextPageToken,
    youtubeHistoryInitialized: true,
    youtubeRecentCutoff: recentWindow.cutoff,
    refreshedAt: new Date().toISOString()
  };
}


