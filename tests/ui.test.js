import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// UI behavior tests use DOM/Chrome test doubles, not a real Chrome renderer.
class Element {
  constructor(id='') { this.id=id;this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.readOnly=false;this.listeners={};this.dataset={};this.children=[];this.classList={toggle(){}}; }
  addEventListener(type,fn){this.listeners[type]=fn;}
  async trigger(type){return this.listeners[type]?.({preventDefault(){}});}
  focus(){}
  replaceChildren(...items){this.children=items;}
  append(...items){this.children.push(...items);}
  setRangeText(value,start,end){this.value=this.value.slice(0,start)+value+this.value.slice(end);}
}
function documentFor(file){
 const html=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>[match[1],new Element(match[1])]));
 const keys=[...html.matchAll(/\bdata-digit="([^"]+)"/g)].map(match=>{const e=new Element();e.dataset.digit=match[1];return e});
 return {elements,document:{getElementById:id=>elements.get(id),querySelectorAll:selector=>selector==='[data-digit]'?keys:[],createElement:()=>new Element()}};
}
const config={server:'https://pbx.example.test',domain:'4018f7a3-8e0a-47bb-9f4f-04b1313e0e1b',extension:'101',agent:'SIP-T53W',vendor:'yealink',countryCode:'1',stripPlus:true};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('popup displays the phone number, previews formatting, and waits for explicit confirmation',async()=>{
 const fixture=documentFor('../popup.html');globalThis.document=fixture.document;
 globalThis.location={search:''};
 const messages=[];
 globalThis.chrome={runtime:{sendMessage:async message=>{messages.push(message);if(message.type==='getPendingDial')return {ok:true,number:'tel:+4420794600'};if(message.type==='getSettings')return {ok:true,settings:config,hasToken:true};if(message.type==='dial')return {ok:true,message:'Dial command sent.'};return {ok:true};},openOptionsPage:()=>{}},windows:{getCurrent:async()=>({id:10})}};
 await import('../popup.js');await tick();
 const el=id=>fixture.elements.get(id);
 assert.equal(el('number').value,'+4420794600');
 assert.deepEqual(messages.find(m=>m.type==='getPendingDial'),{type:'getPendingDial',windowId:10});
 assert.equal(el('normalized').textContent,'Will dial: 4420794600');
 assert.equal(el('call').disabled,false);
 assert.equal(messages.filter(m=>m.type==='dial').length,0);
 await el('dial-form').trigger('submit');await el('dial-form').trigger('submit');
 const calls=messages.filter(m=>m.type==='dial');assert.equal(calls.length,1);
 assert.equal(calls[0].number,'+4420794600');
 assert.match(calls[0].requestId,/^[\w-]+$/);
 assert.equal(el('call').disabled,true);assert.equal(el('number').readOnly,true);
 await el('new-call').trigger('click');
 el('number').value='callto:%2B19095550123';await el('number').trigger('input');
 assert.equal(el('number').value,'+19095550123');
 assert.equal(el('normalized').textContent,'Will dial: 19095550123');
 el('number').value='tel:123;ext=4';await el('number').trigger('input');
 assert.equal(el('number').value,'tel:123;ext=4');assert.equal(el('call').disabled,true);
});

test('options saves blank tokens safely through the background, discovers phones without dialing, and saves selection',async()=>{
 const fixture=documentFor('../options.html');globalThis.document=fixture.document;
 globalThis.Option=class extends Element{constructor(text,value){super();this.textContent=text;this.value=value}};
 const messages=[];const grants=[];
 globalThis.chrome={permissions:{request:async value=>{grants.push(value);return true}},runtime:{sendMessage:async message=>{
   messages.push(message);
   if(message.type==='getSettings')return {ok:true,settings:config,hasToken:true};
   if(message.type==='sites')return {ok:true,sites:[]};
   if(message.type==='targets')return {ok:true,targets:[{agent:'Yealink SIP-T53W 96.86.0.45',vendor:'yealink',lan_ip:'10.0.0.2'}]};
   return {ok:true};
 }}};
 await import('../options.js');await tick();
 const el=id=>fixture.elements.get(id);
 assert.equal(el('token').value,'');assert.match(el('token').placeholder,/Saved/);
 await el('test').trigger('click');
 assert.equal(messages.filter(m=>m.type==='dial').length,0);
 assert.equal(el('agent').value,'Yealink SIP-T53W 96.86.0.45');
 await el('settings-form').trigger('submit');
 const save=messages.filter(m=>m.type==='saveSettings').at(-1);
 assert.equal(save.settings.agent,'Yealink SIP-T53W 96.86.0.45');
 assert.equal(save.settings.token,'');
 assert.deepEqual(grants[0],{origins:['https://*/*','http://*/*']});
 assert.equal(messages.filter(m=>m.type==='setAllSites'&&m.enabled).length,2);
});

test('settings can enable and disable all-sites handling with the same explicit grant flow',async()=>{
 const fixture=documentFor('../options.html');globalThis.document=fixture.document;
 let enabled=false;const grants=[];
 globalThis.chrome={permissions:{request:async value=>{grants.push(value);return true}},runtime:{sendMessage:async message=>{
  if(message.type==='getSettings')return {ok:true,settings:config,hasToken:true};
  if(message.type==='setAllSites')enabled=message.enabled;
  return {ok:true,sites:[],allSitesEnabled:enabled,hasSavedChoice:true};
 }}};
 await import('../options.js?all-sites');await tick();
 const button=fixture.elements.get('toggle-all-sites');
 await button.trigger('click');assert.equal(enabled,true);assert.match(button.textContent,/Disable/);
 await button.trigger('click');assert.equal(enabled,false);assert.match(button.textContent,/Enable/);
 assert.equal(grants.length,1);
});

test('Save requests website permission immediately, handles denial, and respects a saved opt-out',async()=>{
 const fixture=documentFor('../options.html');globalThis.document=fixture.document;
 let enabled=false;let hasSavedChoice=false;let allow=false;
 const order=[];const grants=[];const messages=[];
 globalThis.chrome={permissions:{request:async value=>{order.push('permission');grants.push(value);return allow;}},runtime:{sendMessage:async message=>{
  order.push(message.type);messages.push(message);
  if(message.type==='getSettings')return {ok:true,settings:config,hasToken:true};
  if(message.type==='setAllSites'){enabled=message.enabled;hasSavedChoice=true;}
  return {ok:true,sites:[],allSitesEnabled:enabled,allSitesRequested:enabled,hasSavedChoice,updatedTabs:1,skippedTabs:0};
 }}};
 await import('../options.js?save-permissions');await tick();
 const el=id=>fixture.elements.get(id);
 assert.equal(el('enable-phone-links').checked,true);
 order.length=0;messages.length=0;
 const denied=el('settings-form').trigger('submit');
 assert.deepEqual(order,['permission']); // Before the first asynchronous continuation.
 await denied;
 assert.equal(messages.length,0);assert.equal(enabled,false);
 assert.match(el('status').textContent,/Settings were not saved/);
 assert.equal(el('status').role,'alert');assert.equal(el('status-notice').hidden,false);
 allow=true;order.length=0;
 await el('settings-form').trigger('submit');
 assert.deepEqual(order,['permission','saveSettings','setAllSites','sites']);
 assert.equal(enabled,true);assert.match(el('status').textContent,/Website phone links are enabled/);
 assert.deepEqual(grants.at(-1),{origins:['https://*/*','http://*/*']});
 assert.equal(messages.some(m=>m.type==='dial'),false);
 el('enable-phone-links').checked=false;
 await el('settings-form').trigger('submit');
 assert.deepEqual(grants.at(-1),{origins:['https://pbx.example.test/*']});
 assert.equal(enabled,false);assert.equal(el('enable-phone-links').checked,false);
 await el('settings-form').trigger('submit');
 assert.equal(enabled,false);assert.equal(el('enable-phone-links').checked,false);
});
