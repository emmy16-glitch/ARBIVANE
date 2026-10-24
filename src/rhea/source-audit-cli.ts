/** A deterministic, offline documentation fixture; NEVER a live contract read. */
import { parseRheaMarket, valueRheaAccount } from './valuation.ts';
import { assessPaperLiquidation } from './liquidation.ts';
import { compareSourceToStage2 } from './source-differential.ts';
import { SOURCE_SCALE, sourceCheckLiquidationRules } from './source-math.ts';

const runtime = (globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>}}).process;
if (runtime.env.EXECUTION_ENABLED !== 'false') throw Error('EXECUTION_ENABLED must explicitly be false');
const S=SOURCE_SCALE;
const fixture = {
  mode:'DISCOVERY_ONLY' as const, blockHeight:'1', accountCount:1,
  assets: [
    ['wrap.near', {supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{volatility_ratio:5000,extra_decimals:0,can_borrow:true}}],
    ['dai.near', {supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{volatility_ratio:10000,extra_decimals:0,can_borrow:true}}],
  ],
  oracle: {timestamp:'1792800000000000000',prices:[
    {asset_id:'wrap.near',price:{multiplier:'7000000',decimals:6}},
    {asset_id:'dai.near',price:{multiplier:'1000000',decimals:6}},
  ]},
  accounts:[{account_id:'alice.near',collateral:{'wrap.near':'1000'},borrowed:{'dai.near':'4000'},supplied:{}}],
};
const market=parseRheaMarket(fixture);
const account=valueRheaAccount(fixture.accounts[0],market);
const rule=assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'1000'}],seize:[{tokenId:'wrap.near',atomicUnits:'152'}]});
const sourceRules=sourceCheckLiquidationRules({beforeCollateralE27:3500n*S,beforeDebtE27:4000n*S,
  afterCollateralE27:2968n*S,afterDebtE27:3000n*S,repaidE27:1000n*S,seizedE27:1064n*S});
const comparison=compareSourceToStage2(account,market);
console.log(JSON.stringify({mode:'OFFLINE_SOURCE_AUDIT',sourceFixture:'NearDeFi/burrowland README published example',
  sourceCommit:'0dbfa1803bf26353ffbee2ffd4f494bab23b2756',sourceCommitDate:'2022-07-07',
  blockHeightIsSynthetic:true,executionEnabled:false,liveContractCompatibilityVerified:false,
  deployedWasmHashMatched:false,liquidation:{paper:rule,sourceFormula:sourceRules},comparison},null,2));
