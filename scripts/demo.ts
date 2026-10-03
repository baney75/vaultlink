import { resolve } from 'node:path';
import { createFixture } from './fixtures';
import { createBridge } from '../bridge/server';
const vault=resolve('.private/demo-vault');
await createFixture(vault);
await createBridge({vault,token:'vaultlink-demo-token-for-synthetic-fixtures-only',port:27124,allowOrigins:['http://127.0.0.1:5178','http://localhost:5178','http://127.0.0.1:27124','chrome-extension://ehhkfcfccadfoelnhjhdgbcmpaeakihn'],staticDir:resolve('dist')});
console.log('Sample vault: http://127.0.0.1:27124\nPairing token: vaultlink-demo-token-for-synthetic-fixtures-only\nThis serves synthetic sample notes only. Ctrl+C stops it.');
