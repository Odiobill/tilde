import { lstat,mkdir,writeFile } from 'node:fs/promises';
import { isAbsolute,join } from 'node:path';
import { resolvePaths,preparePaths,loadConfig,saveConfig,readPrivateFile } from '@tilde/config';
import { openCredentialStore,saveApiKey } from '@tilde/credentials';
import { openAgent } from '@tilde/agent';
import { scripted } from '../../../../packages/agent/dist/fixtures/provider.js';
import{createModels}from'@earendil-works/pi-ai/models';
import{fauxProvider,fauxAssistantMessage,fauxToolCall}from'@earendil-works/pi-ai/providers/faux';
import { startDaemon } from '../daemon.js';
const args=process.argv.slice(2);if(args[0]!=='--fixture'||!args[1]||!isAbsolute(args[1])||args.length>3||args[2]&&!['--missing-auth','--tools'].includes(args[2]))throw new Error('PRIVATE_FIXTURE_REQUIRED');
const home=args[1];const stat=await lstat(home);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.geteuid!()||(stat.mode&0o777)!==0o700)throw new Error('PRIVATE_FIXTURE_REQUIRED');
await mkdir(join(home,'run'),{mode:0o700,recursive:true});
const paths=resolvePaths({XDG_RUNTIME_DIR:join(home,'run')},home,process.geteuid!());await preparePaths(paths,process.geteuid!());const config=await loadConfig(paths);await saveConfig(paths,config);
if(args[2]!=='--missing-auth'&&await readPrivateFile(config.authFile,8388608)===undefined)await saveApiKey(openCredentialStore(config.authFile),'opencode-go','private-fixture-key');
let models=scripted().models;if(args[2]==='--tools'){const work=join(home,'work');await mkdir(work,{mode:0o700,recursive:true});await writeFile(join(home,'.config/tilde/tools.toml'),`version=1\nroots=["${work}"]\nretentionDays=7\n`,{mode:0o600});const p=fauxProvider({provider:'opencode-go',models:[{id:'deepseek-v4.1-flash'}],tokensPerSecond:100000});p.setResponses([fauxAssistantMessage(fauxToolCall('shell_run',{cwd:work,script:'printf fixture > approved-marker'}),{stopReason:'toolUse'}),fauxAssistantMessage('fixture complete')]);models=createModels();models.setProvider(p.provider);}
const daemon=await startDaemon({paths,config,providerEnv:{},agentFactory:options=>openAgent({...options,models})});
process.stdout.write(JSON.stringify({event:'ready',version:2,socketPath:paths.socketPath})+'\n');
let stopping=false;for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{if(stopping)return;stopping=true;void daemon.close().then(()=>{process.exitCode=0;},()=>{process.exitCode=1;});});
