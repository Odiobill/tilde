// Future manual workflow entry points. Local source validation never publishes.
import {readFile,readdir,mkdir,cp,writeFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {validateReleaseInput} from './check-workflows.mjs';
const exec=promisify(execFile),sha=value=>createHash('sha256').update(value).digest('hex');
export function releaseIdentity(env=process.env){
 const version=env.RELEASE_VERSION,sourceSha256=env.SOURCE_SHA256;
 if(version!=='0.1.0'||!/^([a-f0-9]{64})$/.test(sourceSha256??''))throw Error('RELEASE_INPUT_INVALID');
 return{version,sourceSha256};
}
export async function assembleCiDraft({inputs,output,env=process.env,root=resolve('.')}){
 const identity=releaseIdentity(env);if(!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||!/^[-\w.]+\/[-\w.]+$/.test(env.GITHUB_REPOSITORY??''))throw Error('RELEASE_REPOSITORY_IDENTITY_INVALID');
 inputs=resolve(inputs);output=resolve(output);
 const native=JSON.parse(await readFile(join(inputs,'source/source-manifest.json'),'utf8')),arch=JSON.parse(await readFile(join(inputs,'arch/source-manifest.json'),'utf8'));
 validateReleaseInput({version:identity.version,expectedSourceSha256:identity.sourceSha256,manifest:native});validateReleaseInput({version:identity.version,expectedSourceSha256:identity.sourceSha256,manifest:arch});
 if(JSON.stringify(native)!==JSON.stringify(arch))throw Error('CI_SOURCE_MANIFEST_MISMATCH');
 const archive=join(inputs,'source/tilde-0.1.0.tar.gz');if(sha(await readFile(archive))!==identity.sourceSha256||sha(await readFile(join(inputs,'arch/tilde-0.1.0.tar.gz')))!==identity.sourceSha256)throw Error('CI_SOURCE_BYTES_MISMATCH');
 const packages=(await readdir(join(inputs,'arch'))).filter(name=>/^tilde-assistant-0\.1\.0-1-x86_64\.pkg\.tar\.zst$/.test(name));if(packages.length!==1)throw Error('CI_PACKAGE_COUNT_INVALID');
 const build=JSON.parse(await readFile(join(inputs,'arch/arch-build-manifest.json'),'utf8')),inspection=JSON.parse(await readFile(join(inputs,'arch/arch-inspection.json'),'utf8'));
 const packagePath=join(inputs,'arch',packages[0]),packageSha256=sha(await readFile(packagePath));
 if(build.version!==identity.version||build.sourceSha256!==identity.sourceSha256||build.githubCommit!==env.GITHUB_SHA||build.build!=='pass'||build.inspection!=='pass'||build.readiness!=='verification_pending'||inspection.valid!==true||inspection.sourceSha256!==identity.sourceSha256||inspection.packageSha256!==packageSha256)throw Error('CI_ARCH_IDENTITY_OR_INSPECTION_FAILED');
 await mkdir(output,{mode:0o700});const assets=[];
 for(const [source,name] of [[archive,'tilde-0.1.0.tar.gz'],[packagePath,packages[0]],[join(root,'THIRD_PARTY_NOTICES.md'),'THIRD_PARTY_NOTICES.md'],[join(root,'docs/public/release-notes-0.1.0.md'),'release-notes-0.1.0.md']]){if(!(await lstat(source)).isFile())throw Error('CI_ASSET_UNSAFE');await cp(source,join(output,name),{errorOnExist:true,force:false});assets.push(name);}
 const manifest={version:identity.version,sourceSha256:identity.sourceSha256,packageSha256,githubCommit:env.GITHUB_SHA,repository:env.GITHUB_REPOSITORY,readiness:'verification_pending',ci:{native:'pass via required same-run dependency',archBuild:'pass',archInspection:'pass'},requiredLocalQualification:'not supplied to CI; owner/real desktop/AT-SPI/guest-cut/license/review/manual rows remain independent',assets};
 await writeFile(join(output,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o644});assets.push('build-manifest.json');
 await writeFile(join(output,'SHA256SUMS'),(await Promise.all(assets.map(async name=>sha(await readFile(join(output,name)))+'  '+name))).join('\n')+'\n',{flag:'wx',mode:0o644});return{...manifest,assets:[...assets,'SHA256SUMS']};
}
export async function publishDraft({assets,env=process.env,execute=exec}){
 const identity=releaseIdentity(env);if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||!env.GH_TOKEN||!/^[-\w.]+\/[-\w.]+$/.test(env.GITHUB_REPOSITORY??'')||!/^([a-f0-9]{40})$/.test(env.GITHUB_SHA??''))throw Error('MANUAL_GITHUB_DRAFT_CONTEXT_REQUIRED');
 assets=resolve(assets);const manifest=JSON.parse(await readFile(join(assets,'build-manifest.json'),'utf8'));
 if(manifest.readiness!=='verification_pending'||manifest.sourceSha256!==identity.sourceSha256||manifest.githubCommit!==env.GITHUB_SHA||manifest.repository!==env.GITHUB_REPOSITORY)throw Error('DRAFT_MANIFEST_MISMATCH');
 const options={env,timeout:30000,maxBuffer:1048576};
 let object=JSON.parse((await execute('gh',['api',`repos/${env.GITHUB_REPOSITORY}/git/ref/tags/v${identity.version}`],options)).stdout).object;
 for(let depth=0;object?.type==='tag'&&depth<3;depth++)object=JSON.parse((await execute('gh',['api',`repos/${env.GITHUB_REPOSITORY}/git/tags/${object.sha}`],options)).stdout).object;
 if(object?.type!=='commit'||object.sha!==env.GITHUB_SHA)throw Error('RELEASE_TAG_COMMIT_MISMATCH');
 const expected=new Set([...manifest.assets,'build-manifest.json','SHA256SUMS']);const actual=await readdir(assets);if(actual.length!==expected.size||actual.some(p=>!expected.has(p)))throw Error('DRAFT_ASSET_ALLOWLIST_MISMATCH');
 const checksums=(await readFile(join(assets,'SHA256SUMS'),'utf8')).trim().split('\n'),covered=new Set();for(const name of actual)if(!(await lstat(join(assets,name))).isFile())throw Error('DRAFT_ASSET_UNSAFE');for(const line of checksums){const match=line.match(/^([a-f0-9]{64})  ([a-zA-Z0-9._-]+)$/);if(!match||!expected.has(match[2])||match[2]==='SHA256SUMS'||covered.has(match[2])||sha(await readFile(join(assets,match[2])))!==match[1])throw Error('DRAFT_ASSET_CHECKSUM_MISMATCH');covered.add(match[2]);}
 if(covered.size!==expected.size-1)throw Error('DRAFT_ASSET_CHECKSUM_MISSING');
 return execute('gh',['release','create','v'+identity.version,'--repo',env.GITHUB_REPOSITORY,'--verify-tag','--draft','--title','Tilde '+identity.version+' — verification pending','--notes-file',join(assets,'release-notes-0.1.0.md'),...actual.map(name=>join(assets,name))],options);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[action,...argv]=process.argv.slice(2);const{values}=parseArgs({args:argv,options:{inputs:{type:'string'},output:{type:'string'},assets:{type:'string'}}});if(action==='validate')console.log(JSON.stringify(releaseIdentity()));else if(action==='assemble')console.log(JSON.stringify(await assembleCiDraft(values),null,2));else if(action==='draft')await publishDraft(values);else throw Error('CI_RELEASE_ACTION_INVALID');}
