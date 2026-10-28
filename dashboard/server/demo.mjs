/** Isolated Demo scenario: no RPC, keys, signing, or real receipts. */
const borrowers=['vault-0142.demo','vault-0827.demo','vault-1390.demo','vault-2064.demo'];
const f=n=>n.toFixed(2);
export const demoReadiness=()=>({environment:'demo',status:'ready',chainId:'simulation',
 blockHeight:null,checkedAt:new Date().toISOString(),
 capabilities:{read:true,automate:true,deposit:false,withdraw:false,mainnetSpending:false},
 requirements:{scenario:'demo',executionAdapterConfigured:false}});
export function demoQuote(amount,cycle){
 const repay=Number((amount*(0.54+cycle*0.09)).toFixed(2));
 const gross=Number((repay*(0.012+cycle*0.002)).toFixed(2));
 const fees=Number((repay*0.001).toFixed(2));
 const gas=Number((0.05+cycle*0.03).toFixed(2));
 const swap=Number((repay*0.0005).toFixed(2));
 return {repay,gross,fees,gas,swap,net:Number((gross-fees-gas-swap).toFixed(2))};
}
export class DemoAutomation{
 constructor({store,publish,intervalMs=1000,maxCycles=4}){
  this.store=store;this.publish=publish;this.intervalMs=intervalMs;
  this.maxCycles=maxCycles;this.jobs=new Map();this.starting=false;
 }
 // Reconnect only a local browser simulation using its saved phase/cycle.
 async recover(){
  const state=await this.store.state('demo');
  const session=state.session;
  if(!session?.demo||!['running','paused'].includes(session.status)||
   this.jobs.has(session.id))return;
  const checkpoint=session.demoCheckpoint??{cycle:0,phase:0};
  if(!Number.isSafeInteger(checkpoint.cycle)||checkpoint.cycle<0||
     checkpoint.cycle>=this.maxCycles||!Number.isSafeInteger(checkpoint.phase)||
     checkpoint.phase<0||checkpoint.phase>13)return;
  const job={id:session.id,amount:Number(session.settings.maxFinancingUsd),
   cycle:checkpoint.cycle,phase:checkpoint.phase,
   completed:state.transactions.length,
   gross:Number(state.accounting.grossProceeds??0),
   fees:Number(state.accounting.financingFees??0),
   gas:Number(state.accounting.gasFees??0),
   swap:Number(state.accounting.swapCosts??0),
   net:Number(state.accounting.cumulativeNetPnl??0),timer:null};
  if(!Number.isFinite(job.amount)||job.amount<=0)return;
  this.jobs.set(session.id,job);
  if(session.status==='running')this.schedule(job);
 }
 async emit(stage,status,message,evidence={}){
  const e=await this.store.event('demo',{stage,status,message,
   evidence:{...evidence,scenario:'demo'}});
  this.publish(e);
 }
 async start(settings){
  if(this.starting||this.jobs.size)throw Error('SESSION_ALREADY_ACTIVE');
  this.starting=true;
  try{
   const previous=await this.store.state('demo');
   if(previous.session&&['starting','running','pause_requested','stopping'].includes(previous.session.status))
    throw Error('SESSION_ALREADY_ACTIVE');
   const amount=Number(settings.maxFinancingUsd);
   if(!Number.isFinite(amount)||amount<=0||amount>999999999)throw Error('INVALID_MAX_FINANCING');
   const session=this.store.newSession('demo',settings);
   session.status='running';session.demo=true;session.startedAt=new Date().toISOString();
   session.demoCheckpoint={cycle:0,phase:0};
   const job={id:session.id,amount,cycle:0,phase:0,completed:0,
    gross:0,fees:0,gas:0,swap:0,net:0,timer:null};
   await this.store.update('demo',s=>{
    s.session=session;s.settings=settings;
    s.wallet={status:'connected',accountId:'demo-portfolio',
     balances:[{tokenId:'USD',atomic:f(amount)}],verifiedAt:new Date().toISOString()};
    s.accounting={currency:'USD',available:f(amount),pending:'0.00',grossProceeds:'0.00',
     financingFees:'0.00',swapCosts:'0.00',gasFees:'0.00',realizedProfit:'0.00',
     realizedLoss:'0.00',cumulativeNetPnl:'0.00',reconciledAt:new Date().toISOString(),
     evidence:{scenario:'demo',startingBudgetUsd:f(amount),positionsCompleted:0}};
    s.transactions=[];s.opportunities=[];return s;
   });
   this.jobs.set(session.id,job);
   await this.emit('system','running','Automation started · portfolio and risk controls loaded.',{financingCapUsd:f(amount)});
   this.schedule(job);return session;
  }finally{this.starting=false}
 }
 schedule(job){
  job.timer=setTimeout(()=>{void this.tick(job.id).catch(error=>this.fail(job.id,error))},this.intervalMs);
  job.timer.unref?.();
 }
 async fail(id,error){
  const job=this.jobs.get(id);if(!job)return;
  clearTimeout(job.timer);this.jobs.delete(id);
  await this.store.update('demo',s=>{if(s.session?.id===id){
   s.session.status='failed';s.session.endedAt=new Date().toISOString();
   s.session.failure={code:'DEMO_SCENARIO_INTERRUPTED'};}return s;});
  await this.emit('system','failure','Scenario interrupted · restart to begin a new run.',
   {reason:String(error?.message||'INTERRUPTED').slice(0,80)});
 }
 async tick(id){
  const job=this.jobs.get(id);if(!job)return;
  const state=await this.store.state('demo');
  if(state.session?.id!==id||state.session.status!=='running')return;
  const c=job.cycle,p=job.phase,borrower=borrowers[c%borrowers.length];
  const q=demoQuote(job.amount,c),block=132840000+c*17+p;
  const evidence={cycle:c+1,borrower,block};
  const events=[
   ['scan','running','Connecting to lending positions and token markets.'],
   ['scan','info','Scanning 1,240 borrowers · identifying active debt accounts.'],
   ['scan','info','Index expanded · 3,180 accounts assessed across lending markets.'],
   ['discovery','success','Liquidation candidate identified · health factor below threshold.'],
   ['oracle','info','Oracle price feeds verified · collateral valuation refreshed.'],
   ['risk','success','Risk checks passed · repayment size within financing limit.'],
   ['competition','info','Checking competing liquidators and execution timing.'],
   ['execution','running','Financing plan prepared · slippage and fee budget reserved.'],
   ['execution','running','Liquidation transaction submitted · awaiting confirmation.'],
   ['confirmation','success','Transaction confirmed · collateral transferred to portfolio.'],
   ['settlement','success','Financing repaid · network fees and execution costs settled.'],
   ['accounting','success','Settlement complete · portfolio and earnings updated.'],
   ['monitoring','running','Portfolio reconciled · preparing next market scan.'],
  ];
  if(p>=events.length){
   job.phase=0;job.cycle++;
   if(job.cycle>=this.maxCycles){
    this.jobs.delete(id);clearTimeout(job.timer);
    await this.store.update('demo',s=>{if(s.session?.id===id){
     s.session.status='completed';s.session.endedAt=new Date().toISOString();}return s});
    await this.emit('system','success','Automation completed · all market scenarios processed.',
     {positionsCompleted:job.completed,netUsd:f(job.net)});
    return;
   }
   await this.emit('scan','running','Next market cycle initiated · searching for new borrowers.',
    {cycle:job.cycle+1});
  }else{
   if(p===0)evidence.accountsScanned=120+c*12;
   if(p===1){evidence.accountsScanned=1240;evidence.debtPositions=38}
   if(p===2){evidence.accountsScanned=3180;evidence.debtPositions=112}
   if(p===3){
    evidence.healthFactor=0.982;evidence.repayUsd=f(q.repay);
    await this.store.update('demo',s=>{
     s.opportunities=[{id:'DEMO-CANDIDATE-'+(c+1),
      borrowerAccountId:borrower,healthFactor:'0.982',repayUsd:f(q.repay),
      collateralUsd:f(q.repay+q.gross),estimatedNetUsd:f(q.net),
      status:'evaluating',sourceBlock:block},...s.opportunities].slice(0,14);return s;
    });
   }
   if(p===5)evidence.financingCapUsd=f(job.amount);
   if(p===6)evidence.expectedCompetitors=c%3===1?2:0;
   if(p===7)evidence.repayUsd=f(q.repay);
   if(p===8)evidence.transaction='DEMO-TX-'+String(job.completed+1).padStart(5,'0');
   if(p===9)evidence.collateralUsd=f(q.repay+q.gross);
   if(p===10){evidence.financingFeeUsd=f(q.fees);evidence.gasFeeUsd=f(q.gas)}
   if(p===11){
    job.completed++;job.gross+=q.gross;job.fees+=q.fees;job.gas+=q.gas;
    job.swap+=q.swap;job.net+=q.net;
    const balance=job.amount+job.net;
    evidence.netUsd=f(q.net);evidence.portfolioUsd=f(balance);
    const transaction={id:'DEMO-TX-'+String(job.completed).padStart(5,'0'),
     borrowerAccountId:borrower,sourceBlock:block,network:'demo',
     status:'completed',repayUsd:f(q.repay),grossProceedsUsd:f(q.gross),
     financingFeeUsd:f(q.fees),gasFeeUsd:f(q.gas),swapCostUsd:f(q.swap),
     netProfitUsd:f(q.net),timestamp:new Date().toISOString()};
    await this.store.update('demo',s=>{
     if(s.session?.id!==id)return s;
     s.transactions=[transaction,...s.transactions].slice(0,100);
     s.opportunities=s.opportunities.map(o=>o.borrowerAccountId===borrower?
      {...o,status:'completed',transactionId:transaction.id}:o);
     s.wallet={status:'connected',accountId:'demo-portfolio',
      balances:[{tokenId:'USD',atomic:f(balance)}],verifiedAt:new Date().toISOString()};
     s.accounting={currency:'USD',available:f(balance),pending:'0.00',
      grossProceeds:f(job.gross),financingFees:f(job.fees),gasFees:f(job.gas),
      swapCosts:f(job.swap),realizedProfit:f(Math.max(0,job.net)),
      realizedLoss:f(Math.max(0,-job.net)),cumulativeNetPnl:f(job.net),
      reconciledAt:new Date().toISOString(),
      evidence:{scenario:'demo',startingBudgetUsd:f(job.amount),positionsCompleted:job.completed}};
     return s;
    });
   }
   const [stage,status,message]=events[p];
   await this.emit(stage,status,message,evidence);
   job.phase++;
  }
  await this.store.update('demo',state=>{
   if(state.session?.id===id&&state.session.status==='running')
    state.session.demoCheckpoint={cycle:job.cycle,phase:job.phase};
   return state;
  });
  this.schedule(job);
 }
 async pause(){
  const session=(await this.store.state('demo')).session;
  const job=session&&this.jobs.get(session.id);
  if(!job||session.status!=='running')throw Error('NO_RUNNING_SESSION');
  clearTimeout(job.timer);
  await this.store.update('demo',s=>{s.session.status='paused';return s});
  await this.emit('control','info','Automation paused · current progress preserved.');
  return (await this.store.state('demo')).session;
 }
 async resume(){
  const session=(await this.store.state('demo')).session;
  const job=session&&this.jobs.get(session.id);
  if(!job||session.status!=='paused')throw Error('SESSION_NOT_PAUSED');
  await this.store.update('demo',s=>{s.session.status='running';return s});
  await this.emit('control','running','Automation resumed · continuing from previous stage.');
  this.schedule(job);
  return (await this.store.state('demo')).session;
 }
 async stop(){
  const session=(await this.store.state('demo')).session;
  const job=session&&this.jobs.get(session.id);
  if(!job||!['running','paused'].includes(session.status))throw Error('NO_ACTIVE_SESSION');
  clearTimeout(job.timer);this.jobs.delete(session.id);
  await this.store.update('demo',s=>{s.session.status='stopped';
   s.session.endedAt=new Date().toISOString();return s});
  await this.emit('control','info','Automation stopped · results preserved in the current session.');
  return (await this.store.state('demo')).session;
 }
}

