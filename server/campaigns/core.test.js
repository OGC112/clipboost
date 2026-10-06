import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCampaign, campaignTotals, campaignCompliance, campaignFitForCandidate } from './core.js';

test('normalizeCampaign sanitizes and preserves core campaign fields', () => {
  const campaign = normalizeCampaign({
    name:'  Launch Campaign  ',
    paymentModel:'per-views',
    qualificationViews:'1000',
    rateBasisViews:'1000',
    payout:'25',
    platforms:['TikTok','YouTube Shorts'],
    sourceUrls:['https://youtu.be/abc123']
  });
  assert.equal(campaign.name,'Launch Campaign');
  assert.equal(campaign.paymentModel,'per-views');
  assert.equal(campaign.qualificationViews,1000);
  assert.equal(campaign.rateBasisViews,1000);
  assert.equal(campaign.fixedReward,25);
  assert.equal(campaign.sourceUrls.length,1);
  assert.ok(campaign.id);
});

test('campaignTotals computes estimated revenue for qualified per-view posts', () => {
  const campaign = normalizeCampaign({
    paymentModel:'per-views',
    qualificationViews:1000,
    qualificationScope:'per-post',
    rateBasisViews:1000,
    platformPayouts:{tiktok:10},
    posts:[
      {platform:'tiktok',views:2500,editingMinutes:30},
      {platform:'tiktok',views:500,editingMinutes:15}
    ]
  });
  const totals=campaignTotals(campaign);
  assert.equal(totals.qualifiedPostCount,1);
  assert.equal(totals.totalViews,3000);
  assert.equal(totals.estimatedRevenue,25);
});

test('campaign compliance blocks forbidden terms', () => {
  const campaign=normalizeCampaign({minDuration:10,maxDuration:60,forbiddenTerms:['spoiler']});
  const meta={id:'p1',campaign};
  const candidate={start:0,end:30,selectionText:'this contains a spoiler',campaignFit:{relevance:80}};
  const result=campaignCompliance(meta,candidate,{captions:true});
  assert.equal(result.enabled,true);
  assert.equal(result.passed,false);
  assert.ok(result.checks.some(x=>x.label==='Forbidden terms'&&!x.ok));
});

test('campaign fit marks overlapping used moments', () => {
  const campaign=normalizeCampaign({brief:'gaming highlight reaction',usedMoments:[{projectId:'p1',start:10,end:30}]});
  const meta={id:'p1',campaign};
  const fit=campaignFitForCandidate(meta,{start:20,end:40,selectionText:'gaming highlight reaction'},{retention:80,completeness:80});
  assert.equal(fit.used,true);
  assert.ok(fit.score<=55);
});


test('campaign brief relevance is advisory and does not block publishing by itself', () => {
  const campaign=normalizeCampaign({brief:'brand trailer launch',minDuration:5,maxDuration:60});
  const meta={id:'p1',campaign};
  const candidate={start:0,end:10,selectionText:'unrelated dialogue',campaignFit:{relevance:48,termsMatched:0,termsTotal:3}};
  const result=campaignCompliance(meta,candidate,{captions:true});
  const relevance=result.checks.find(x=>x.label==='Campaign brief relevance');
  assert.equal(relevance.ok,false);
  assert.equal(relevance.blocking,false);
  assert.equal(result.passed,true);
  assert.match(relevance.detail,/48 \/ 55 recommended/);
});
