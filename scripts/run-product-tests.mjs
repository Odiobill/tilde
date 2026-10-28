import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function find(dir) {
  const result=[];
  for(const item of await readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) {
    if(['node_modules','.build','src'].includes(item.name))continue;
    const path=`${dir}/${item.name}`;
    if(item.isDirectory())result.push(...await find(path));
    else if(path.includes('/dist/') && path.endsWith('.test.js'))result.push(path);
  }
  return result;
}
const tests=(await Promise.all(['packages','apps','tests/integration'].map(find))).flat().sort();
if(!tests.length)throw new Error('No compiled product tests found');
const run=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit'});
process.exitCode=run.status??1;
