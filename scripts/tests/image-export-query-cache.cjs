const assert=require('node:assert/strict');
const fs=require('node:fs');
global.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:image/png;base64,'+Buffer.from(b).toString('base64');this.onloadend()})}};
global.fetch=async(url)=>new Response(new URL(url).searchParams.get('url'),{headers:{'Content-Type':'image/png'}});
const {resourceToDataURL}=require('html-to-image/lib/dataurl');
(async()=>{
 const a='https://example.test/api/catalog-image?url=leafeon';
 const b='https://example.test/api/catalog-image?url=deoxys';
 const oldA=await resourceToDataURL(a,'image/png',{});
 const oldB=await resourceToDataURL(b,'image/png',{});
 assert.equal(oldA,oldB,'reproduces query-stripped cache collision');
 const newA=await resourceToDataURL(a,'image/png',{includeQueryParams:true});
 const newB=await resourceToDataURL(b,'image/png',{includeQueryParams:true});
 assert.notEqual(newA,newB);
 assert.equal(Buffer.from(newB.split(',')[1],'base64').toString(),'deoxys');
 assert.match(fs.readFileSync('src/components/admin/series-singles.tsx','utf8'),/includeQueryParams: true/);
 console.log('PASS proxy-card URLs stay distinct even after old cache collision');
})().catch(e=>{console.error(e);process.exit(1)});
