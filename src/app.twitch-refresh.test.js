import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual refresh/scheduler functions without starting the editor.
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('  async function refreshTwitchLive('),source.indexOf('  async function loadLibrary('));

for(const [kind,section,delay] of [['Live','live',60000],['Clips','clips',45000]]){
  test(`${section}: failed background refresh waits for the regular polling interval`,async()=>{
    let now=100000,requests=0,nextId=0;
    const timers=new Map();
    const state={page:'library',libraryPlatform:'twitch',librarySection:section};
    const context=vm.createContext({state,window:{},Date:{now:()=>now},
      setTimeout:(fn,ms)=>{timers.set(++nextId,{fn,ms});return nextId},
      clearTimeout:id=>timers.delete(id),
      fetch:async()=>{requests++;throw new Error('Offline')},
      render:()=>vm.runInContext(`scheduleTwitch${kind}Refresh()`,context),
    });
    vm.runInContext(functions,context);
    vm.runInContext(`scheduleTwitch${kind}Refresh()`,context);
    const immediate=[...timers.entries()].find(([,t])=>t.ms<1000);
    assert.ok(immediate,'initial stale data refreshes promptly');
    timers.delete(immediate[0]);
    await immediate[1].fn();
    assert.equal(requests,1);
    assert.deepEqual([...timers.values()].map(t=>t.ms),[delay]);
    assert.equal(state[`twitch${kind}LastRefresh`],undefined,'failure is not recorded as success');
    now+=delay;
    const [id,timer]=[...timers.entries()][0];timers.delete(id);
    await timer.fn();
    assert.equal(requests,2,'polling retries after the normal interval');
    assert.deepEqual([...timers.values()].map(t=>t.ms),[delay]);
    await vm.runInContext(`refreshTwitch${kind}({silent:false})`,context);
    assert.equal(requests,3,'manual refresh remains available during cooldown');
  });
}
