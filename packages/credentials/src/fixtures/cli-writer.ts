import lockfile from 'proper-lockfile';
import { readFile,writeFile } from 'node:fs/promises';
const path=process.argv[2]!;
const release=await lockfile.lock(path,{realpath:false,stale:30000,update:5000});
process.send?.('locked');
await new Promise<void>(resolve=>process.once('message',()=>resolve()));
const data=JSON.parse(await readFile(path,'utf8'));data.cli={type:'api_key',key:'cli-fixture',unknown:'preserve'};
await writeFile(path,JSON.stringify(data),{mode:0o600});await release();process.disconnect?.();
