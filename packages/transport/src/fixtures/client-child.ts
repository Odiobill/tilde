import net from 'node:net';
const client=net.connect(process.argv[2]!);client.once('connect',()=>client.write('child-roundtrip'));client.once('data',data=>{if(data.toString()!=='child-roundtrip')process.exitCode=1;client.end();});client.once('error',()=>{process.exitCode=1;});
