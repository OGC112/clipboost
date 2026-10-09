import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCampaign, campaignTotals, campaignCompliance, campaignFitForCandidate, parseCampaignSourceUrl } from './core.js';

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

test('Google Drive folder is classified as a resource container rather than a downloadable video',()=>{
  const parsed=parseCampaignSourceUrl('https://drive.google.com/drive/folders/15Olz3M0WJadrjCdNUWOD7kmc-jjQFmJs?usp=sharing');
  assert.equal(parsed.platform,'google-drive');
  assert.equal(parsed.mediaType,'folder');
  assert.equal(parsed.id,'15Olz3M0WJadrjCdNUWOD7kmc-jjQFmJs');
});
test('Google Docs are classified as documents rather than videos',()=>{
  const parsed=parseCampaignSourceUrl('https://docs.google.com/document/d/abc123/edit');
  assert.equal(parsed.mediaType,'document');
  assert.equal(parsed.id,'abc123');
});
