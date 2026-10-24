import {assessRheaSnapshot} from './valuation.ts';
import {compareRheaReferenceCase,type RheaReferenceCase} from './parity.ts';
import type {RheaRawSnapshot} from './scanner.ts';
/** A reproducible *offline* comparison against reviewed reference fixtures.
 * Matching hand-authored fixtures is NEVER independent deployed-contract parity.
 */
export interface ReferenceSuiteResult {
 mode:'OFFLINE_REFERENCE_ONLY';compared:number;differences:{accountId:string;reasons:string[]}[];
 allMatch:boolean;approvedForExecution:false;blockHeight:string;warnings:string[];
}
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export function compareRheaReferenceSuite(snapshot:RheaRawSnapshot,references:RheaReferenceCase[],reviewedContractCodeHash?:string):ReferenceSuiteResult {
 if(snapshot.mode!=='DISCOVERY_ONLY'||!/^\d+$/.test(snapshot.blockHeight)||!Array.isArray(snapshot.accounts))throw Error('invalid pinned discovery snapshot');
 if(!Array.isArray(references)||references.length!==snapshot.accounts.length||references.length===0||references.length>200)throw Error('one reference needed per sampled borrower');
 if(reviewedContractCodeHash!==undefined&&!HASH.test(reviewedContractCodeHash))throw Error('invalid reviewed code hash');
 const report=assessRheaSnapshot(snapshot), refs=new Map<string,RheaReferenceCase>();
 for(const ref of references){
  if(refs.has(ref.accountId))throw Error('duplicate reference account');
  if(ref.sourceType==='REVIEWED_DEPLOYED_CONTRACT'&&(!reviewedContractCodeHash||ref.contractCodeHash!==reviewedContractCodeHash))throw Error('contract hash must match reviewed reference');
  refs.set(ref.accountId,ref);
 }
 const differences:{accountId:string;reasons:string[]}[]=[];
 for(const account of report.accounts){
  const ref=refs.get(account.accountId);if(!ref)throw Error('missing expected account reference');
  const result=compareRheaReferenceCase(account,snapshot.blockHeight,ref);
  if(!result.matchesReference)differences.push({accountId:account.accountId,reasons:result.reasons});
 }
 return {mode:'OFFLINE_REFERENCE_ONLY',compared:report.accounts.length,differences,
  allMatch:differences.length===0,approvedForExecution:false,blockHeight:snapshot.blockHeight,
  warnings:['LEGACY_ORACLE_FIXTURE_NOT_CURRENT_RHEA_ONCHAIN_ORACLE','DOCUMENT_REFERENCES_ARE_NOT_CONTRACT_ATTESTATIONS','LIVE_CONTRACT_PARITY_NOT_PROVEN']};
}
