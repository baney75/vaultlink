import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEndpoint} from '../src/lib/api';
test('connection accepts loopback or private Tailscale HTTPS origins',()=>{
 assert.equal(normalizeEndpoint('http://127.0.0.1:27124/'),'http://127.0.0.1:27124');
 assert.equal(normalizeEndpoint('https://host.tail1234.ts.net'),'https://host.tail1234.ts.net');
 for(const value of ['https://evil.example','http://host.tail1234.ts.net','https://host.tail1234.ts.net.evil.example','https://host.tail1234.ts.net/path','https://user:pass@host.tail1234.ts.net','http://127.0.0.1:27124/?token=secret','file:///tmp/note','javascript:alert(1)']) assert.throws(()=>normalizeEndpoint(value));
});
