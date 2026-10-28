import { resolvePaths,preparePaths,loadSelection } from '@tilde/config';
import { homedir } from 'node:os';
import { startDaemon } from './daemon.js';
try{
 const paths=resolvePaths(process.env,homedir(),process.geteuid!());await preparePaths(paths,process.geteuid!());const selected=(await loadSelection(paths)).selection;const config={version:1 as const,providerId:selected.providerId,modelId:selected.modelId,authFile:selected.authFile};
 const daemon=await startDaemon({paths,config});process.stdout.write(JSON.stringify({event:'ready',version:1})+'\n');
 let stopping=false;const stop=()=>{if(stopping)return;stopping=true;void daemon.close().then(()=>{process.exitCode=0;},()=>{process.stderr.write('{"event":"stop_failed"}\n');process.exitCode=1;});};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
}catch{process.stderr.write('{"event":"startup_failed"}\n');process.exitCode=1;}
