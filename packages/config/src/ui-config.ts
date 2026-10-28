import {dirname,join} from 'node:path';
import {parse,stringify} from 'smol-toml';
import {ConfigError,inspectDirectory,type RuntimePaths} from './paths.js';
import {readPrivateFile,writePrivateAtomic} from './files.js';
import {serializeSettingsWrite,settingsRevision} from './limits.js';
export type UiPreferences={version:1;theme:'system'|'light'|'dark';trayEnabled:boolean;hideOnClose:boolean;notifyCompletion:boolean;notifyAttention:boolean};
export type PublicUiPreferences=UiPreferences & {revision:string};
const defaults:UiPreferences={version:1,theme:'system',trayEnabled:true,hideOnClose:false,notifyCompletion:false,notifyAttention:false};
function check(value:unknown):UiPreferences{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ConfigError('UI_PREFS_INVALID');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!==Object.keys(defaults).sort().join(',')||v.version!==1||!['system','light','dark'].includes(String(v.theme))||['trayEnabled','hideOnClose','notifyCompletion','notifyAttention'].some(k=>typeof v[k]!=='boolean'))throw new ConfigError('UI_PREFS_INVALID');
 return {version:1,theme:v.theme as UiPreferences['theme'],trayEnabled:v.trayEnabled as boolean,hideOnClose:v.hideOnClose as boolean,notifyCompletion:v.notifyCompletion as boolean,notifyAttention:v.notifyAttention as boolean};
}
async function readState(paths:RuntimePaths):Promise<{settings:UiPreferences;raw:string|undefined}>{
 try{await inspectDirectory(dirname(paths.configFile),process.geteuid!(),true);const raw=await readPrivateFile(join(dirname(paths.configFile),'ui.toml'),65536);return {settings:check(raw===undefined?defaults:parse(raw)),raw};}catch{throw new ConfigError('UI_PREFS_INVALID');}
}
export async function loadUiPreferences(paths:RuntimePaths):Promise<PublicUiPreferences>{const {settings}=await readState(paths);return {...settings,revision:settingsRevision(settings)};}
export async function updateUiPreferences(paths:RuntimePaths,expectedRevision:string,next:UiPreferences):Promise<PublicUiPreferences>{
 const settings=check(next),file=join(dirname(paths.configFile),'ui.toml');
 return serializeSettingsWrite(file,async()=>{const current=await readState(paths);if(settingsRevision(current.settings)!==expectedRevision)throw new ConfigError('UI_PREFS_CHANGED');await writePrivateAtomic(file,stringify(settings),async()=>{if((await readState(paths)).raw!==current.raw)throw new ConfigError('UI_PREFS_CHANGED');});return loadUiPreferences(paths);});
}
