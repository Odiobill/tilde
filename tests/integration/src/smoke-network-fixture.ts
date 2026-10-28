// Private subprocess fixture: all real sockets are disabled before helper imports.
import net from'node:net';import{appendFileSync}from'node:fs';
net.Socket.prototype.connect=function(){throw Error('FIXTURE_NETWORK_DISABLED');} as typeof net.Socket.prototype.connect;
globalThis.fetch=async()=>{const marker=process.env.TILDE_FIXTURE_FETCH_MARKER;if(!marker)throw Error('FIXTURE_MARKER_REQUIRED');appendFileSync(marker,'denied\n',{mode:0o600});throw Error('FIXTURE_FETCH_DENIED');};
