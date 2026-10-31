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
