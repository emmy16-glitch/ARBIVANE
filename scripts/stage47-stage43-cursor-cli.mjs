import {readFile} from 'node:fs/promises';
import {resolveStage43WindowCursor} from './stage47-stage43-cursor.mjs';

try {
 if(process.argv.length!==3||process.env.EXECUTION_ENABLED!=='false'||
  process.env.NEAR_NETWORK!=='mainnet'||process.env.MAINNET_PRIVATE_KEY||
  process.env.NEAR_PRIVATE_KEY||process.env.NEAR_ACCOUNT_ID)
  throw Error('STAGE47_STAGE43_CURSOR_READONLY');
 const report=JSON.parse(await readFile(process.argv[2],'utf8'));
 const manual=process.env.STAGE47_MANUAL_EXPECTED_CURSOR||null;
 const cursor=resolveStage43WindowCursor(report,manual);
 process.stdout.write(String(cursor)+'\n');
} catch(error) {
 console.error(error instanceof Error?error.message:'STAGE47_STAGE43_BAD_WINDOW');
 process.exitCode=2;
}
