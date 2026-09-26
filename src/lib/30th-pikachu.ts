// Individual mirror cards remain available for image generation and past orders.
// New customer applications use the existing range product and a total card count.
export function isIndividual30thPikachu(p: { name: string; subcategory_id: string | null }) {
  return p.subcategory_id === 'ca8f802a-52f1-495a-ab49-158063b00d64'
    && /^ピカチュウ \(0(?:1[7-9]|[23]\d|4[0-6])\/103\)$/.test(p.name)
}
