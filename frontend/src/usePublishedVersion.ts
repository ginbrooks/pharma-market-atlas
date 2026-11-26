import {useEffect} from 'react';

/** Refresh open reading views after a release without disturbing admin drafts. */
export function usePublishedVersion(version:string|undefined,reload:()=>void|Promise<void>,enabled:boolean){
 useEffect(()=>{
  if(!enabled||!version)return;
  let disposed=false,inFlight=false,lastChecked=0;
  let pending:AbortController|null=null;
  const check=async()=>{
   if(disposed||document.visibilityState!=='visible'||inFlight||Date.now()-lastChecked<15_000)return;
   inFlight=true;
   lastChecked=Date.now();
   const controller=new AbortController();
   pending=controller;
   const timeout=window.setTimeout(()=>controller.abort(),10_000);
   try{
    const response=await fetch('/api/version',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(!response.ok)return;
    const latest:unknown=await response.json();
    if(!disposed&&latest&&typeof latest==='object'&&'version' in latest&&typeof latest.version==='string'&&latest.version!==version){
     await reload();
    }
   }catch{
    // A failed background check leaves the currently readable release intact.
   }finally{
    window.clearTimeout(timeout);
    pending=null;
    inFlight=false;
   }
  };
  const onVisible=()=>{if(document.visibilityState==='visible')void check()};
  window.addEventListener('focus',onVisible);
  document.addEventListener('visibilitychange',onVisible);
  const interval=window.setInterval(()=>void check(),60_000);
  void check();
  return()=>{
   disposed=true;
   pending?.abort();
   window.clearInterval(interval);
   window.removeEventListener('focus',onVisible);
   document.removeEventListener('visibilitychange',onVisible);
  };
 },[version,reload,enabled]);
}
