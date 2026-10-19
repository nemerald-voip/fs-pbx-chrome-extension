import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS, serverOrigin, hostPattern, validateSettings, normalizeNumber, dialPayload, checkDialResult, responseError} from '../core.js';

export const sample = {server:'https://pbx.example.test',domain:'4018f7a3-8e0a-47bb-9f4f-04b1313e0e1b',extension:'101',token:'test-token',agent:'SIP-T53W',vendor:'yealink'};
test('normalizes selected text and encoded phone links without changing short extensions', () => {
  assert.equal(normalizeNumber(' +1 (909) 555-0123 '), '+19095550123');
  assert.equal(normalizeNumber('tel:%2B1-909-555-0123'), '+19095550123');
  assert.equal(normalizeNumber('callto:909.555.0123'), '9095550123');
  assert.equal(normalizeNumber('101',{countryCode:'1'}), '101');
  assert.equal(normalizeNumber('9095550123',{countryCode:'1'}), '+19095550123');
  assert.equal(normalizeNumber('+4420794600',{countryCode:'1',stripPlus:true}), '4420794600');
});
test('rejects multiple numbers, dial-string injection, postdial extensions and malformed URIs', () => {
  for(const value of ['123/456', '123;ext=4', 'tel:123?body=x', 'Alice 555-1234', 'sip:101@host', '1&2', '123,456', 'tel:%ZZ', '123\n+456','*98','123 x45']) assert.throws(() => normalizeNumber(value), undefined, value);
});
test('server URL must be HTTPS and cannot carry credentials, routes or query strings', () => {
  assert.equal(serverOrigin('https://pbx.example.test:8443/'), 'https://pbx.example.test:8443');
  assert.equal(hostPattern('https://pbx.example.test:8443/'), 'https://pbx.example.test/*');
  for(const value of ['http://pbx.test','https://x:y@pbx.test','https://pbx.test/api','https://pbx.test/?token=abc','https://pbx.test/#x']) assert.throws(() => serverOrigin(value));
});
test('token is retained on same-server save but cannot accidentally follow a server change', () => {
  assert.equal(validateSettings({...sample,token:''}, sample).token,'test-token');
  assert.throws(() => validateSettings({...sample,server:'https://elsewhere.test',token:''},sample),/new API token/);
  assert.equal(validateSettings({...sample,token:'Bearer replacement'}).token,'replacement');
  assert.throws(() => validateSettings({...sample,domain:'tenant.example.test'}),/UUID/);
});
test('dialing requires an explicit desk-phone selector and sends no transport overrides', () => {
  assert.deepEqual(dialPayload(sample,'(909)555-0123'), {extension:'101',destination:'9095550123',agent:'SIP-T53W',vendor:'yealink'});
  assert.throws(() => dialPayload({...sample,agent:'',vendor:''},'101'), /Choose your desk phone/);
});
test('HTTP success does not count as a successful dial unless sent is true', () => {
  for(const data of [{}, {sent:false}, {sent:'true'},null]) assert.throws(() => checkDialResult(data));
  assert.match(checkDialResult({sent:true}),/does not confirm/);
  assert.match(responseError(403),/without a recognized/);
  assert.match(responseError(401),/token/);
});
test('403 distinguishes denied extensions, missing permissions, denied tenants and unknown responses', () => {
  const extensionError={error:{type:'invalid_request_error',message:'You do not have access to this extension.',code:'forbidden_extension',param:'extension'}};
  assert.match(responseError(403,extensionError),/does not have access to the configured extension \(forbidden_extension\)/);
  assert.match(responseError(403,{error:{code:'forbidden_permission',permission:'phone_control_view'}}),/missing phone_control_view/);
  assert.match(responseError(403,{error:{code:'forbidden_permission',permission:'phone_control_call'}}),/missing phone_control_call/);
  assert.match(responseError(403,{error:{code:'forbidden_domain'}}),/cannot access the selected tenant/);
  assert.match(responseError(403,null),/reverse proxy/);
  assert.doesNotMatch(responseError(403,{error:{code:'forbidden_permission',permission:'<script>secret-token</script>',message:'secret-token'}}),/secret-token/);
});
