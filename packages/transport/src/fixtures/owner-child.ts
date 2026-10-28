import { acquireDaemonOwner } from '../index.js';
await acquireDaemonOwner(process.argv[2]!);process.send?.('ready');
