import dns from 'dns/promises';
import net from 'net';

export function unsafeNetworkAddress(address='') {
  const value=String(address||'').trim().toLowerCase();
  if(!value)return true;
  if(value.startsWith('::ffff:'))return unsafeNetworkAddress(value.slice(7));
  const family=net.isIP(value);
  if(family===4){
    const parts=value.split('.').map(Number);
    if(parts.length!==4||parts.some(x=>!Number.isInteger(x)||x<0||x>255))return true;
    const [a,b,c]=parts;
    return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||
      (a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===192&&b===0)||
      (a===192&&b===0&&c===2)||(a===198&&(b===18||b===19))||
      (a===198&&b===51&&c===100)||(a===203&&b===0&&c===113)||a>=224;
  }
  if(family===6){
    return value==='::'||value==='::1'||value.startsWith('fc')||value.startsWith('fd')||
      /^fe[89ab]/.test(value)||value.startsWith('ff')||value.startsWith('2001:db8:');
  }
  return true;
}

export async function validatePublicHttpUrl(rawUrl) {
  let parsed;
  try { parsed=new URL(String(rawUrl||'').trim()); }
  catch { throw Object.assign(new Error('Enter a valid public campaign URL.'),{status:400}); }
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password){
    throw Object.assign(new Error('Enter a valid public http or https campaign URL.'),{status:400});
  }
  const hostname=parsed.hostname.replace(/\.$/,'').toLowerCase();
  if(!hostname||hostname==='localhost'||hostname.endsWith('.localhost')){
    throw Object.assign(new Error('Local or private network URLs are not allowed.'),{status:400});
  }
  let addresses;
  try { addresses=await dns.lookup(hostname,{all:true,verbatim:true}); }
  catch { throw Object.assign(new Error('The campaign hostname could not be resolved.'),{status:400}); }
  if(!addresses.length||addresses.some(item=>unsafeNetworkAddress(item.address))){
    throw Object.assign(new Error('Local or private network URLs are not allowed.'),{status:400});
  }
  return parsed;
}

export async function fetchPublicCampaignPage(rawUrl) {
  let current=(await validatePublicHttpUrl(rawUrl)).toString();
  for(let redirectCount=0;redirectCount<=5;redirectCount++){
    const response=await fetch(current,{
      headers:{'User-Agent':'Mozilla/5.0 ClipBoost/21.5 Campaign Importer','Accept':'text/html,application/xhtml+xml'},
      redirect:'manual',
      signal:AbortSignal.timeout(12000)
    });
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      if(!location)throw Object.assign(new Error('Campaign redirect did not include a destination.'),{status:400});
      if(redirectCount>=5)throw Object.assign(new Error('Campaign page redirected too many times.'),{status:400});
      current=(await validatePublicHttpUrl(new URL(location,current).toString())).toString();
      continue;
    }
    return {response,finalUrl:current};
  }
  throw Object.assign(new Error('Campaign page redirected too many times.'),{status:400});
}

