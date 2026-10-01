const fs=require('fs');
const path=require('path');
const file=path.join(process.cwd(),'src','app.js');
let s=fs.readFileSync(file,'utf8');

const old=`      <section class="campaign-discover-summary-v143">
        <article><small>Total campaigns</small><b>\${list.length}</b></article>
        <article><small>Active</small><b>\${active.length}</b></article>
        <article><small>Tracked views</small><b>\${formatCount(list.reduce((n,c)=>n+Number(c.totals?.totalViews||0),0))}</b></article>
        <article><small>Confirmed payout</small><b>\${formatMoney(list.reduce((n,c)=>n+Number(c.totals?.confirmedRevenue||0),0),list[0]?.currency||'USD')}</b></article>
      </section>`;

const replacement=`      <section class="campaign-discover-summary-v143">
        <article><small>Total campaigns</small><b>\${list.length}</b></article>
        <article><small>Active</small><b>\${active.length}</b></article>
      </section>`;

if(!s.includes(old)){
  console.log('21.15.12: Discover summary already changed or source differs; skipping app.js patch.');
  process.exit(0);
}
s=s.replace(old,replacement);
fs.writeFileSync(file,s);
console.log('21.15.12: Discover summary compacted.');
