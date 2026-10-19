import test from 'node:test';
import assert from 'node:assert/strict';

const settings={server:'https://pbx.example.test',domain:'4018f7a3-8e0a-47bb-9f4f-04b1313e0e1b',extension:'101',token:'test-token',agent:'SIP-T53W',vendor:'yealink'};
const extensionId='test-extension';
const store={settings}; const session={}; const scripts=[]; const windows=[]; const requests=[]; const accesses=[]; let listener; let install; let menuListener; let response={sent:true}; let failure=false; let httpStatus=200;
const popups=[];const badges=[];let popupFailure=false;
const injections=[];let openTabs=[];let permissionsAdded;let permissionsRemoved;
const storage=(state)=>({setAccessLevel:async value=>accesses.push(value),get:async key=>key===null?{...state}:Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,state[k]])),set:async value=>Object.assign(state,value),remove:async key=>{delete state[key]},clear:async()=>{for(const k of Object.keys(state))delete state[k]}});
globalThis.chrome={
 storage:{local:storage(store),session:storage(session)},
 runtime:{id:extensionId,getURL:path=>`chrome-extension://${extensionId}/${path}`,onInstalled:{addListener:f=>{install=f}},onStartup:{addListener:()=>{}},onMessage:{addListener:f=>{listener=f}}},
 permissions:{contains:async()=>true,getAll:async()=>({origins:[]}),remove:async()=>true,onAdded:{addListener:f=>{permissionsAdded=f}},onRemoved:{addListener:f=>{permissionsRemoved=f}}},
 contextMenus:{removeAll:async()=>{},create:()=>{},onClicked:{addListener:f=>{menuListener=f}}},
 scripting:{getRegisteredContentScripts:async()=>scripts,registerContentScripts:async data=>scripts.push(...data),unregisterContentScripts:async({ids})=>{for(let i=scripts.length-1;i>=0;i--)if(ids.includes(scripts[i].id))scripts.splice(i,1)},executeScript:async data=>{injections.push(data);return [];}},
 tabs:{query:async({url:patterns})=>openTabs.filter(t=>patterns.some(p=>{const u=new URL(t.url);return p===`${u.protocol}//*/*`||p===`${u.protocol}//${u.hostname}/*`;}))},
 windows:{create:async data=>windows.push(data),getLastFocused:async()=>({id:10})},
 action:{openPopup:async data=>{popups.push(data);if(popupFailure)throw new Error('popup unavailable');},setBadgeText:async data=>badges.push(data),setTitle:async()=>{}}
};
globalThis.fetch=async(url,options)=>{requests.push({url,options});if(failure)throw new TypeError('network down');return {ok:httpStatus===200,status:httpStatus,json:async()=>response}};
await import('../background.js');
const own={id:extensionId,url:`chrome-extension://${extensionId}/popup.html`};
const site={id:extensionId,url:'https://crm.example.test/contact/1',tab:{id:1,windowId:10}};
const message=(data,sender=own)=>new Promise(resolve=>listener(data,sender,resolve));

test('credentials are restricted to trusted extension contexts and never returned to the UI',async()=>{
 const result=await message({type:'getSettings'});
 assert.equal(accesses.length,2);assert.ok(accesses.every(x=>x.accessLevel==='TRUSTED_CONTEXTS'));
 assert.equal(result.hasToken,true);assert.equal(result.settings.token,undefined);
});
test('webpage/content-script callers cannot retrieve settings or place calls',async()=>{
 for(const type of ['getSettings','getPendingDial','saveSettings','targets','dial','forget','refreshLinks']) assert.equal((await message({type},site)).ok,false);
 assert.equal((await message({type:'getSettings'},{...own,id:'another-extension'})).ok,false);
 assert.equal(requests.length,0);
});
test('phone discovery uses authenticated GET and filters Ringotel without making calls',async()=>{
 response={data:[{agent:'Yealink SIP-T53W',vendor:'yealink',lan_ip:'10.0.0.2'},{agent:'Ringotel',vendor:'ringotel'}]};
 const result=await message({type:'targets'});
 assert.equal(result.ok,true);assert.equal(result.targets.length,1);
 const request=requests.at(-1);
 assert.match(request.url,/phone-control\/targets\?extension=101$/);assert.equal(request.options.method,'GET');assert.equal(request.options.headers.Authorization,'Bearer test-token');
});
test('dial submits the documented JSON and a duplicate request does not call the PBX again',async()=>{
 response={sent:true}; const data={type:'dial',number:'+1 (909) 555-0123',requestId:'unique-request-0001'};
 const first=await message(data);assert.equal(first.ok,true);
 assert.deepEqual(JSON.parse(requests.at(-1).options.body),{extension:'101',destination:'+19095550123',agent:'SIP-T53W',vendor:'yealink'});
 assert.equal(requests.at(-1).options.redirect,'error');assert.equal(requests.at(-1).options.credentials,'omit');
 const count=requests.length;assert.equal((await message(data)).ok,false);assert.equal(requests.length,count);
});
test('failed sent flag, permission errors and network failures are reported accurately without retry',async()=>{
 response={sent:false};assert.equal((await message({type:'dial',number:'202',requestId:'unique-request-0002'})).ok,false);
 httpStatus=403;response={error:{code:'forbidden_permission',permission:'phone_control_view'}};assert.match((await message({type:'targets'})).error,/missing phone_control_view/);httpStatus=200;
 failure=true;const count=requests.length;const result=await message({type:'dial',number:'203',requestId:'unique-request-0003'});assert.match(result.error,/may have started/);assert.equal(requests.length,count+1);failure=false;
});
test('actual error response body reaches the user message without exposing arbitrary content',async()=>{
 httpStatus=403;
 response={error:{code:'forbidden_domain',message:'server details should not be echoed'}};
 assert.match((await message({type:'targets'})).error,/forbidden_domain/);
 response={error:{code:'forbidden_permission',permission:'phone_control_call'}};
 const result=await message({type:'dial',number:'204',requestId:'unique-request-0004'});
 assert.match(result.error,/phone_control_call/);
 response={error:{type:'invalid_request_error',message:'You do not have access to this extension.',code:'forbidden_extension',param:'extension'}};
 const discovery=await message({type:'targets'});
 assert.equal(discovery.ok,false);assert.match(discovery.error,/configured extension \(forbidden_extension\)/);
 const deniedDial=await message({type:'dial',number:'205',requestId:'unique-request-0005'});
 assert.equal(deniedDial.ok,false);assert.match(deniedDial.error,/configured extension \(forbidden_extension\)/);
 response=null;assert.match((await message({type:'targets'})).error,/without a recognized/);
 httpStatus=200;response={sent:true};
});
test('enabled webpage opens the toolbar dialer in its window without creating windows or submitting calls',async()=>{
 assert.equal((await message({type:'requestDial',number:'tel:123'},site)).ok,false);
 await message({type:'toggleSite',url:site.url,tabId:1});
 const count=requests.length;assert.equal((await message({type:'requestDial',number:'tel:+19095550123'},site)).ok,true);
 assert.equal(requests.length,count);assert.deepEqual(popups.at(-1),{windowId:10});assert.equal(windows.length,0);
 assert.equal((await message({type:'getPendingDial',windowId:20})).number,'');
 assert.equal((await message({type:'getPendingDial',windowId:10})).number,'tel:+19095550123');
 assert.equal((await message({type:'getPendingDial',windowId:10})).number,'');
 assert.deepEqual(badges.at(-1),{tabId:1,text:''});
 await message({type:'toggleSite',url:site.url,tabId:1});
 assert.equal((await message({type:'requestDial',number:'tel:123'},site)).ok,false);
});

test('context-menu selection opens the toolbar and leaves a recoverable number if Chrome refuses the popup',async()=>{
 popupFailure=true;const count=requests.length;
 try {
  await menuListener({menuItemId:'selection',selectionText:'(909) 555-0123'},{id:2,windowId:20});
  assert.deepEqual(popups.at(-1),{windowId:20});
  assert.equal(windows.length,0);assert.equal(requests.length,count);
  assert.equal((await message({type:'getPendingDial',windowId:20})).number,'(909) 555-0123');
 } finally { popupFailure=false; }
});

test('stale pending selections are discarded instead of prefilling an old destination',async()=>{
 session['pendingDial:30']={number:'123',time:Date.now()-300001,badgeTarget:{tabId:3}};
 assert.equal((await message({type:'getPendingDial',windowId:30})).number,'');
 assert.equal(session['pendingDial:30'],undefined);
});
test('same request remains reserved across a worker restart',async()=>{
 await import('../background.js?restart');
 const count=requests.length;
 assert.equal((await message({type:'dial',number:'203',requestId:'unique-request-0003'})).ok,false);
 assert.equal(requests.length,count);
});

test('all-sites handling requires a grant, covers HTTP and HTTPS, and preserves individual sites when disabled',async()=>{
 const other={...site,url:'https://different.example.test/contact/2'};
 const plain={...site,url:'http://legacy.example.test/contact/3'};
 const contains=chrome.permissions.contains;
 try {
  chrome.permissions.contains=async()=>false;
  assert.equal((await message({type:'setAllSites',enabled:true})).ok,false);
  assert.equal(scripts.some(s=>s.id==='phone-links-all-sites'),false);
  chrome.permissions.contains=contains;
  await message({type:'toggleSite',url:site.url,tabId:1});
  assert.equal((await message({type:'setAllSites',enabled:true})).allSitesEnabled,true);
  await message({type:'setAllSites',enabled:true});
  assert.equal(scripts.filter(s=>s.id==='phone-links-all-sites').length,1);
  const count=requests.length;
  for(const sender of [site,other,plain]) {
   assert.equal((await message({type:'siteState',url:sender.url})).enabled,true);
   assert.equal((await message({type:'requestDial',number:'tel:123'},sender)).ok,true);
   assert.equal((await message({type:'dial',number:'123'},sender)).ok,false);
  }
  assert.equal(requests.length,count);
  assert.equal((await message({type:'requestDial',number:'tel:123'},{...site,url:'chrome://settings'})).ok,false);
  chrome.permissions.contains=async()=>false;
  assert.equal((await message({type:'requestDial',number:'tel:123'},other)).ok,false);
  chrome.permissions.contains=contains;
  assert.equal((await message({type:'setAllSites',enabled:false})).allSitesEnabled,false);
  assert.equal((await message({type:'requestDial',number:'tel:123'},other)).ok,false);
  assert.equal((await message({type:'requestDial',number:'tel:123'},site)).ok,true);
  await message({type:'toggleSite',url:site.url,tabId:1});
 } finally { chrome.permissions.contains=contains; }
});

test('extension updates restore saved all-site handlers and repair open tabs without calling the PBX',async()=>{
 openTabs=[{id:1,url:site.url},{id:2,url:'http://legacy.example.test'},{id:3,url:'chrome://settings'}];
 await message({type:'setAllSites',enabled:true});
 assert.equal(store.phoneLinkSites[0].id,'phone-links-all-sites');
 scripts.length=0;injections.length=0; // Chrome discards dynamic registrations on update.
 const count=requests.length;
 await install({reason:'update'});
 assert.equal(scripts.length,1);assert.equal(scripts[0].id,'phone-links-all-sites');
 assert.equal(scripts[0].persistAcrossSessions,true);
 assert.deepEqual([...new Set(injections.map(i=>i.target.tabId))].sort(),[1,2]);
 assert.equal(requests.length,count);
 assert.equal((await message({type:'requestDial',number:'tel:123'},site)).ok,true);
 await message({type:'setAllSites',enabled:false});
 assert.deepEqual(store.phoneLinkSites,[]);
 assert.equal((await message({type:'sites'})).hasSavedChoice,true);
 injections.length=0;
 await install({reason:'update'});
 assert.equal(scripts.length,0);assert.equal(injections.length,0);
 assert.equal((await message({type:'requestDial',number:'tel:123'},site)).ok,false);
 openTabs=[];
});

test('individual choices survive reloads, and revoked access is never silently re-granted',async()=>{
 const contains=chrome.permissions.contains;
 openTabs=[{id:1,url:site.url},{id:2,url:'https://unselected.example.test/'}];
 try {
  await message({type:'enableSite',url:site.url});
  const saved=structuredClone(store.phoneLinkSites);
  scripts.length=0;injections.length=0;
  await install({reason:'update'});
  assert.deepEqual(scripts.map(({id,matches})=>({id,matches})),saved);
  assert.deepEqual([...new Set(injections.map(i=>i.target.tabId))],[1]);
  chrome.permissions.contains=async()=>false;
  injections.length=0;
  await permissionsRemoved({origins:saved[0].matches});
  assert.equal(scripts.length,0);assert.equal(injections.length,0);
  assert.deepEqual(store.phoneLinkSites,saved);
  assert.equal((await message({type:'sites'})).sites[0].granted,false);
  assert.equal((await message({type:'requestDial',number:'tel:123'},site)).ok,false);
  chrome.permissions.contains=contains;
  await permissionsAdded({origins:saved[0].matches});
  assert.equal(scripts.length,1);
  assert.equal((await message({type:'sites'})).sites[0].granted,true);
  await message({type:'removeSite',id:saved[0].id});
 } finally {chrome.permissions.contains=contains;openTabs=[];}
});

test('refresh recovers the top frame when a child frame cannot be injected',async()=>{
 const execute=chrome.scripting.executeScript;
 openTabs=[{id:1,url:site.url}];
 try {
  await message({type:'enableSite',url:site.url});
  injections.length=0;
  chrome.scripting.executeScript=async data=>{
   injections.push(data);
   if(data.target.allFrames)throw new Error('A child frame is inaccessible.');
   return [];
  };
  const result=await message({type:'refreshLinks'});
  assert.equal(result.ok,true);assert.equal(result.updatedTabs,1);assert.equal(result.skippedTabs,0);
  assert.ok(injections.some(i=>i.files?.includes('content.js')&&!i.target.allFrames));
  const setChoice=injections.find(i=>i.func&&!i.target.allFrames);
  globalThis.location={href:'https://unselected.example.test/'};
  let disposed=false;
  globalThis.__fsPbxLinks={enabled:true,dispose:()=>{disposed=true}};
  setChoice.func(...setChoice.args);
  assert.equal(globalThis.__fsPbxLinkAllowed,false);assert.equal(disposed,true);
  globalThis.location={href:site.url};
  setChoice.func(...setChoice.args);
  assert.equal(globalThis.__fsPbxLinkAllowed,true);
  await message({type:'removeSite',id:store.phoneLinkSites[0].id});
 } finally {chrome.scripting.executeScript=execute;openTabs=[];delete globalThis.location;delete globalThis.__fsPbxLinks;delete globalThis.__fsPbxLinkAllowed;}
});

test('legacy preferences migrate existing registrations but never infer opt-in from permission grants',async()=>{
 const {createWebsiteLinks}=await import('../website-links.js');
 const links=createWebsiteLinks(Promise.resolve());
 delete store.phoneLinkSites;
 scripts.push({id:'phone-links-legacy',matches:['https://crm.example.test/*']});
 await links.restore(false);
 assert.deepEqual(store.phoneLinkSites,[{id:'phone-links-legacy',matches:['https://crm.example.test/*']}]);
 scripts.length=0;
 await links.restore(false);
 assert.equal(scripts[0].id,'phone-links-legacy');
 await links.clear();
 delete store.phoneLinkSites;
 await links.restore(false);
 assert.deepEqual(store.phoneLinkSites,[]);assert.equal(scripts.length,0);
});
