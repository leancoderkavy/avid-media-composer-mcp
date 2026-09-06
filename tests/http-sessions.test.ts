import {afterEach,expect,it} from 'vitest';
import {createHttpServer} from '../src/http-app.js';
import {loadConfig} from '../src/config.js';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const token='session-lifecycle-test-bearer-token-32';
const servers:ReturnType<typeof createHttpServer>[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();})));});
async function fixture(options:Omit<Parameters<typeof createHttpServer>[0],'authToken'>={}){
 const server=createHttpServer({authToken:token,...options});servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');
 const request=(body:unknown,session?:string,method='POST',bearer=token)=>fetch(`http://127.0.0.1:${address.port}/mcp`,{method,headers:{Authorization:`Bearer ${bearer}`,Accept:'application/json, text/event-stream','Content-Type':'application/json',...(session?{'mcp-session-id':session}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 const initialize=()=>request({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'session-test',version:'1'}}});
 return {request,initialize};
}
it('retains initialized sessions across responses and removes them on DELETE',async()=>{
 const f=await fixture(),init=await f.initialize();expect(init.status).toBe(200);const session=init.headers.get('mcp-session-id')!;expect(session).toBeTruthy();await init.text();
 const ping=await f.request({jsonrpc:'2.0',id:2,method:'ping'},session);expect(ping.status).toBe(200);await ping.text();
 const unauthorized=await f.request({jsonrpc:'2.0',id:3,method:'ping'},session,'POST','wrong');expect(unauthorized.status).toBe(401);await unauthorized.text();
 const removed=await f.request(null,session,'DELETE');expect(removed.status).toBe(200);await removed.text();
 const stale=await f.request({jsonrpc:'2.0',id:4,method:'ping'},session);expect(stale.status).toBe(404);await stale.text();
});
it('bounds sessions and releases capacity after explicit termination',async()=>{
 const f=await fixture({maxSessions:1}),init=await f.initialize(),session=init.headers.get('mcp-session-id')!;await init.text();
 const full=await f.initialize();expect(full.status).toBe(503);await full.text();
 await (await f.request(null,session,'DELETE')).text();
 const replacement=await f.initialize();expect(replacement.status).toBe(200);await replacement.text();
});
it('expires an idle session and refuses stale identifiers',async()=>{
 const f=await fixture({sessionIdleTimeoutMs:40}),init=await f.initialize(),session=init.headers.get('mcp-session-id')!;await init.text();
 await new Promise(resolve=>setTimeout(resolve,100));
 const expired=await f.request({jsonrpc:'2.0',id:2,method:'ping'},session);expect(expired.status).toBe(404);await expired.text();
});
it('invalid initialization does not consume session capacity',async()=>{
 const f=await fixture({maxSessions:1});
 const invalid=await f.request({invalid:true});expect(invalid.status).toBe(400);await invalid.text();
 const valid=await f.initialize();expect(valid.status).toBe(200);await valid.text();
});
it('preserves a live tool service across requests while isolating another session',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'http-service-'));
 const f=await fixture({config:loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write'})});
 const init=await f.initialize(),first=init.headers.get('mcp-session-id')!;await init.text();
 const other=await f.initialize(),second=other.headers.get('mcp-session-id')!;await other.text();
 const call=async(session:string,action:string)=>{
   const response=await f.request({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'avid_watch_service',arguments:{action}}},session);
   expect(response.status).toBe(200);const body=await response.text(),data=body.split('\n').find(line=>line.startsWith('data: '));expect(data).toBeTruthy();
   const result=JSON.parse(data!.slice(6)).result;expect(result.isError).not.toBe(true);return result.structuredContent.data;
 };
 expect(await call(first,'start')).toMatchObject({running:true});
 expect(await call(first,'status')).toMatchObject({running:true});
 expect(await call(second,'status')).toMatchObject({running:false});
 expect(await call(first,'stop')).toMatchObject({running:false});
});
