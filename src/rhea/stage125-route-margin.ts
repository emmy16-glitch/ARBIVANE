/** Stage125: exact borrower liquidation sizes remain authoritative.
 * A strictly capped actor-only financing/share-rounding cushion is permitted
 * only when authenticated source pool evidence has created the attestation.
 */
const UINT=/^[1-9][0-9]{0,38}$/;
export function attestStage125ActorBorrowCushion(
 plan:{sourceBackedBorrowCushionInternal?:string},
 borrow:string,repay:string,seize:string,
):boolean{
 if(!UINT.test(borrow)||!UINT.test(repay)||!UINT.test(seize))return false;
 const b=BigInt(borrow),r=BigInt(repay),s=BigInt(seize);
 if(s<=r||b<r)return false;
 const extra=b-r;
 if(extra===0n)return plan.sourceBackedBorrowCushionInternal===undefined||
  plan.sourceBackedBorrowCushionInternal==='0';
 return plan.sourceBackedBorrowCushionInternal===extra.toString()&&
  extra<=1000000n&&extra<=r/1000000000n&&extra<=(s-r)/1000n;
}
