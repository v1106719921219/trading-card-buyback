'use client'
import { useEffect, useState } from 'react'
import SeriesSingles from '@/components/admin/series-singles'
import { createClient } from '@/lib/supabase/client'
import { MEGA_SERIES, singleSeriesCode } from '@/lib/single-series'
import { toast } from 'sonner'

export default function SinglesPage() {
  const [multiple, setMultiple] = useState(false)
  const [code, setCode] = useState('M6A')
  const [series, setSeries] = useState(MEGA_SERIES)
  useEffect(() => {
    let active = true
    async function load() {
      const s = createClient()
      const { data, error } = await s.from('products').select('name,set_number,subcategory_id').eq('is_active', true).eq('category_id', 'db02ec12-d529-453c-a749-53da99e05533').in('subcategory_id', ['19b8ce8e-1380-42ea-ba7a-0e2a0ad8a0b9', '7fc8c032-c373-438a-bc14-6a9e8c113767'])
      if (!active) return
      if (error) { toast.error('シリーズ一覧を取得できませんでした'); return }
      const names = new Map(MEGA_SERIES.map(s => [s.code, s.name]))
      const codes = new Set(MEGA_SERIES.map(s => s.code))
      for (const p of data || []) {
        const c = singleSeriesCode(p)
        if (p.subcategory_id === '19b8ce8e-1380-42ea-ba7a-0e2a0ad8a0b9') codes.add(c)
        else if (c !== 'OTHER' && !names.has(c)) names.set(c, p.name)
      }
      setSeries([...codes].map(code => ({ code, name: names.get(code) || (code === 'OTHER' ? 'その他・まとめ買取' : code) })))
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
      <select aria-label="シリーズ" className="rounded-md border bg-background px-3 py-2" value={code} onChange={e => setCode(e.target.value)}>
        {series.map(s => <option key={s.code} value={s.code}>{s.name}（{s.code}）</option>)}
      </select>
    </label>}
    {multiple ? <SeriesSingles key="MULTI" code="MULTI" name="ポケモン合同" seriesOptions={series} /> : <SeriesSingles key={code} code={code} name={series.find(s => s.code === code)?.name || code} /> }
  </>
}
