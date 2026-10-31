import {NextRequest,NextResponse} from 'next/server'
export const maxDuration=30
/** Public card thumbnails only. No credentials, arbitrary hosts, redirects, or SVG. */
export async function GET(request:NextRequest){
 const raw=request.nextUrl.searchParams.get('url')||''
 let url:URL
 try{url=new URL(raw)}catch{return new NextResponse('Invalid image',{status:400})}
 if(url.protocol!=='https:'||!((url.hostname==='cdn.snkrdunk.com'&&url.pathname.startsWith('/upload_bg_removed/'))||(url.hostname==='www.30th.pokemon-card.com'&&url.pathname.startsWith('/images/m6a/cards/')))||url.port||url.username||url.password||!/\.(webp|png|jpe?g)$/i.test(url.pathname)||[...url.searchParams.keys()].some(k=>k!=='size')||raw.length>1500)return new NextResponse('Invalid image',{status:400})
 try{
  const response=await fetch(url,{redirect:'error',next:{revalidate:86400},signal:AbortSignal.timeout(20000)})
  const type=response.headers.get('content-type')?.split(';')[0]||''
  if(!response.ok||!['image/webp','image/png','image/jpeg'].includes(type)||Number(response.headers.get('content-length')||0)>3000000)return new NextResponse('Image unavailable',{status:502})
  const reader=response.body?.getReader();if(!reader)return new NextResponse('Image unavailable',{status:502})
  const chunks:Uint8Array[]=[];let length=0
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>3000000){await reader.cancel();return new NextResponse('Image too large',{status:502})}chunks.push(value)}
  return new NextResponse(Buffer.concat(chunks),{headers:{'Content-Type':type,'Cache-Control':'public, max-age=86400, s-maxage=86400','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}})
 }catch{return new NextResponse('Image unavailable',{status:502})}
}
