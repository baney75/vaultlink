import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEndpoint} from '../src/lib/api';
test('connection accepts loopback or private Tailscale HTTPS origins',()=>{
 assert.equal(normalizeEndpoint('http://127.0.0.1:27124/'),'http://127.0.0.1:27124');
 assert.equal(normalizeEndpoint('https://host.example.ts.net'),'https://host.example.ts.net');
 for(const value of ['https://evil.example','http://host.example.ts.net','https://host.example.ts.net.evil.example','https://host.example.ts.net/path','https://user:pass@host.example.ts.net','http://127.0.0.1:27124/?token=secret','file:///tmp/note','javascript:alert(1)']) assert.throws(()=>normalizeEndpoint(value));
});
