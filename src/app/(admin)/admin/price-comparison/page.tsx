'use client'
import { useEffect, useMemo, useState } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'

type Quote={price:number|null;url:string;checkedAt:string|null;note:string}
type Source='rush'|'dora'|'yuyu'|'hare'|'A'|'B'
type Ref={productId:string|null;quotes:Record<Source,Quote>}
type Row=Ref&{key:string;name:string;image_url?:string|null}
type Product={image_url:string|null;id:string;name:string;model_number:string|null;set_number:string|null;price:number}
type Data={products:Product[];candidates:Row[];saved:Record<string,Ref>;canEdit:boolean}
const sources:Source[]=['rush','dora','yuyu','hare','A','B']
const labels={rush:'カードラッシュ',dora:'ドラゴンスター',yuyu:'遊々亭',hare:'晴れる屋2',A:'スニダンA',B:'スニダンB'}
const empty=()=>Object.fromEntries(sources.map(s=>[s,{price:null,url:'',checkedAt:null,note:''}])) as Ref['quotes']
const yen=(v:number|null|undefined)=>v==null?'未確認':`${Math.round(v).toLocaleString()}円`
const jst=(s:string|null)=>s&&Number.isFinite(Date.parse(s))?new Date(s).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'確認日時なし'
const usable=(q:Quote)=>q.price!==null&&!!q.checkedAt&&Number.isFinite(Date.parse(q.checkedAt))&&Date.now()-Date.parse(q.checkedAt)<86400000&&Date.parse(q.checkedAt)<=Date.now()
const reference=(s:Source,q:Quote)=>q.price===null?null:Math.floor(q.price*(s==='A'||s==='B'?.93:1))
function ProductPhoto({src,name}:{src?:string|null;name:string}){
 const [failed,setFailed]=useState(false)
 useEffect(()=>setFailed(false),[src])
 if(!src||failed)return <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">画像なし</div>
 return <a href={src} target="_blank" rel="noopener noreferrer" className="flex h-24 w-20 shrink-0 items-center justify-center rounded border bg-white p-1" aria-label={`${name}の商品画像を拡大`}><img src={src} alt={name} loading="lazy" width={80} height={96} className="h-full w-full object-contain" onError={()=>setFailed(true)}/></a>
}
export default function ComparisonPage(){
 const [saveMessage,setSaveMessage]=useState('')
 const [data,setData]=useState<Data|null>(null),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<Row|null>(null),[draft,setDraft]=useState<Ref|null>(null),[amount,setAmount]=useState(''),[mode,setMode]=useState<'edit'|'confirm'>('edit')
 async function load(){setError('');try{const r=await fetch('/api/admin/price-comparison',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error);setData(j)}catch(e){setError(String(e))}}
 useEffect(()=>{void load()},[])
 const rows=useMemo(()=>data?[...data.products.map(p=>({key:`product-${p.id}`,name:p.name,image_url:p.image_url,productId:p.id,quotes:empty()})),...data.candidates].map(r=>({...r,...data.saved[r.key]})):[],[data])
 const filtered=rows.filter(r=>(!search||`${r.name} ${data?.products.find(p=>p.id===r.productId)?.model_number||''}`.toLowerCase().includes(search.toLowerCase()))&&(filter==='all'||(filter==='linked'?!!r.productId:!r.productId)))
 const product=data?.products.find(p=>p.id===draft?.productId)
 function open(r:Row){setSaveMessage('');setSelected(r);setDraft(JSON.parse(JSON.stringify(r)));setAmount(String(data?.products.find(p=>p.id===r.productId)?.price??''));setMode('edit')}
 async function post(body:unknown){const r=await fetch('/api/admin/price-comparison',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error);return j}
 async function saveReference(){if(!selected||!draft)return;setBusy(true);try{await post({action:'reference',key:selected.key,value:{productId:draft.productId,quotes:draft.quotes}});setSaveMessage('参考価格と紐付けを保存しました');toast.success('参考価格と紐付けを保存しました');await load()}catch(e){setSaveMessage(String(e));toast.error(String(e))}finally{setBusy(false)}}
 async function savePrice(){if(!selected||!draft||!product)return;setBusy(true);try{await post({action:'reference',key:selected.key,value:{productId:draft.productId,quotes:draft.quotes}});await post({action:'price',key:selected.key,productId:product.id,expected:product.price,price:Number(amount)});toast.success('弊社の買取価格を保存しました');setSelected(null);await load()}catch(e){toast.error(String(e));setMode('edit')}finally{setBusy(false)}}
 function edit(s:Source,change:Partial<Quote>){if(draft)setDraft({...draft,quotes:{...draft.quotes,[s]:{...draft.quotes[s],...change}}})}
 return <><AdminHeader title="他社価格比較" description="通常シングルの参考価格を比較し、弊社買取価格を決めます"/><main className="space-y-4 p-4 md:p-6">
 <p className="text-sm text-muted-foreground">他社4社は掲載買取価格。スニダンA・Bは出品価格×93％の手取り試算です。参考価格の編集と弊社価格の保存は別操作です。外部サイトの価格は自動取得しません。出典で確認して更新してください。</p>
 <div className="flex flex-wrap gap-2"><Input className="max-w-sm" placeholder="商品名・型番で検索" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="商品の種類" className="rounded border px-3" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">すべて</option><option value="linked">登録商品・紐付け済み</option><option value="candidate">未登録候補</option></select><Button variant="outline" onClick={load}>保存データを再読み込み</Button><span className="p-2 text-sm">{filtered.length}件</span></div>
 {error&&<p role="alert" className="text-red-600">{error}</p>}{!data&&!error&&<p>読み込み中…</p>}
 <div className="max-h-[72vh] overflow-auto rounded border"><table className="w-full min-w-[1350px] text-sm"><thead className="sticky top-0 z-10 bg-muted"><tr><th className="min-w-64 p-3 text-left">商品・型番</th><th>弊社価格</th>{sources.map(s=><th key={s} className="min-w-36 p-3">{labels[s]}{s==='A'||s==='B'?<div>手取り93％</div>:null}</th>)}<th>設定</th></tr></thead><tbody>{filtered.map(r=>{const p=data?.products.find(p=>p.id===r.productId);return <tr key={r.key} className="border-t align-top"><td className="p-3"><div className="flex items-center gap-3"><ProductPhoto src={p?.image_url||r.image_url} name={r.name}/><div>{r.name}<div className="text-xs text-muted-foreground">{p?`${p.set_number||''} ${p.model_number||''}`:'候補・商品紐付け前'}</div></div></div></td><td className="p-3 font-bold">{p?yen(p.price):'未登録'}</td>{sources.map(s=>{const q=r.quotes[s];return <td key={s} className="p-3 text-right"><div className="font-semibold">{yen(reference(s,q))}</div>{(s==='A'||s==='B')&&q.price!==null&&<div className="text-xs">出品 {yen(q.price)}</div>}<div className="text-xs text-muted-foreground">{jst(q.checkedAt)} JST</div>{q.price!==null&&!usable(q)&&<div className="text-xs text-amber-700">日時未確認／24時間超</div>}{q.url&&<a className="text-xs text-blue-700 underline" target="_blank" rel="noopener noreferrer" href={q.url}>出典を開く</a>}</td>})}<td className="p-3"><Button variant="outline" onClick={()=>open(r)}>比較・設定</Button></td></tr>})}</tbody></table></div>
 <Dialog open={!!selected} onOpenChange={v=>{if(!busy&&!v)setSelected(null)}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{mode==='confirm'?'弊社価格の保存確認':'比較価格・買取価格の設定'}</DialogTitle><DialogDescription>{selected?.name}</DialogDescription></DialogHeader>{draft&&mode==='edit'&&<div className="space-y-4">
 <label className="block text-sm">反映する登録商品<select disabled={!data?.canEdit||selected?.key.startsWith('product-')} className="mt-1 w-full rounded border p-2" value={draft.productId||''} onChange={e=>{setDraft({...draft,productId:e.target.value||null});setAmount(String(data?.products.find(p=>p.id===e.target.value)?.price??''))}}><option value="">未登録・紐付けなし（参考価格のみ保存）</option>{data?.products.map(p=><option key={p.id} value={p.id}>{p.name} / {p.model_number}</option>)}</select></label>
 <p className="text-xs">同じ型番・収録弾・ミラー仕様かを出典で確認してください。「いま確認」は実際に価格を確認したときだけ使用します。</p>
 {sources.map(s=>{const q=draft.quotes[s];return <section key={s} className="rounded border p-3"><div className="font-bold">{labels[s]}</div><div className="my-2 flex flex-wrap gap-2"><Input disabled={!data?.canEdit} aria-label={`${labels[s]}価格`} className="w-36" type="number" min="0" placeholder="未確認" value={q.price??''} onChange={e=>edit(s,{price:e.target.value===''?null:Number(e.target.value),checkedAt:null})}/><Button disabled={!data?.canEdit||q.price===null} variant="outline" onClick={()=>edit(s,{checkedAt:new Date().toISOString()})}>いま確認</Button><span className="text-xs">{jst(q.checkedAt)} JST</span><Button variant="outline" disabled={!usable(q)} onClick={()=>setAmount(String(reference(s,q)))}>この金額を入力</Button>{s==='rush'&&<Button variant="outline" disabled={!usable(q)} onClick={()=>setAmount(String(Math.floor(q.price!*1.05)))}>105％を入力</Button>}</div><Input disabled={!data?.canEdit} aria-label={`${labels[s]}出典URL`} placeholder="https://… 出典URL" value={q.url} onChange={e=>edit(s,{url:e.target.value,checkedAt:null})}/><Input disabled={!data?.canEdit} className="mt-2" aria-label={`${labels[s]}条件メモ`} placeholder="状態・強化買取などの条件" value={q.note} onChange={e=>edit(s,{note:e.target.value})}/></section>})}
 {saveMessage&&<p role="status" className="rounded border p-3 text-sm">{saveMessage}</p>}<Button variant="outline" disabled={busy||!data?.canEdit} onClick={saveReference}>参考価格・紐付けだけ保存</Button><hr/>
 <div className="rounded bg-muted p-4"><p>反映先：{product?.name||'未選択'} ／ 現在 {product?yen(product.price):'未登録'}</p><label>弊社の新しい買取価格<Input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label><p className="my-2 text-xs">金額選択は下書きです。保存すると、この店舗の商品価格が変わります。0円の場合は価格表を非表示にします。他店舗にはこの画面から同期しません。</p><Button disabled={busy||!data?.canEdit||!product||amount===''||!Number.isInteger(Number(amount))||Number(amount)<0} onClick={()=>setMode('confirm')}>弊社価格の保存へ</Button></div></div>}
 {draft&&mode==='confirm'&&<div className="space-y-4"><p className="font-bold">{product?.name}</p><p>{product?.model_number} {product?.set_number}</p><p className="text-xl">{yen(product?.price)} → {yen(Number(amount))}</p><p>公開中の商品は買取価格の表示も変わります。</p><Button disabled={busy} variant="outline" onClick={()=>setMode('edit')}>戻る</Button><Button disabled={busy} onClick={savePrice}>この買取価格を保存</Button></div>}</DialogContent></Dialog>
 </main></>
}
