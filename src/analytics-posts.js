// Pure dashboard post preparation. Live metrics enrich campaign posts; matched
// YouTube posts appear only once in the combined dashboard.
export function youtubeVideoId(value=''){
    const raw=String(value||'').trim();if(!raw)return '';
    if(/^[A-Za-z0-9_-]{11}$/.test(raw))return raw;
    try{
      const u=new URL(raw);
      if(/youtu\.be$/i.test(u.hostname))return String(u.pathname.split('/').filter(Boolean)[0]||'').slice(0,11);
      if(/youtube\.com$/i.test(u.hostname)||/\.youtube\.com$/i.test(u.hostname)){
        if(u.searchParams.get('v'))return String(u.searchParams.get('v')).slice(0,11);
        const parts=u.pathname.split('/').filter(Boolean),idx=parts.findIndex(x=>['shorts','live','embed'].includes(x));
        if(idx>=0&&parts[idx+1])return String(parts[idx+1]).slice(0,11);
      }
    }catch{}
    return '';
  }

export function buildAnalyticsPosts(campaignsList, youtubePosts) {
    const youtubeById=new Map(youtubePosts.map(p=>[String(p._youtubeId||p.id||p.postId||''),p]).filter(([id])=>id));
    const campaignYoutubeIds=new Set();
    const campaignPosts=campaignsList.flatMap(c=>(Array.isArray(c.posts)?c.posts:[]).map((p,i)=>{
      const platform=String(p.platform||'unknown').toLowerCase();
      const ytId=platform==='youtube'?String(p.postId||youtubeVideoId(p.url)||''):'';
      if(ytId)campaignYoutubeIds.add(ytId);
      const live=ytId?youtubeById.get(ytId):null;
      return {
        ...p,
        _id:String(p.id||p.postId||p.url||`${c.id}-${i}`),
        _kind:'campaign',
        _campaignId:c.id,
        _campaignName:c.name||'Campaign',
        _currency:c.currency||'USD',
        _platform:platform,
        _title:String(live?._title||p.title||p.caption||p.description||p.url||`Campaign post ${i+1}`),
        _date:live?._date||p.publishedAt||p.submittedAt||p.createdAt||c.updatedAt||c.createdAt||null,
        _views:live ? Number(live._views||0) : Math.max(0,Number(p.views||0)),
        _likes:live ? live._likes : (Number.isFinite(Number(p.likes??p.likeCount))?Math.max(0,Number(p.likes??p.likeCount)):null),
        _comments:live ? live._comments : (Number.isFinite(Number(p.comments??p.commentCount))?Math.max(0,Number(p.comments??p.commentCount)):null),
        _shares:Number.isFinite(Number(p.shares??p.shareCount))?Math.max(0,Number(p.shares??p.shareCount)):null,
        _revenue:Math.max(0,Number(p.payoutConfirmed||p.revenue||0)),
        _thumb:live?._thumb||p.thumbnail||p.thumbnailUrl||p.previewUrl||'',
        _youtubeId:ytId
      };
    }));
    const organicPosts=youtubePosts.filter(p=>!campaignYoutubeIds.has(String(p._youtubeId||'')));
    const allPosts=[...campaignPosts,...organicPosts];
    return { campaignPosts, organicPosts, allPosts };
}
