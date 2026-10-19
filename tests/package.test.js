import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('manifest uses MV3 and every referenced asset exists',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 assert.equal(m.manifest_version,3);assert.equal(m.background.type,'module');
 assert.equal(m.host_permissions,undefined);assert.equal(m.externally_connectable,undefined);assert.equal(m.web_accessible_resources,undefined);
 const files=[m.background.service_worker,m.action.default_popup,m.options_ui.page,...Object.values(m.icons),...Object.values(m.action.default_icon)];
 for(const file of files)assert.ok(fs.existsSync(path.join(root,file)),file);
 for(const html of ['popup.html','options.html']){
  const text=fs.readFileSync(path.join(root,html),'utf8');
  for(const [,file] of text.matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,file)),`${html} -> ${file}`);
  assert.doesNotMatch(text,/<script[^>]*>\s*[^\s<]/);
 }
});
