import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRheaPaperOpportunities } from '../src/rhea/opportunity-simulation.ts';
const U=10n**27n;
const v=n=>(BigInt(n)*U).toString();
const H='2'.repeat(43),O='3'.repeat(43),B='221350001';
const position={accountId:'alice.near',positionId:'isolated-1',mode:'PAPER_RHEA_HEALTH_ONLY',
 classification:'PAPER_AT_RISK_UNAPPROVED',blockers:[],adjustedCollateralE27:v(800),adjustedDebtE27:v(1000),
 healthFactorBps:'8000',discountE27:(U/10n).toString(),executionEnabled:false,liquidationEligible:false,liquidationParityVerified:false,estimatedProfit:null};
const health={mode:'READ_ONLY_RHEA_PAPER_HEALTH',status:'PAPER_HEALTH_EVIDENCE_UNAPPROVED',blockHeight:B,
 lendingCodeHash:H,oracleCodeHash:O,positionsSeen:1,paperAtRisk:1,paperHealthy:0,blockedPositions:0,
 records:[position],executionEnabled:false,liquidationParityVerified:false,priceParityVerified:false,warnings:[]};
const costs={networkMaxE27:v(1),fundingMaxE27:v(1),slippageMaxE27:v(1),protocolMaxE27:v(0),competitionBufferMaxE27:v(1)};
const scenario={scenarioId:'a',accountId:'alice.near',positionId:'isolated-1',blockHeight:B,
 lendingCodeHash:H,oracleCodeHash:O,asOfFinalizedHeight:B,
 repay:[{tokenId:'near.near',grossUsdE27:v(100),volatilityBps:10000}],
 seize:[{tokenId:'usdc.near',grossUsdE27:v(105),volatilityBps:7500}],
 fundingCapacityUsdE27:v(120),costs,
 competition:{kind:'PUBLIC_ACTIVITY_SAMPLE',blockHeight:B,sampledTransactions:0,exhaustive:false}};
const run=(xs=[scenario],h=health,lag=120)=>scoreRheaPaperOpportunities(h,xs,lag);
test('hypothetical positive source-math result remains entirely nonexecutable',()=>{
 const r=run(),x=r.records[0];
 assert.equal(x.classification,'PAPER_POSITIVE_UNAPPROVED');
 assert.equal(x.hypotheticalGrossUsdE27,v(5));
 assert.equal(x.hypotheticalNetAfterMaximumCostsUsdE27,v(1));
 assert.equal(x.hypotheticalRoiBps,'100');
 assert.equal(x.paperRank,1);
 assert.equal(x.executionEnabled,false);assert.equal(x.liquidationEligible,false);
 assert.equal(x.profitabilityVerified,false);assert.equal(x.deployedContractParityVerified,false);
 assert.equal(x.competitionCountVerified,false);assert.equal(r.liquidationParityVerified,false);
});
test('cost upper bounds with nonpositive margin have no positive paper rank',()=>{
 const r=run([{...scenario,costs:{...costs,slippageMaxE27:v(15)}}]);
 assert.equal(r.paperPositive,0);assert.equal(r.paperNonpositive,1);
 assert.equal(r.records[0].paperRank,null);
 assert.ok(BigInt(r.records[0].hypotheticalNetAfterMaximumCostsUsdE27)<0n);
});
test('missing budget hides all gross and net figures',()=>{
 const r=run([{...scenario,costs:null}]);
 assert.equal(r.records[0].classification,'BLOCKED');
 assert.deepEqual(r.records[0].blockers,['COST_BOUNDS_UNAVAILABLE']);
 assert.equal(r.records[0].hypotheticalGrossUsdE27,null);
});
test('no observed public competition evidence blocks paper ranking',()=>{
 const r=run([{...scenario,competition:{kind:'UNKNOWN'}}]);
 assert.ok(r.records[0].blockers.includes('COMPETITION_UNOBSERVED'));
 assert.equal(r.records[0].paperRank,null);
});
test('no liquidity or too little capacity blocks without fake profit',()=>{
 for(const fundingCapacityUsdE27 of [null,v(99)]){
  const x=run([{...scenario,fundingCapacityUsdE27}]).records[0];
  assert.equal(x.classification,'BLOCKED');assert.equal(x.hypotheticalNetAfterMaximumCostsUsdE27,null);
 }
});
test('block mismatch, contract mismatch and too old quote are rejected',()=>{
 for(const input of [{blockHeight:'221350002'},{lendingCodeHash:O},{oracleCodeHash:H},{asOfFinalizedHeight:'221350122'}]){
  const x=run([{...scenario,...input}]).records[0];
  assert.ok(x.blockers.includes('STALE_OR_CROSS_BLOCK_EVIDENCE'));
 }
});
test('stale public competition sample cannot be considered current',()=>{
 const r=run([{...scenario,competition:{...scenario.competition,blockHeight:'221349999'}}]);
 assert.ok(r.records[0].blockers.includes('PUBLIC_OBSERVATION_STALE'));
});
test('healthy and blocked source health never appear as paper positive',()=>{
 const healthy={...position,classification:'PAPER_HEALTHY_UNAPPROVED',adjustedCollateralE27:v(1200)};
 const blocked={...position,classification:'BLOCKED',blockers:['UPSTREAM_PRICE_OR_POSITION_GAP'],adjustedDebtE27:null};
 const a=run([scenario],{...health,records:[healthy]}).records[0];
 const b=run([scenario],{...health,records:[blocked]}).records[0];
 assert.ok(a.blockers.includes('BORROWER_HEALTH_NOT_AT_RISK'));
 assert.ok(b.blockers.includes('HEALTH_EVIDENCE_BLOCKED'));
});
test('missing account position and legitimate blocked legacy entries are handled',()=>{
 const other={...position,positionId:null,classification:'BLOCKED'};
 const r=run([scenario],{...health,records:[other]});
 assert.equal(r.records[0].classification,'BLOCKED');
 assert.ok(r.records[0].blockers.includes('POSITION_NOT_FOUND'));
});
test('source rules reject worse borrower health and oversized discounted seize',()=>{
 const x=run([{...scenario,seize:[{...scenario.seize[0],volatilityBps:10000}]}]).records[0];
 assert.equal(x.classification,'BLOCKED');
 assert.ok(x.blockers.includes('SOURCE_FORMULA_REJECTION'));
 assert.ok(x.sourceFormulaReasons.includes('BORROWER_HEALTH_NOT_IMPROVED'));
});
test('aggregate adjusted collateral and debt cannot be overdrawn',()=>{
 const r=run([{...scenario,repay:[{...scenario.repay[0],grossUsdE27:v(2000)}]}]);
 assert.ok(r.records[0].blockers.includes('POSITION_BALANCE_EXCEEDED'));
});
test('all wrong money encodings, duplicate token legs and volatility fail closed',()=>{
 for(const values of ['-1','1.0','1e30','01',123,(10n**53n).toString()]){
  assert.throws(()=>run([{...scenario,repay:[{...scenario.repay[0],grossUsdE27:values}]}]),/invalid/);
 }
 assert.throws(()=>run([{...scenario,seize:[...scenario.seize,scenario.seize[0]]}]),/duplicate/);
 assert.throws(()=>run([{...scenario,seize:[{...scenario.seize[0],volatilityBps:10001}]}]),/volatility/);
 assert.throws(()=>run([{...scenario,costs:{...costs,networkMaxE27:'NaN'}}]),/invalid/);
});
test('duplicate scenario names and health position identities reject',()=>{
 assert.throws(()=>run([scenario,scenario]),/duplicate scenario/);
 assert.throws(()=>run([scenario],{...health,records:[position,position]}),/duplicate health/);
});
test('paper rank orders by net in fixed point not floats, with tie deterministic',()=>{
 const strong={...scenario,scenarioId:'b',seize:[{...scenario.seize[0],grossUsdE27:v(106)}]};
 const weak={...scenario,scenarioId:'z'};
 const r=run([weak,strong]);
 assert.deepEqual(r.records.map(x=>[x.scenarioId,x.paperRank]),[['z',2],['b',1]]);
});
test('report refuses any upstream claim of execution or parity',()=>{
 assert.throws(()=>run([], {...health,executionEnabled:true}),/invalid unapproved/);
 assert.throws(()=>run([], {...health,liquidationParityVerified:true}),/invalid unapproved/);
 assert.throws(()=>run([scenario], {...health,records:[{...position,liquidationEligible:true}]}),/execution authority/);
});
test('cannot simulate with negative observation drift or invalid block-lag limit',()=>{
 assert.throws(()=>run([scenario],health,-1),/maxBlockLag/);
 const x=run([{...scenario,asOfFinalizedHeight:'221349998'}]).records[0];
 assert.ok(x.blockers.includes('STALE_OR_CROSS_BLOCK_EVIDENCE'));
});
test('no real liquidation approval can be inferred from empty scenario input',()=>{
 const r=run([]);assert.equal(r.scenarioCount,0);assert.equal(r.paperPositive,0);
 assert.equal(r.profitabilityVerified,false);assert.deepEqual(r.records,[]);
});
