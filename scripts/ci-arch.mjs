// Manual-only disposable Arch runner entry point; never installs host packages.
import {readFile,mkdir,cp,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {exportSource} from './export-source.mjs';
import {prepareArchBuild} from './prepare-arch-build.mjs';
import {qualifyArch} from './qualify-arch.mjs';
import {validateReleaseInput} from './check-workflows.mjs';
const{values}=parseArgs({options:{output:{type:'string'}}});if(!values.output||process.geteuid()===0||!/^ID=["']?arch["']?$/m.test(await readFile('/etc/os-release','utf8')))throw Error('DISPOSABLE_NONROOT_ARCH_RUNNER_REQUIRED');
const output=resolve(values.output);await mkdir(output,{mode:0o700});const source=await exportSource({root:resolve('.'),output:join(output,'source'),version:process.env.RELEASE_VERSION});
const manifest=JSON.parse(await readFile(join(output,'source/source-manifest.json'),'utf8'));validateReleaseInput({version:process.env.RELEASE_VERSION,expectedSourceSha256:process.env.SOURCE_SHA256,manifest});
const cache=join(output,'npm-cache');const acquired=spawnSync('/usr/bin/npm',['ci','--ignore-scripts','--cache',cache],{cwd:source.tree,stdio:'inherit',timeout:300000});if(acquired.status!==0)throw Error('CI_CACHE_ACQUISITION_FAILED');
await prepareArchBuild({root:resolve('.'),source:source.archive,sha256:source.sha256,output:join(output,'build'),npmCache:cache});
const result=await qualifyArch({buildRoot:join(output,'build'),evidence:join(output,'evidence')});
if(!['arch.build','arch.inspection'].every(id=>result.cases.some(c=>c.id===id&&c.status==='pass'&&c.exitCode===0&&c.cleanup===true)))throw Error('ARCH_BUILD_OR_INSPECTION_FAILED');
const artifacts=join(output,'artifacts');await mkdir(artifacts,{mode:0o700});for(const name of (await readdir(join(output,'build'))).filter(p=>p.endsWith('.pkg.tar.zst')))await cp(join(output,'build',name),join(artifacts,name));
await cp(source.archive,join(artifacts,'tilde-0.1.1.tar.gz'));await cp(join(output,'source/source-manifest.json'),join(artifacts,'source-manifest.json'));await cp(join(output,'evidence/inspection.json'),join(artifacts,'arch-inspection.json'));
await writeFile(join(artifacts,'arch-build-manifest.json'),JSON.stringify({version:'0.1.1',sourceSha256:source.sha256,githubCommit:process.env.GITHUB_SHA,build:'pass',inspection:'pass',installed:'not_run',readiness:'verification_pending'},null,2)+'\n');
