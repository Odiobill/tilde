import { openAgent } from '../index.js';
import { openCredentialStore } from '@tilde/credentials';
import { publicSettings } from '@tilde/config';
import { scripted } from './provider.js';
const {paths,config}=JSON.parse(process.argv[2]!);const agent=await openAgent({paths,config,credentials:openCredentialStore(config.authFile),models:scripted().models});
await agent.watch(e=>{if(e.view.partial?.text)process.send?.('partial');});
if(process.argv[3]==='resume')agent.resume();else await agent.submit({requestId:'crashed',text:'original crash input',selectionRevision:publicSettings(config,paths).selectionRevision});
