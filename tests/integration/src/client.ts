import{Client as DaemonClient}from'../../../apps/daemon/dist/fixtures/client.js';
// Polling integration fixtures stay within the unchanged 128 requests / 10 seconds boundary.
export class Client extends DaemonClient{constructor(path:string){super(path,85);}}
