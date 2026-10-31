'use client'
import {useId,useState} from 'react'
import {Check,ChevronsUpDown} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover'
import {Command,CommandGroup,CommandInput,CommandItem,CommandList} from '@/components/ui/command'
import {filterSingleSeriesOptions,type SingleSeriesOption} from '@/lib/single-series'

export function SingleSeriesPicker({options,value,onChange,allowAll=false,label='シリーズ',className='w-full sm:w-80'}:{options:SingleSeriesOption[];value:string;onChange:(code:string)=>void;allowAll?:boolean;label?:string;className?:string}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');const listId=useId()
 const selected=options.find(s=>s.code===value)
 const filtered=filterSingleSeriesOptions(options,query),dated=filtered.filter(s=>s.releaseDate),unknown=filtered.filter(s=>!s.releaseDate)
 const select=(code:string)=>{onChange(code);setOpen(false);setQuery('')}
 const item=(s:SingleSeriesOption)=><CommandItem key={s.code} value={s.code} onSelect={()=>select(s.code)} className="items-start gap-2 py-3"><Check aria-hidden className={`mt-0.5 size-4 shrink-0 ${value===s.code?'opacity-100':'opacity-0'}`}/><span className="min-w-0 flex-1 whitespace-normal break-words">{s.label}</span>{s.releaseDate&&<time dateTime={s.releaseDate} className="shrink-0 text-xs tabular-nums text-muted-foreground">{s.releaseDate.replaceAll('-','/')}</time>}</CommandItem>
 return <Popover open={open} onOpenChange={v=>{setOpen(v);if(!v)setQuery('')}}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-controls={listId} aria-label={label} className={`justify-between font-normal ${className}`}><span className="truncate">{value==='all'?'全シリーズ（シングル）':selected?.label||'シリーズを選択'}</span><ChevronsUpDown aria-hidden className="ml-2 size-4 shrink-0 opacity-50"/></Button></PopoverTrigger><PopoverContent align="start" className="p-0" style={{width:'min(90vw, 42rem)'}}><Command shouldFilter={false}><CommandInput aria-label="シリーズ名・型番で検索" placeholder="シリーズ名・型番で検索（例：テラスタル、SV8a）" value={query} onValueChange={setQuery}/><div className="border-b px-3 py-2 text-xs text-muted-foreground">発売日の新しい順 ／ {filtered.length}件</div><CommandList id={listId} className="max-h-80">{allowAll&&!query.trim()&&<CommandGroup><CommandItem value="all" onSelect={()=>select('all')}><Check aria-hidden className={`mr-2 size-4 ${value==='all'?'opacity-100':'opacity-0'}`}/>全シリーズ（シングル）</CommandItem></CommandGroup>}{dated.length>0&&<CommandGroup heading="発売日順（新しい順）">{dated.map(item)}</CommandGroup>}{unknown.length>0&&<CommandGroup heading="発売日未確認">{unknown.map(item)}</CommandGroup>}{!filtered.length&&<p role="status" className="px-4 py-6 text-center text-sm text-muted-foreground">該当するシリーズがありません</p>}</CommandList></Command></PopoverContent></Popover>
}
