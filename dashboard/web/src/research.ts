import {useEffect,useState} from 'react';

type ResearchRun={id:number;name:string;status:string;conclusion:string|null;html_url:string;created_at:string;head_sha:string};
const url='https://api.github.com/repos/emmy16-glitch/ARBIVANE/actions/runs?per_page=35';
const prefix='https://github.com/emmy16-glitch/ARBIVANE/actions/runs/';
function admitted(value:unknown):ResearchRun[] {
 if(!value||typeof value!=='object')return [];
 const v=value as {workflow_runs?:unknown};
 if(!Array.isArray(v.workflow_runs))return [];
 return v.workflow_runs.filter((r:unknown):r is ResearchRun=>{
  if(!r||typeof r!=='object')return false;
  const x=r as Partial<ResearchRun>;
  return Number.isSafeInteger(x.id)&&typeof x.name==='string'&&
   /stage\s*(93|157)|sandbox/i.test(x.name)&&
   typeof x.html_url==='string'&&x.html_url===prefix+x.id&&
   typeof x.status==='string'&&
   typeof x.created_at==='string'&&typeof x.head_sha==='string';
 }).slice(0,5);
}
export function useResearchRuns(enabled:boolean){
 const [runs,setRuns]=useState<ResearchRun[]>([]);
 useEffect(()=>{
  if(!enabled)return;
  let mounted=true;let controller:AbortController|null=null;
  const read=async()=>{
   controller?.abort();controller=new AbortController();
   try{
    const response=await fetch(url,{headers:{accept:'application/vnd.github+json'},signal:controller.signal});
    if(!response.ok)return;
    const rows=admitted(await response.json());
    if(mounted)setRuns(rows);
   }catch{/* GitHub rate limits or offline are not evidence of run failure. */}
  };
  void read();const repeat=setInterval(()=>void read(),60_000);
  return()=>{mounted=false;clearInterval(repeat);controller?.abort()};
 },[enabled]);
 return runs;
}
