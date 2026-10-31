'use client'
import { useEffect, useState } from 'react'
import { SingleSeriesPicker } from '@/components/admin/single-series-picker'
import SeriesSingles from '@/components/admin/series-singles'
import { createClient } from '@/lib/supabase/client'
import { MEGA_SERIES, singleSeriesCode, singleSeriesOptions, type SingleSeriesOption } from '@/lib/single-series'
import { toast } from 'sonner'
import { fetchAllUuidRows } from '@/lib/fetch-all-rows'

export default function SinglesPage() {
  const [multiple, setMultiple] = useState(false)
  const [code, setCode] = useState('M6A')
  const [series, setSeries] = useState<SingleSeriesOption[]>(() => singleSeriesOptions(MEGA_SERIES.map(s => s.code)))
  useEffect(() => {
    let active = true
    async function load() {
      const s = createClient()
      const { data, error } = await fetchAllUuidRows((after,size,lower,upper)=>{let q=s.from('products').select('id,name,set_number,subcategory_id').eq('is_active',true).eq('category_id','db02ec12-d529-453c-a749-53da99e05533').in('subcategory_id',['19b8ce8e-1380-42ea-ba7a-0e2a0ad8a0b9','ca8f802a-52f1-495a-ab49-158063b00d64']).order('id').limit(size);q=q.gte('id',lower);if(upper)q=q.lt('id',upper);if(after)q=q.gt('id',after);return q}, { shouldContinue: () => active })
      if (!active) return
      if (error) { toast.error('シリーズ一覧を取得できませんでした'); return }
      setSeries(singleSeriesOptions([...MEGA_SERIES.map(s=>s.code),...(data??[]).map(singleSeriesCode)]))
    }
    load()
    return () => { active = false }
  }, [])
  return <>
    <div className="mb-4 flex gap-2" aria-label="画像作成モード">
      <button type="button" aria-pressed={!multiple} className={`rounded-md border px-4 py-2 ${!multiple ? 'bg-orange-500 text-white' : ''}`} onClick={() => setMultiple(false)}>1シリーズ</button>
      <button type="button" aria-pressed={multiple} className={`rounded-md border px-4 py-2 ${multiple ? 'bg-orange-500 text-white' : ''}`} onClick={() => setMultiple(true)}>複数シリーズ</button>
    </div>
    {!multiple && <label className="mb-6 flex items-center gap-3 font-medium">シリーズ
      <SingleSeriesPicker options={series} value={code} onChange={setCode} label="シリーズ" className="w-full max-w-xl" />
    </label>}
    {multiple ? <SeriesSingles key="MULTI" code="MULTI" name="ポケモン合同" seriesOptions={series} /> : <SeriesSingles key={code} code={code} name={series.find(s => s.code === code)?.name || code} /> }
  </>
}
