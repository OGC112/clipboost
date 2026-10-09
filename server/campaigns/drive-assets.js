import { validatePublicHttpUrl } from '../security/network.js';

const MAX_HTML=4_000_000;
const MAX_ITEMS=100;
const DRIVE_ID=/^[a-zA-Z0-9_-]{10,128}$/;
const VIDEO_EXT=/\.(?:mp4|mov|m4v|webm|mkv|avi)$/i;
const VIDEO_MIME=/^video\//i;

export function parseDriveFolderUrl(raw){
  try{
    const u=new URL(raw);
    if(u.protocol!=='https:'||u.hostname!=='drive.google.com')return null;
    const match=u.pathname.match(/^\/drive\/folders\/([a-zA-Z0-9_-]{10,128})(?:\/|$)/);
    return match?{id:match[1],url:`https://drive.google.com/drive/folders/${match[1]}`}:null;
  }catch{return null}
}

// Public Drive pages use different representations across Google releases.
// Collect only video files with recognizable IDs; never infer private file access.
export function extractPublicDriveVideos(html){
  const input=String(html||'').slice(0,MAX_HTML);
  const candidates=new Map();
  const add=(id,name,mime)=>{
    if(!DRIVE_ID.test(id))return;
    const label=String(name||'').trim();
    if(!VIDEO_EXT.test(label)&&!VIDEO_MIME.test(mime||''))return;
    if(candidates.has(id))return;
    candidates.set(id,{label:label||'Drive video',kind:'video',pageUrl:`https://drive.google.com/file/d/${id}/view`,provider:'google-drive',requiresAccessCheck:true});
  };
  // Google Drive embeds file listing tuples: [id,name,mimeType,...].
  const tuple=/\["([a-zA-Z0-9_-]{10,128})","([^"\\]{1,220})","(video\/[^"\\]{2,100})"/g;
  for(const m of input.matchAll(tuple))add(m[1],m[2],m[3]);
  // Some public listings expose navigable file anchors rather than tuples.
  const anchor=/<a\b[^>]*href=["']([^"']*\/file\/d\/([a-zA-Z0-9_-]{10,128})[^"']*)["'][^>]*>([^<]{1,220})<\/a>/gi;
  for(const m of input.matchAll(anchor))add(m[2],m[3],'');
  return [...candidates.values()].slice(0,MAX_ITEMS);
}

export async function inspectPublicDriveFolder(raw,{fetchImpl=fetch}={}){
  const parsed=parseDriveFolderUrl(raw);
  if(!parsed)throw Object.assign(new Error('Only public Google Drive folder URLs are supported.'),{status:400});
  await validatePublicHttpUrl(parsed.url);
  const response=await fetchImpl(parsed.url,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 ClipBoost/22 Campaign Asset Importer','Accept':'text/html'},signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw Object.assign(new Error(`Google Drive returned HTTP ${response.status}. Check that the folder is shared with viewers.`),{status:422});
  if(!String(response.headers.get('content-type')||'').includes('text/html'))throw Object.assign(new Error('Google Drive did not return a readable folder page.'),{status:422});
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>MAX_HTML)throw Object.assign(new Error('Drive folder listing is too large to inspect safely.'),{status:422});
  const html=(await response.text()).slice(0,MAX_HTML);
  if(/accounts\.google\.com|sign in to continue|request access/i.test(html)&&!/drive\.google\.com\/file\/d\//.test(html)){
    return {ok:true,items:[],summary:'Google Drive requires access to this folder. Ask the campaign organizer for viewer permission or an authorized video file.',access:'restricted'};
  }
  const items=extractPublicDriveVideos(html);
  return {ok:true,items,summary:items.length?`Found ${items.length} candidate video(s). Each file may still require viewer permission; open the file to confirm access.`:'No public video links were exposed by Google Drive. Open the folder to view its files, or ask the campaign organizer for direct file links. Some public folder listings cannot be read without the Google Drive API.',access:items.length?'unverified':'unknown'};
}
