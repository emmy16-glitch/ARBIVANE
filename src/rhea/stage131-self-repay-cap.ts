/** Stage131: bound the disposable Sandbox liquidator's own final Repay.
 * Genuine run 40313... finalized Borrow/Liquidate/Repay/Withdraw but left
 * one borrowed share (2 lending atomics) when exact self-repay was R.
 * The source-pinned BORROW and borrower Liquidate amounts MUST remain R.
 * At most EIGHT extra internal atomics can come from genuine seized surplus.
 * This is not approval to sign, borrow or spend on NEAR mainnet.
 */
const UINT=/^[1-9][0-9]{0,38}$/;
const U128=(1n<<128n)-1n;
const EXTRA=8n;
function qty(v:unknown):bigint|null {
 if(typeof v!=='string'||!UINT.test(v))return null;
 const n=BigInt(v);return n<=U128?n:null;
}
export function stage131SelfRepayCap(borrowRaw:string,seizeRaw:string):string {
 const borrow=qty(borrowRaw),seize=qty(seizeRaw);
 if(borrow===null||seize===null||seize<=borrow||
   borrow+EXTRA>U128||borrow<8000000000n||
   seize-borrow<8000n)
  throw Error('STAGE131_INSUFFICIENT_PINNED_SELF_REPAY_SPREAD');
 return (borrow+EXTRA).toString();
}
export function attestStage131SameTokenSelfRepay(
 borrowRaw:unknown,seizeRaw:unknown,leg:unknown
):boolean {
 const b=qty(borrowRaw),s=qty(seizeRaw);
 if(b===null||s===null||s<=b||!leg||typeof leg!=='object'||
  Array.isArray(leg))return false;
 const p=leg as {amount?:unknown;max_amount?:unknown};
 // Preserve existing exact replay fixtures; new production path is capped.
 if(p.max_amount===undefined&&p.amount===borrowRaw)return true;
 if(p.amount!==undefined||p.max_amount===undefined)return false;
 const limit=qty(p.max_amount);
 return limit!==null&&limit===b+EXTRA&&b>=8000000000n&&
  s-b>=8000n&&limit<=U128;
}
