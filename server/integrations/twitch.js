export function twitchConfig() {
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('Twitch API is not configured. Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to .env, then restart ClipBoost.'), { status: 503 });
  }
  return { clientId, clientSecret };
}

let twitchTokenCache = { token: '', expiresAt: 0 };
export async function twitchAccessToken() {
  if (twitchTokenCache.token && twitchTokenCache.expiresAt > Date.now() + 60_000) return twitchTokenCache.token;
  const { clientId, clientSecret } = twitchConfig();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
  const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw Object.assign(new Error(data.message || 'Could not authenticate with Twitch.'), { status: response.status || 502 });
  twitchTokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000 };
  return data.access_token;
}

export async function twitchGet(endpoint, params = {}) {
  const { clientId } = twitchConfig();
  const token = await twitchAccessToken();
  const url = new URL(`https://api.twitch.tv/helix/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach(v => url.searchParams.append(key, String(v)));
    else url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.message || `Twitch API request failed (${response.status}).`), { status: response.status });
  return body;
}

export function parseTwitchInput(raw = '') {
  const input = String(raw).trim();
  if (!input) throw Object.assign(new Error('Enter a Twitch username or channel URL.'), { status: 400 });
  try {
    const u = new URL(input.includes('://') ? input : `https://${input}`);
    if (/twitch\.tv$/i.test(u.hostname) || /www\.twitch\.tv$/i.test(u.hostname)) {
      const login = u.pathname.split('/').filter(Boolean)[0];
      if (login) return login.toLowerCase();
    }
  } catch {}
  return input.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

export function twitchDurationToSeconds(value = '') {
  const m = String(value).match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  return (Number(m?.[1] || 0) * 3600) + (Number(m?.[2] || 0) * 60) + Number(m?.[3] || 0);
}
export function twitchThumb(url = '', width = 640, height = 360) {
  return String(url || '').replace(/%\{width\}/g, String(width)).replace(/%\{height\}/g, String(height));
}
export function twitchUserSummary(user, extra = {}) {
  return {
    platform: 'twitch', id: user.id, login: user.login, handle: user.login,
    name: user.display_name || user.login || 'Twitch creator', description: user.description || '',
    avatar: user.profile_image_url || extra.thumbnail_url || null,
    channelUrl: `https://www.twitch.tv/${user.login}`,
    isLive: Boolean(extra.is_live), gameName: extra.game_name || null, title: extra.title || null
  };
}

const twitchSearchCache = new Map();
export async function searchTwitchCreators(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (query.length < 2) return [];
  const cacheKey = query.toLowerCase();
  const cached = twitchSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.results;
  const search = await twitchGet('search/channels', { query, first: 8, live_only: false });
  const rows = search.data || [];
  const logins = rows.map(x => x.broadcaster_login).filter(Boolean);
  let users = [];
  if (logins.length) users = (await twitchGet('users', { login: logins })).data || [];
  const rowMap = new Map(rows.map(x => [String(x.broadcaster_login || '').toLowerCase(), x]));
  const results = users.map(u => twitchUserSummary(u, rowMap.get(String(u.login || '').toLowerCase()) || {}));
  twitchSearchCache.set(cacheKey, { at: Date.now(), results });
  return results;
}

function mapTwitchClip(c={}) {
  return {
    id: c.id, type: 'clip', title: c.title || 'Untitled clip', creatorName: c.creator_name || '',
    createdAt: c.created_at || null, publishedAt: c.created_at || null, thumbnail: c.thumbnail_url || null,
    duration: Number(c.duration || 0), viewCount: Number(c.view_count || 0), url: c.url || null,
    embedUrl: c.embed_url || null, videoId: c.video_id || null, vodOffset: c.vod_offset ?? null,
    isFeatured: Boolean(c.is_featured)
  };
}

async function fetchTwitchClipWindow(broadcasterId,{startedAt,endedAt,maxPages=3}={}) {
  const out=[];
  let after='';
  for(let page=0;page<maxPages;page++){
    const res=await twitchGet('clips',{
      broadcaster_id:broadcasterId,
      first:100,
      started_at:startedAt,
      ended_at:endedAt,
      after:after||undefined
    });
    out.push(...(res.data||[]));
    after=String(res.pagination?.cursor||'');
    if(!after)break;
  }
  return out;
}

export async function fetchRecentTwitchClips(broadcasterId, previousClips=[]) {
  const now=new Date();
  const iso=d=>d.toISOString();
  const since48h=new Date(now.getTime()-48*3600_000);
  const since30d=new Date(now.getTime()-30*86400_000);

  // Twitch ranks clip queries by views inside the requested period, not strictly
  // by creation time. A narrow 48h window catches brand-new low-view clips fast;
  // a wider 30-day window keeps the useful recent catalogue.
  const [fresh48h,recent30d]=await Promise.all([
    fetchTwitchClipWindow(broadcasterId,{startedAt:iso(since48h),endedAt:iso(now),maxPages:3}),
    fetchTwitchClipWindow(broadcasterId,{startedAt:iso(since30d),endedAt:iso(now),maxPages:3})
  ]);

  const merged=new Map();
  for(const clip of [...fresh48h,...recent30d,...(previousClips||[])]) {
    if(!clip?.id)continue;
    const normalized=clip.type==='clip'&&clip.createdAt ? clip : mapTwitchClip(clip);
    const existing=merged.get(normalized.id);
    if(!existing||new Date(normalized.createdAt||0)>new Date(existing.createdAt||0)) merged.set(normalized.id,normalized);
  }
  return [...merged.values()]
    .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))
    .slice(0,500);
}

export async function fetchTwitchCreator(input, previousCreator = null) {
  const login = parseTwitchInput(input);
  const users = await twitchGet('users', { login });
  const user = users.data?.[0];
  if (!user) throw Object.assign(new Error('Twitch channel not found. Try the streamer username or Twitch channel URL.'), { status: 404 });
  // Fetch every public video type (archives, highlights and uploads). Some Twitch
  // channels do not keep archive VODs, so filtering to type=archive can incorrectly make
  // a channel look empty even though public videos exist.
  const [videosRes, clips, streamsRes, channelsRes] = await Promise.all([
    twitchGet('videos', { user_id: user.id, first: 100 }),
    fetchRecentTwitchClips(user.id, previousCreator?.clips || []),
    twitchGet('streams', { user_id: user.id, first: 1 }),
    twitchGet('channels', { broadcaster_id: user.id })
  ]);
  const channel = channelsRes.data?.[0] || {};
  const stream = streamsRes.data?.[0] || null;
  const vods = (videosRes.data || []).map(v => ({
    id: v.id, type: 'vod', videoType: v.type || 'archive', title: v.title || 'Untitled VOD', description: v.description || '',
    createdAt: v.created_at || v.published_at || null, publishedAt: v.published_at || v.created_at || null,
    thumbnail: twitchThumb(v.thumbnail_url), duration: twitchDurationToSeconds(v.duration), viewCount: Number(v.view_count || 0),
    url: v.url || `https://www.twitch.tv/videos/${v.id}`, language: v.language || null,
    viewable: v.viewable || 'public'
  }));

  return {
    ...twitchUserSummary(user, { is_live: Boolean(stream), game_name: stream?.game_name || channel.game_name, title: stream?.title || channel.title }),
    broadcasterType: user.broadcaster_type || '', totalViews: Number(user.view_count || 0),
    live: stream ? { id: stream.id, title: stream.title, viewerCount: Number(stream.viewer_count || 0), startedAt: stream.started_at, gameName: stream.game_name, thumbnail: twitchThumb(stream.thumbnail_url) } : null,
    vods, clips, refreshedAt: new Date().toISOString()
  };
}

