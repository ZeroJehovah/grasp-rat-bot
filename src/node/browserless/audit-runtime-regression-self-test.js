'use strict';
const assert = require('node:assert/strict');

async function competitorKill(flags = {}) {
 let output;
 const console = { log: value => { output = JSON.parse(value); } };

const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base=__dirname + '/';
const {parseBrowserlessRunnerArgs}=require('./config');
const {runBrowserlessRunner}=require('./runner');
const {readBrowserlessStateFile,buildCompactBrowserlessStatus}=require('./state-file');

 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grasp-audit-kill-'));
 let at=Date.parse('2026-11-08T04:00:00Z'),getLive,observed;
 const config=parseBrowserlessRunnerArgs(['--once','--live','--data-dir',dir,'--user-id','7','--session-token','audit-fake-token','--login-point-x','1','--login-point-y','2','--login-point-hp','100'],{});
 try{
  const result=await runBrowserlessRunner(config,{
   startStatusServer:false,disableBackgroundIo:true,now:()=>at,sleep:async ms=>{at+=ms;},
   onLiveStateReady:f=>{getLive=f;},
   discoverSourceIps:()=>['10.0.0.1','10.0.0.2','10.0.0.3'],sourceIpPreflightRequest:async()=>({status:200}),
   fetchWithTimeout:async()=>{throw new Error('unexpected network path');},
   snapshotGapPoller:{noteSnapshot(){},refreshSchedule(){},start(){},stop(){},status(){return {stopped:true};}},
   remoteProfitWorker:{context:()=>null,observeDecision(){},observeRealtimeEntities(){},publish:async()=>null,reset(){},status:()=>({enabled:false}),close:async()=>({})},
   runReadOnlyOnce:async(_,options)=>{
    const startedAt=at;
    const self={userId:7,user_id:7,name:'self',x:1,y:2,hp:100,max_hp:100,drop:20};
    options.onLoginSuccess({runId:'audit',firstSelf:self,firstSelfAt:new Date(at).toISOString(),firstSelfTick:100});
    options.onDecision({at:new Date(at).toISOString(),tick:100,action:{kind:'wait'},input:{self,stamina:{stamina1dRemainingMilli:20000000,stamina1dLimitMilli:20000000},selfKillEvidence:[]}});
    options.easyKillPlayerTracker.observeCombatEngagement({userId:8,name:'target',active:true},{atMs:at,tick:100,selfHp:100});
    at+=50;
    options.onSnapshotPayload({tick:101,entities:[],bullets:[],messages:[{kind:'kill',user_id:9,target_user_id:8,target_name:'target',tick:101,at:new Date(at).toISOString()}]}, {source:'ws',observedAtMs:at});
    const live=getLive();
    const tracker=options.easyKillPlayerTracker.status().players.find(p=>p.userId===8);
    observed={trackerKillCount:tracker?.killCount,trackerObservedDeaths:tracker?.observedDeathCount,trackerScore:tracker?.score,sessionKills:live.stats.currentSession.kills,sessionKillKeys:live.stats.currentSession.killKeys,todayKills:buildCompactBrowserlessStatus(live,{nowMs:at}).stats.today.kills};
    return {ok:false,runId:'audit',startedAt:new Date(startedAt).toISOString(),completedAt:new Date(at).toISOString(),error:'combat-critical-hp-leave',snapshotSafety:{ok:true,reason:'safe',satisfied:true},entry:{firstSelf:self},state:{realtime:{self,tick:101}},leave:{ok:true,attempts:[{ok:true,response:{...self,ok:true,event:'left'}}]},safety:{event:{ok:false,reason:'combat-critical-hp-leave',at:new Date(at).toISOString(),shouldLeave:true,detail:{combat:{target:{userId:8,hp:0},metrics:{targetId:'8',startedAt,lastObservedAt:at,initialSelfHp:100,lastSelfHp:100,initialTargetHp:100,lastTargetHp:0,targetDamage:100,selfDamage:0}}}}}};
   }
  });
  const stored=readBrowserlessStateFile(config.stateFile||path.join(dir,'state.json'));
  console.log(JSON.stringify({observed,exitKillConfirmation:stored.recentExits.at(-1)?.killConfirmation||null,runnerOk:result.ok},null,2));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}

 return output;
}

async function authRefresh(flags = {}) {
 let output;
 const console = { log: value => { output = JSON.parse(value); } };

const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base=__dirname + '/';
const {parseBrowserlessRunnerArgs}=require('./config');
const {runBrowserlessRunner}=require('./runner');
const {readBrowserlessStateFile,writeBrowserlessStateFile}=require('./state-file');

 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grasp-audit-auth-'));
 let at=Date.parse('2026-11-08T04:00:00Z'),callback,storedImmediately,initialCanaryToken;
 const beforeLogin=flags.beforeLogin === true;
 const config=parseBrowserlessRunnerArgs(['--live','--data-dir',dir,'--login-point-x','1','--login-point-y','2','--login-point-hp','100'],{});
 const stateFile=config.stateFile||path.join(dir,'state.json');
 writeBrowserlessStateFile(stateFile,{session:{userId:7,sessionToken:'audit-old-token'}});
 try{
  const result=await runBrowserlessRunner(config,{
   startStatusServer:async options=>{callback=options.onCallback;if(beforeLogin){const reply=await callback('audit-callback');storedImmediately={ok:reply.ok,token:readBrowserlessStateFile(stateFile).session.sessionToken};}return {close:async()=>{}};},
   disableBackgroundIo:true,now:()=>at,sleep:async ms=>{at+=ms;},
   submitCallbackInput:async()=>({login:{userId:7,sessionToken:'audit-new-token'},source:'audit'}),
   discoverSourceIps:()=>['10.0.0.1','10.0.0.2','10.0.0.3'],sourceIpPreflightRequest:async()=>({status:200}),
   fetchWithTimeout:async()=>{throw new Error('unexpected network path');},
   snapshotGapPoller:{noteSnapshot(){},refreshSchedule(){},start(){},stop(){},status(){return {stopped:true};}},
   remoteProfitWorker:{context:()=>null,observeDecision(){},observeRealtimeEntities(){},publish:async()=>null,reset(){},status:()=>({enabled:false}),close:async()=>({})},
   runReadOnlyOnce:async(runConfig,options)=>{
    initialCanaryToken=runConfig.sessionToken;
    if(!beforeLogin){const reply=await callback('audit-callback');
    storedImmediately={ok:reply.ok,token:readBrowserlessStateFile(stateFile).session.sessionToken};}
    options.safetyController.requestStop('audit-stop');
    return {ok:false,runId:'audit',error:'audit-stop',completedAt:new Date(at).toISOString(),safety:{event:{reason:'audit-stop',shouldLeave:false,at:new Date(at).toISOString()}}};
   }
  });
  const stored=readBrowserlessStateFile(stateFile);
  console.log(JSON.stringify({beforeLogin,initialCanaryToken,storedImmediately,storedAfterRun:stored.session.sessionToken,reason:result.reason||result.canary?.error},null,2));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}

 return output;
}

async function oldKill(flags = {}) {
 let output;
 const console = { log: value => { output = JSON.parse(value); } };

const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base=__dirname + '/';
const {parseBrowserlessRunnerArgs}=require('./config');
const {runBrowserlessRunner}=require('./runner');
const {createChatService}=require('./chat-service');
const {snapshotObservedKillEvidence}=require('./decision-adapter');

 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grasp-audit-old-kill-'));
 let at=Date.parse('2026-11-08T16:00:10Z'),observed;
 const config=parseBrowserlessRunnerArgs(['--once','--live','--data-dir',dir,'--user-id','7','--session-token','audit-fake-token','--login-point-x','1','--login-point-y','2','--login-point-hp','100'],{});
 const chat=createChatService({now:()=>at,selfUserId:7});
 try{
  await runBrowserlessRunner(config,{
   startStatusServer:false,disableBackgroundIo:true,now:()=>at,sleep:async ms=>{at+=ms;},chatService:chat,
   discoverSourceIps:()=>['10.0.0.1','10.0.0.2','10.0.0.3'],sourceIpPreflightRequest:async()=>({status:200}),
   fetchWithTimeout:async()=>{throw new Error('unexpected network path');},
   snapshotGapPoller:{noteSnapshot(){},refreshSchedule(){},start(){},stop(){},status(){return {stopped:true};}},
   remoteProfitWorker:{context:()=>null,observeDecision(){},observeRealtimeEntities(){},publish:async()=>null,reset(){},status:()=>({enabled:false}),close:async()=>({})},
   runReadOnlyOnce:async(_,options)=>{
    options.dynamicWhitelist.add({userId:8,name:'protected-player'},at-1000);
    const entities=[{user_id:8,name:'protected-player',hp:100,drop:100},{user_id:10,name:'ranked-player',hp:100,drop:500}];
    options.onSnapshotPayload({tick:100,entities,messages:[]},{source:'gap-http',observedAtMs:at,global:true});
    at+=50;
    const payload={tick:101,entities,messages:[{id:1,kind:'kill',user_id:9,target_user_id:8,tick:1700000},{id:2,kind:'kill',user_id:9,target_user_id:10,tick:1700001}]};
    options.onSnapshotPayload(payload,{source:'gap-http',observedAtMs:at,global:true});
    observed={snapshotTick:payload.tick,eventTicks:payload.messages.map(x=>x.tick),ordinaryKillEvidence:snapshotObservedKillEvidence(payload,7),chatOccurredAt:chat.status().messages.map(x=>x.occurredAt),observedAt:new Date(at).toISOString(),protectedMemberRetained:options.dynamicWhitelist.isMember(8),easyKillPlayers:options.easyKillPlayerTracker.status().players.map(x=>({userId:x.userId,score:x.score,killCount:x.killCount}))};
    return {ok:true,runId:'audit-old-kill',completedAt:new Date(at).toISOString()};
   }
  });
  console.log(JSON.stringify(observed,null,2));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}

 return output;
}

async function workerFailure(flags = {}) {
 let output;
 const console = { log: value => { output = JSON.parse(value); } };

const zlib = require('node:zlib');
const base = __dirname + '/';
const { runReadOnlyCanary } = require('./canary');
const { createBrowserlessDecisionAdapter } = require('./decision-adapter');
const { createBrowserlessSafetyController } = require('./safety-controller');

 const exitMode=flags.pendingExit === true;
 let at=1000000,receive,workerReject,stage=0,leaveResolve,leaveStarted=false;
 const calls=[],sent=[],events=[];
 const adapter=createBrowserlessDecisionAdapter({userId:7,now:()=>at,controlMode:'profit-live',combatEnabled:true});
 const safety=createBrowserlessSafetyController({now:()=>at});
 const realEval=adapter.evaluateRealtime.bind(adapter);
 adapter.evaluateRealtime=(state,opts)=>{
  const actual=realEval(state,opts);
  calls.push({at,inputTick:state.realtime.tick,inputAt:state.realtime.receivedAtMs,selfHp:state.realtime.self?.hp,leaveStarted,actionKind:actual?.action?.kind,targetX:actual?.action?.target?.x,movement:actual?.combat?.movement?{dx:actual.combat.movement.dx,dy:actual.combat.movement.dy,reason:actual.combat.movement.reason}:null});
  return actual;
 };
 const worker={ready:async()=>true,flush:async()=>true,close:async()=>true,requestPersistence:async()=>({}),finalize:async()=>({}),evaluate:()=>new Promise((_,reject)=>{workerReject=reject;})};
 function frame(tick,x){
  const self={user_id:7,entity_id:1,x:0,y:0,hp:100,max_hp:100,stamina_5s_remaining_milli:10000,current_join_mode:'Active'};
  const target={user_id:8,entity_id:2,x:5000,y:0,hp:100,max_hp:100,drop:1000,current_join_mode:'Active',moving:true,firing:true};
  const f={type:'pos',tick,entities:[self,target,{...target,user_id:9,entity_id:3,x:-5000}],bullets:[{bullet_id:tick,owner_id:x>0?8:9,start_x:x,start_y:0,target_x:0,target_y:0,created_tick:tick,expire_tick:tick+30,speed:500}]};
  receive(Buffer.concat([Buffer.from('GRZ1'),Buffer.from([1]),zlib.gzipSync(Buffer.from(JSON.stringify(f)))]));
 }
 const result=await runReadOnlyCanary({gameOrigin:'https://self-test.invalid',userId:7,sessionToken:'test',controlMode:'profit-live',combatEnabled:true,readOnlyProbeMs:1500,decisionIntervalMs:1000,combatControlIntervalMs:50,frameGapAlertMs:5000},{
 now:()=>at,decisionAdapter:adapter,safetyController:safety,realtimeControlWorker:worker,wsFrameCoalescing:false,
 precheckedSnapshotSafety:{ok:true,reason:'audit',satisfied:true},
 targetWhitelist:{names:[],userIds:[],refresh:async()=>({}),isWhitelistedTarget:()=>false},
 persistedState:{loginPointSafety:{point:{x:0,y:0,hp:100,source:'audit'}}},
 logStore:{append:(kind,type,detail)=>events.push({kind,type,detail}),flush:async()=>true},
 sleep:async ms=>{
  if(receive && stage===0){stage=1;at+=50;frame(100,5000);await new Promise(r=>setImmediate(r));}
  else if(workerReject && stage===1){stage=2;at+=400;if(exitMode)safety.requestStop("audit-stop");frame(113,-5000);workerReject(new Error('audit worker failure'));await new Promise(r=>setImmediate(r));}
  if(exitMode&&leaveResolve&&stage===2){stage=3;leaveResolve({ok:true,attempts:[{ok:true}]});await new Promise(r=>setImmediate(r));}
  at+=Number(ms);await new Promise(r=>setImmediate(r));
 },
 openBrowserlessWs:async options=>{receive=options.onMessage;return {isOpen:()=>true,close(){},sendVelocity(dx,dy){sent.push({at,dx,dy});},sendShoot(){}};},
 leaveWithVerification:async()=>{leaveStarted=true;if(exitMode)return new Promise(r=>{leaveResolve=r;});return {ok:true,attempts:[{ok:true}]};}
 });
 console.log(JSON.stringify({calls,sent,error:result.error,workerEvents:events.filter(e=>/worker-(failed|stale)/.test(String(e.type))).map(e=>({type:e.type,detail:e.detail})),safetyReason:result.safety.event?.reason},null,2));

 return output;
}

async function staleDrop(flags = {}) {
 let output;
 const console = { log: value => { output = JSON.parse(value); } };

const { buildBrowserlessDecision, buildBrowserlessStrategyInput, buildBrowserlessRuntimeDefaults } = require('./decision-adapter');
const { createBrowserlessActionAdapter } = require('./action-adapter');
function run(age,withKill,nowMs = Date.parse('2026-11-08T04:00:00Z'),unknownObservation = false){
 const self={user_id:7,entity_id:1,x:0,y:0,hp:100,max_hp:100,stamina_5s_remaining_milli:10000,stamina_1h_remaining_milli:3000000,stamina_1d_remaining_milli:20000000};
 const state={userId:7,realtime:{tick:20000,receivedAtMs:nowMs,frameAgeMs:0,self,entities:[self],bullets:[],coinDrops:[],coinDropsObserved:true},fallback:{tick:20000-age/50,receivedAtMs:nowMs-age,frameAgeMs:age,entities:[],coinDrops:[{drop_id:'audit-drop',source_user_id:8,amount:100,x:1000,y:0,created_tick:20000-age/50-1}],coinDropsObserved:true,messages:withKill?[{kind:'kill',user_id:7,target_user_id:8,tick:20000-age/50-2}]:[]}};
 if (unknownObservation) { delete state.fallback.receivedAtMs; delete state.fallback.frameAgeMs; }
 const options=buildBrowserlessRuntimeDefaults({nowMs,controlMode:'profit-live',combatEnabled:true,snapshotCoinFallbackMaxAgeMs:90000});
 options.nowMs=nowMs;
 const input=buildBrowserlessStrategyInput(state,options,{});
 const decision=buildBrowserlessDecision(state,{},options);
 const sent=[];
 const actionAdapter=createBrowserlessActionAdapter({...options,now:()=>nowMs,transport:{sendVelocity:(dx,dy)=>sent.push({dx,dy}),sendShoot:()=>{throw new Error('unexpected shot')}},setTimeout:()=>({unref(){}}),clearTimeout:()=>{}});
 const actionResult=actionAdapter.applyDecision(state,decision);
 actionAdapter.sealTransport('audit-end');
 return {age,withKill,sent,actionResult:{kind:actionResult.kind,reason:actionResult.reason},inputSource:input.profitCoinSource,blockedReasons:input.fallback.snapshotFallbackBlockedReasons,inputProfitCoins:input.profitCoins.map(x=>x.id),reason:decision.reason,action:decision.action?.kind,target:decision.action?.target,profitMission:decision.profit?.mission?.targetId};
}
console.log(JSON.stringify([run(300000,false),run(300000,true),run(1000,true),
 run(90000,true),run(90001,true),run(-1000,true),
 run(1000,true,Date.parse('2026-11-08T16:00:00.500Z')),
 run(1000,true,undefined,true)],null,2));

 return output;
}

async function secondaryQuota(flags = {}) {
 let output;
 const console = { log: value => { output = JSON.parse(value); } };

const {buildBrowserlessCombatDryRun}=require('./combat-adapter');
const {createBrowserlessActionAdapter}=require('./action-adapter');
const {createTickGridShootingState,observeRealtimeTick,claimShootSlot}=require('../../strategy/tick-grid-shooting');
const base=Date.parse('2026-11-08T04:00:00Z');
function run(distance,ownShots){
 const primary={entity_id:42,user_id:42,name:'audit-primary',x:-5000,y:0,vx:0,vy:0,hp:100,max_hp:100,current_join_mode:'AFK',active:false,firing:false,stamina_5s_remaining_milli:10000,stamina_5s_limit_milli:10000,drop:80};
 const memory={profitMission:{active:true,type:'enemy',targetId:'42',target:primary}};
 const options={combatEnabled:true,controlMode:'profit-live',decisionState:memory,combatAttackRange:14500,attackRange:14500};
 let current,combat;
 for(const [age,tick,hp] of [[0,10000,70],[500,10010,70],[1000,10020,67]]){
  const nowMs=base+age;
  const self={entity_id:7,user_id:7,x:0,y:0,vx:0,vy:0,hp,max_hp:100,current_join_mode:'Active',stamina_5s_remaining_milli:10000,stamina_5s_limit_milli:10000,stamina_1h_remaining_milli:3000000,stamina_1d_remaining_milli:10000000};
  const secondary={entity_id:8,user_id:8,name:'audit-secondary',x:distance-800+age*0.8,y:0,vx:40,vy:0,hp:100,max_hp:100,current_join_mode:'Active',active:true,firing:true,stamina_5s_remaining_milli:9000,stamina_5s_limit_milli:10000,drop:1};
  const bullet=(id,created,origin)=>({bullet_id:id,owner_user_id:8,start_x:origin,start_y:0,x:origin-(tick-created)*500,y:0,target_x:0,target_y:0,speed_per_tick:500,created_tick:created,expire_tick:created+30});
  current={userId:7,realtime:{tick,receivedAtMs:nowMs,frameAgeMs:0,self,entities:[self,primary,secondary],bullets:(age===0?[bullet('a',10000,distance-800)]:[bullet('a',10000,distance-800),bullet('b',10010,distance-400)]).filter(b=>b.x>0),coinDrops:[]}};
  if(age===1000) memory.combatTarget.secondaryDispatchTimes=Array.from({length:ownShots},(_,i)=>base+i*500);
  combat=buildBrowserlessCombatDryRun(current,{...options,nowMs});
 }
 const nowMs=base+1000;
 const grid=createTickGridShootingState();
 observeRealtimeTick(grid,{tick:current.realtime.tick,receivedAtMs:nowMs},{dateKey:'2026-11-08'});
 current.realtime.shootingEpoch=grid.epoch;
 const sent=[];
 const adapter=createBrowserlessActionAdapter({now:()=>nowMs,transport:{sendVelocity(){},sendShoot:(...args)=>sent.push(args)},tryClaimShootSlot:request=>claimShootSlot(grid,request),setTimeout:()=>({unref(){}}),clearTimeout(){}});
 const result=adapter.applyCombatDecision(current,{action:{kind:'combat-live',band:'combat',reason:'audit'},combat},{combat});
 adapter.sealTransport('audit-end');
 return{distance,ownShotsBefore:ownShots,mode:combat.shooting.mode,targetRole:combat.shooting.targetRole,secondaryPolicy:combat.shooting.secondaryPolicy,focus:combat.shooting.secondaryFocusActive,wouldShoot:combat.shooting.wouldShoot,blocker:combat.shooting.finalFireBlocker,shootResult:{skipped:result.shoot?.skipped,reason:result.shoot?.reason},sentShots:sent.length,ownShotsAfter:ownShots+sent.length};
}
console.log(JSON.stringify({runtime:process.version,network:'injected transport only',cases:[run(6000,2),run(7000,2),run(7000,1)]},null,2));

 return output;
}

async function externalDamage(flags = {}) {
 let output;
 const console = { log: value => { output = JSON.parse(value); } };

const {buildBrowserlessDecision}=require('./decision-adapter');
const base=Date.parse('2026-11-08T04:00:00Z');
function run(externalDamage, ownShot = false, knownAim = true){
 const memory={};const rows=[];
 for(let age=0;age<=3100;age+=50){
  const tick=10000+age/50,nowMs=base+age;
  const self={entity_id:1,user_id:7,name:'self',x:0,y:0,vx:0,vy:0,hp:94,max_hp:100,current_join_mode:'Active',stamina_5s_remaining_milli:10000,stamina_5s_limit_milli:10000,stamina_1h_remaining_milli:2000000,stamina_1h_limit_milli:3000000,stamina_1d_remaining_milli:10000000,stamina_1d_limit_milli:10000000};
  const target={entity_id:2,user_id:8,name:'audit-secondary',x:5000,y:0,vx:0,vy:0,hp:externalDamage&&age>=100?97:100,max_hp:100,current_join_mode:'Active',firing:age===0,drop:4,stamina_5s_remaining_milli:2350,stamina_5s_limit_milli:10000};
  const bullets=age===0?[{bullet_id:21,owner_user_id:8,start_x:5000,start_y:0,target_x:0,target_y:0,created_tick:tick,expire_tick:tick+29,speed_per_tick:500}]:externalDamage&&age===50?[{bullet_id:22,owner_user_id:9,start_x:5000,start_y:500,target_x:5000,target_y:0,created_tick:tick,expire_tick:tick+29,speed_per_tick:500}]:[];
  const state={userId:7,realtime:{tick,frameAgeMs:0,receivedAtMs:nowMs,self,entities:[self,target],bullets,coinDrops:[]},fallback:{tick,frameAgeMs:0,receivedAtMs:nowMs,entities:[],coinDrops:[],messages:[]}};
  if (age === 50 && ownShot) require('./combat-adapter').recordCombatShotLearning(memory, target, {}, {
    nowMs, bulletId: 'our-confirmed-bullet', acceptedShotOrdinal: 1, createdTick: 9992,
    flightTicks: 10, aimX: knownAim ? 5000 : null, aimY: knownAim ? 0 : null
  });
  const decision=buildBrowserlessDecision(state,memory,{nowMs,controlMode:'profit-live',combatEnabled:true,combatAttackRange:14500,dynamicProfitThresholdEnabled:false,creatorUserIds:[],targetWhitelistUserIds:[],targetWhitelistNames:[],dynamicWhitelistMemberUserIds:[],dynamicWhitelistEnabledUserIds:[]});
  if([0,100,2500,2550,3100].includes(age))rows.push({age,action:decision.action.kind,reason:decision.reason,targetId:decision.combat.target?.userId??null,retention:decision.combat.secondaryRetention?.reason,retained:decision.combat.secondaryRetention?.retained,progress:memory.combatTarget?.damageFromStart??null,targetDamage:memory.combatMetrics?.targetDamage??null,acceptedShots:memory.combatMetrics?.acceptedShots??0,ownDamageEvidence:decision.combat.secondaryRetention?.ownDamageProgress,shooting:decision.combat.shooting?.wouldShoot});
 }
 return{externalDamage,ownShot,knownAim,rows};
}
console.log(JSON.stringify({runtime:process.version,network:'none',actualActionsSent:0,cases:[run(false),run(true),run(true,true),run(true,true,false)]},null,2));

 return output;
}

async function runAuditRuntimeRegressionSelfTest() {
 const kill = await competitorKill();
 assert.equal(kill.observed.sessionKills, 0);
 assert.equal(kill.observed.todayKills, 0);
 assert.equal(kill.observed.trackerKillCount, 0);
 assert(kill.observed.trackerObservedDeaths > 0);
 assert.equal(kill.exitKillConfirmation, null);
 for (const beforeLogin of [false, true]) {
   const auth = await authRefresh({ beforeLogin });
   assert.equal(auth.storedAfterRun, 'audit-new-token');
   assert.equal(auth.storedImmediately.token, 'audit-new-token');
   if (beforeLogin) assert.equal(auth.initialCanaryToken, 'audit-new-token');
 }
 const old = await oldKill();
 assert.equal(old.protectedMemberRetained, true);
 assert.deepEqual(old.easyKillPlayers, []);
 const worker = await workerFailure();
 assert(worker.calls.length > 0);
 assert(worker.calls.every(call => call.inputTick !== 100));
 assert(worker.sent.some(command => command.dy === 1));
 const exitWorker = await workerFailure({ pendingExit: true });
 assert(!exitWorker.calls.some(call => call.leaveStarted));
 const drop = await staleDrop();
 assert.equal(drop[1].inputProfitCoins.length, 0);
 assert(drop[2].inputProfitCoins.length > 0);
 assert(drop[3].inputProfitCoins.length > 0);
 for (const index of [4, 5, 6, 7]) assert.equal(drop[index].inputProfitCoins.length, 0);
 const quota = await secondaryQuota();
 assert.equal(quota.cases[0].sentShots, 0);
 assert.equal(quota.cases[1].sentShots, 0);
 assert.equal(quota.cases[2].sentShots, 1);
 const damage = await externalDamage();
 for (const scenario of damage.cases) {
   assert.equal(scenario.rows.at(-1).targetId, scenario.ownShot && scenario.knownAim ? 8 : null);
   if (scenario.externalDamage) assert.equal(scenario.rows.find(row => row.age === 100).targetDamage, 3);
 }
 assert.equal(damage.cases[2].rows.at(-1).ownDamageEvidence.damageProgress, 3);
 return {ok:true, cases:9};
}
module.exports = { runAuditRuntimeRegressionSelfTest };
if (require.main === module) runAuditRuntimeRegressionSelfTest().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
