import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
const offices={tokyo:'a6247c88-df33-45f5-9c61-e9ccec79b720',yamaguchi:'2b191f95-c34c-4249-a84f-98548ccf8a1f'};
const allowed=['シングルカード','30thシングルカード','ポケモン シングルカード','プロモカード','PSA10'];
type IntakeOrder={id:string;order_number:string;status:string;arrival_date:string|null;created_at:string;updated_at:string;inspection_discount:number;return_status:string|null;inspection_status:string|null;order_items:{id:string;psa_cert_numbers:string[]|null;product_name:string;unit_price:number;quantity:number;inspected_quantity:number|null;returned_quantity:number|null;products:{model_number:string|null;subcategories:{name:string}|{name:string}[]|null}|{model_number:string|null;subcategories:{name:string}|{name:string}[]|null}[]|null}[]};
export async function GET(req:NextRequest){
 const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
 const auth=req.headers.get('authorization');const key=process.env.INVENTORY_PUBLIC_ANON_KEY;
 if(!auth?.startsWith('Bearer ')||!key)return reply({error:'認証が必要です'},401);
 const inventory=createClient('https://pvpofqtdfucdhjoxneeo.supabase.co',key,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:access,error:accessError}=await inventory.rpc('card_intake_access');
 const location=req.nextUrl.searchParams.get('location')??'';
 if(accessError||access?.organization_id!=='b0000000-0000-0000-0000-000000000001'||!['tokyo','yamaguchi'].includes(location)||!access?.locations?.includes(location))return reply({error:'担当拠点へのアクセス権がありません'},403);
 // This endpoint only serves the Tokyo/Yamaguchi buyback database, never Chiba.
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://hbvkaidvrwgskjtvvwfw.supabase.co')return reply({error:'対象外の接続先です'},403);
 const db=createAdminClient();const {data:tenant}=await db.from('tenants').select('id').eq('slug','quadra').single();if(!tenant)return reply({error:'組織を確認できません'},500);
 const arrival=req.nextUrl.searchParams.get('arrival_date');
 if(arrival&&(!/^\d{4}-\d{2}-\d{2}$/.test(arrival)||!Number.isFinite(Date.parse(arrival+'T00:00:00Z'))||new Date(arrival+'T00:00:00Z').toISOString().slice(0,10)!==arrival))return reply({error:'到着日が不正です'},400);
 const inspectedFrom=req.nextUrl.searchParams.get('inspected_from');
 if(inspectedFrom&&(!/^\d{4}-\d{2}-\d{2}$/.test(inspectedFrom)||!Number.isFinite(Date.parse(inspectedFrom+'T00:00:00Z'))||new Date(inspectedFrom+'T00:00:00Z').toISOString().slice(0,10)!==inspectedFrom))return reply({error:'検品完了日が不正です'},400);
 const inspectedOn=req.nextUrl.searchParams.get('inspected_on');
 if(inspectedOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(inspectedOn)||!Number.isFinite(Date.parse(inspectedOn+'T00:00:00Z'))||new Date(inspectedOn+'T00:00:00Z').toISOString().slice(0,10)!==inspectedOn||!inspectedFrom||inspectedOn<inspectedFrom))return reply({error:'検品完了日が不正です'},400);
 const prelabel=req.nextUrl.searchParams.get('mode')==='prelabel';
 const number=req.nextUrl.searchParams.get('number');
 if(prelabel&&(!number||!/^BB-[0-9]{4,8}$/.test(number)||inspectedFrom||inspectedOn||arrival))return reply({error:'仮ラベルは注文番号を指定してください'},400);
 const id=req.nextUrl.searchParams.get('id');const page=Number(req.nextUrl.searchParams.get('page')??0);
 if(!Number.isInteger(page)||page<0||page>10000||id&&!/^[0-9a-f-]{36}$/.test(id))return reply({error:'検索条件が不正です'},400);
 let q=db.from('orders').select('id,order_number,status,arrival_date,created_at,updated_at,inspection_discount,return_status,inspection_status,order_items(id,psa_cert_numbers,product_name,unit_price,quantity,inspected_quantity,returned_quantity,products(model_number,subcategories(name)))'+(inspectedFrom?',order_status_history!inner(new_status,changed_at)':''),{count:'exact'}).eq('tenant_id',tenant.id).eq('office_id',offices[location as keyof typeof offices]).in('status',prelabel?['承認待ち','申込','発送済','到着','検品中']:['検品完了','振込済','振込確認済']);
 if(inspectedFrom)q=q.eq('order_status_history.new_status','検品完了').gte('order_status_history.changed_at',inspectedFrom+'T00:00:00+09:00');
 if(inspectedOn){const nextDay=new Date(Date.parse(inspectedOn+'T00:00:00Z')+86400000).toISOString().slice(0,10);q=q.gte('order_status_history.changed_at',inspectedOn+'T00:00:00+09:00').lt('order_status_history.changed_at',nextDay+'T00:00:00+09:00');}
 if(prelabel)q=q.eq('order_number',number!);
 if(id)q=q.eq('id',id);
 if(arrival)q=q.eq('arrival_date',arrival);
 const {data,error,count}=await q.order('created_at',{ascending:false}).order('id').range(page*30,page*30+29);
 if(error)return reply({error:'買取明細を取得できません'},500);
 const orders=((data??[]) as unknown as IntakeOrder[]).map(o=>{
 const items=o.order_items.map(i=>{const p=Array.isArray(i.products)?i.products[0]:i.products;const sub=p&&(Array.isArray(p.subcategories)?p.subcategories[0]:p.subcategories);return {...i,category:sub?.name??'',model:p?.model_number??'',products:undefined};}).filter(i=>allowed.includes(i.category)&&!/(BOX|ボックス|シュリンク|カートン|スペシャル|パック)/i.test(i.product_name));
 return {id:o.id,number:o.order_number,status:o.status,arrival_date:o.arrival_date,purchase_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(o.created_at)),updated_at:o.updated_at,discount:o.inspection_discount,blocked:Boolean(o.return_status||o.inspection_status),items:items.map(i=>({id:i.id,cert_numbers:i.psa_cert_numbers,name:i.product_name,model:i.model,category:i.category,unit_price:i.unit_price,quantity:prelabel?i.quantity:i.inspected_quantity===null?null:Math.max(0,i.inspected_quantity-(i.returned_quantity??0))}))};
 });return reply({prelabel,orders,total:count??0,arrival_date:arrival,inspected_from:inspectedFrom,inspected_on:inspectedOn});
}
