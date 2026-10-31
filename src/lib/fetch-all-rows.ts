/** Read every matching row beyond PostgREST's 1000-row ceiling, with stable ordering supplied by caller. */
export async function fetchAllRows<T>(page:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown;count?:number|null}>,size=500):Promise<{data:T[]|null;error:unknown}>{
 const first=await page(0,size-1);if(first.error){console.error('商品取得先頭',first.error);return {data:null,error:first.error};}const rows=[...(first.data??[])];const total=first.count;
 if(total==null){while(rows.length&&rows.length%size===0){const next=await page(rows.length,rows.length+size-1);if(next.error)return{data:null,error:next.error};rows.push(...next.data??[]);if((next.data??[]).length<size)break;}return{data:rows,error:null};}
 for(let offset=size;offset<total;offset+=size*4){const pages: {data:T[]|null;error:unknown;count?:number|null}[]=await Promise.all(Array.from({length:Math.min(4,Math.ceil((total-offset)/size))},(_,i)=>page(offset+i*size,offset+(i+1)*size-1)));for(const p of pages){if(p.error||p.count!=null&&p.count!==total){console.error('商品取得ページ',p.error,{expected:total,actual:p.count});return{data:null,error:p.error??new Error('商品件数が変更されました。再読込してください')};}rows.push(...p.data??[]);}}
 if(rows.length!==total || rows.every(r=>!!(r as {id?:string}).id)&&new Set(rows.map(r=>(r as {id?:string}).id)).size!==rows.length){console.error('商品取得件数',{read:rows.length,expected:total,unique:new Set(rows.map(r=>(r as {id?:string}).id)).size});return{data:null,error:new Error('全件取得できませんでした。再読込してください')}};return{data:rows,error:null};
}

/** Keyset pagination avoids repeated whole-table counts and offset scans under RLS. */
export async function fetchAllById<T extends {id:string}>(page:(after:string|null,size:number)=>PromiseLike<{data:T[]|null;error:unknown}>,size=500):Promise<{data:T[]|null;error:unknown}>{
 const rows:T[]=[];let after:string|null=null
 while(true){
  const result=await page(after,size)
  if(result.error){console.error('商品取得',JSON.stringify(result.error));return{data:null,error:result.error}}
  const next=result.data??[]
  if(next.some((r,i)=>!r.id||(i?r.id<=next[i-1].id:after!==null&&r.id<=after)))return{data:null,error:new Error('商品一覧が変更されました。再読み込みしてください')}
  rows.push(...next)
  if(next.length<size)return{data:rows,error:null}
  after=next[next.length-1].id
 }
}

/** Four disjoint UUID ranges keep indexed keyset scans bounded and avoid offset/count queries. */
export async function fetchAllUuidRows<T extends {id:string}>(
 page:(after:string|null,size:number,lower:string,upper:string|null)=>PromiseLike<{data:T[]|null;error:unknown}>,
 options:{size?:number;onProgress?:(read:number)=>void;onBatch?:(rows:T[])=>void;shouldContinue?:()=>boolean}={},
):Promise<{data:T[]|null;error:unknown}>{
 const bounds=['00000000-0000-0000-0000-000000000000','40000000-0000-0000-0000-000000000000','80000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000000']
 let read=0
 const results=await Promise.all(bounds.map((lower,index)=>{
  const upper=bounds[index+1]??null
  return fetchAllById<T>(async(after,size)=>{
   if(options.shouldContinue&&!options.shouldContinue())return{data:null,error:new Error('読み込みを中断しました')}
   const result=await page(after,size,lower,upper)
   if(result.error)return result
   if(result.data?.some(r=>r.id<lower||upper!==null&&r.id>=upper))return{data:null,error:new Error('商品取得範囲が一致しません')}
   const rows=result.data??[]
   if(rows.some((r,i)=>!r.id||(i?r.id<=rows[i-1].id:after!==null&&r.id<=after)))return{data:null,error:new Error('商品一覧が変更されました。再読み込みしてください')}
   read+=rows.length
   if(rows.length)options.onBatch?.(rows)
   options.onProgress?.(read)
   return result
  },options.size??500)
 }))
 const failed=results.find(r=>r.error)
 if(failed)return{data:null,error:failed.error}
 const data=results.flatMap(r=>r.data??[])
 if(new Set(data.map(r=>r.id)).size!==data.length)return{data:null,error:new Error('商品一覧に重複があります。再読み込みしてください')}
 return{data,error:null}
}
