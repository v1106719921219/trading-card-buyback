/** Group display aliases without changing stored category IDs or products. */
export function publicSubcategories(
 subs: {id:string;name:string;category_id:string}[],
 categories: {id:string;name:string}[],
 products: {subcategory_id:string|null}[],
 selectedCategory:string,
){
 const available=new Set(products.map(p=>p.subcategory_id))
 const groups=new Map<string,{id:string;name:string;category_id:string;ids:string[]}>()
 for(const sub of subs){
  if(!available.has(sub.id)||(selectedCategory!=='all'&&sub.category_id!==selectedCategory))continue
  const name=sub.name.normalize('NFKC').trim().replace(/^ポケモン\s*シングルカード$/, 'シングルカード').replace(/シュリンク付き?BOX/g,'シュリンク付きBOX')
  const key=sub.category_id+':'+name.replace(/\s/g,'')
  const found=groups.get(key)
  if(found)found.ids.push(sub.id)
  else groups.set(key,{id:sub.id,name,category_id:sub.category_id,ids:[sub.id]})
 }
 return [...groups.values()].map(g=>({...g,label:selectedCategory==='all'?`${categories.find(c=>c.id===g.category_id)?.name||'未分類'} / ${g.name}`:g.name}))
}
