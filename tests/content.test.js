import test from 'node:test';
import assert from 'node:assert/strict';

test('trusted phone clicks are intercepted once even after handler reinjection',async()=>{
 const listeners=new Set();const messages=[];
 globalThis.window={
  addEventListener:(name,fn,capture)=>{assert.equal(name,'click');assert.equal(capture,true);listeners.add(fn);},
  removeEventListener:(name,fn)=>listeners.delete(fn)
 };
 globalThis.HTMLAnchorElement=class {getAttribute(){return '  tel:+19095550123  '}};
 globalThis.chrome={runtime:{sendMessage:async message=>{messages.push(message);return {ok:true}}}};
 await import('../content.js');
 const anchor=new HTMLAnchorElement();let prevented=0;
 const event={isTrusted:false,button:0,composedPath:()=>[anchor],preventDefault:()=>prevented++,stopImmediatePropagation(){}};
 const click=event=>[...listeners].forEach(fn=>fn(event));
 click(event);assert.equal(messages.length,0);assert.equal(prevented,0);
 click({...event,isTrusted:true});assert.deepEqual(messages,[{type:'requestDial',number:'tel:+19095550123'}]);assert.equal(prevented,1);
 const oldState=globalThis.__fsPbxLinks;
 await import('../content.js?refresh');
 assert.equal(oldState.enabled,false);assert.equal(listeners.size,1);
 click({...event,isTrusted:true});assert.equal(messages.length,2);assert.equal(prevented,2);
 globalThis.__fsPbxLinks.enabled=false;
 click({...event,isTrusted:true});assert.equal(messages.length,2);
 globalThis.__fsPbxLinkAllowed=false;
 await import('../content.js?disabled');
 assert.equal(listeners.size,0);
});
