import {useCallback,useEffect,useMemo,useState} from 'react';
import {api} from './lib';
import {mergeCountryCulture} from './published-culture';
import type {PublishedCulture} from './published-culture';
import type {Profile} from './types';

type Result = {iso3:string; data?:PublishedCulture; failed?:boolean};

export function useCountryCulture(profile:Profile|null,iso3=profile?.iso3){
  const [result,setResult]=useState<Result|null>(null);
  const [attempt,setAttempt]=useState(0);
  const retry=useCallback(()=>{setResult(null);setAttempt(n=>n+1)},[]);
  useEffect(()=>{
    if(!iso3 || !/^[A-Z]{3}$/.test(iso3))return;
    const controller=new AbortController();
    api<PublishedCulture>(`/api/countries/${iso3}/humanity`,{signal:controller.signal})
      .then(data=>{
        if(data?.iso3!==iso3 || !Array.isArray(data.highlights) || !Array.isArray(data.sources))throw new Error('Invalid country archive');
        if(!controller.signal.aborted)setResult({iso3,data});
      })
      .catch(()=>{if(!controller.signal.aborted)setResult({iso3,failed:true})});
    return ()=>controller.abort();
  },[iso3,attempt]);
  const current=result?.iso3===iso3?result:null;
  const culture=useMemo(()=>mergeCountryCulture(profile,current?.data),[profile,current?.data]);
  return {...culture,failed:!!current?.failed,retry};
}

export type CountryCultureView = ReturnType<typeof useCountryCulture>;
