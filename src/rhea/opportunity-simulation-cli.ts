import { readFile } from 'node:fs/promises';
import { scoreRheaPaperOpportunities, type PaperScenario } from './opportunity-simulation.ts';
import type { HealthScreenReport } from './health-screen.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
async function main():Promise<void> {
  const env=proc.env;
  if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet')throw Error('READ_ONLY_FLAGS_REQUIRED');
  if(!env.RHEA_PAPER_SCENARIOS_JSON_PATH)throw Error('RHEA_PAPER_SCENARIOS_JSON_PATH_REQUIRED');
  const input:unknown=JSON.parse(await readFile(env.RHEA_PAPER_SCENARIOS_JSON_PATH,'utf8'));
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_PAPER_SCENARIOS');
  const body=input as Record<string,unknown>;
  const outcome=scoreRheaPaperOpportunities(body.healthReport as HealthScreenReport,body.scenarios as PaperScenario[]);
  console.log(JSON.stringify(outcome,null,2));
  // Research-only: a hypothetical positive scenario is still never a safe trade.
  if(outcome.blocked>0)proc.exitCode=2;
}
main().catch(()=>{console.error(JSON.stringify({mode:'NEAR_RHEA_OFFLINE_PAPER_OPPORTUNITY_SCORING',status:'INPUT_OR_SCENARIO_ERROR',executionEnabled:false}));proc.exitCode=2;});
