import net from 'node:net';
import { chmod } from 'node:fs/promises';
const server=net.createServer();server.listen(process.argv[2]!,async()=>{await chmod(process.argv[2]!,0o600);process.send?.('ready');});
