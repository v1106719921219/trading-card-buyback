import test from 'node:test';import assert from 'node:assert/strict';
import {validateCostBands,bandsReduction,itemSubtotal,expandUnitCosts} from '../../src/lib/inspection-costs.ts';

test('減額なしなら枚数分すべて検品単価',()=>{
 assert.equal(validateCostBands(1000,3,[]),null);
 assert.equal(itemSubtotal(1000,3,[]),3000);
 assert.deepEqual(expandUnitCosts(1000,3,[]),[1000,1000,1000]);
});
test('一部を減額した分だけ差し引く',()=>{
 const bands=[{quantity:2,unit_price:0,reason:'傷あり'}];
 assert.equal(validateCostBands(1000,3,bands),null);
 assert.equal(bandsReduction(1000,bands),2000);
 assert.equal(itemSubtotal(1000,3,bands),1000);
 assert.deepEqual(expandUnitCosts(1000,3,bands),[0,0,1000]);
});
test('減額後単価が検品単価以上なら拒否',()=>{
 assert.match(validateCostBands(1000,3,[{quantity:1,unit_price:1000,reason:'理由'}]),/減額後単価/);
});
test('理由未入力は拒否',()=>{
 assert.match(validateCostBands(1000,3,[{quantity:1,unit_price:0,reason:''}]),/理由/);
});
test('枚数が買取枚数を超える内訳は拒否',()=>{
 assert.match(validateCostBands(1000,3,[{quantity:4,unit_price:0,reason:'理由'}]),/超えています/);
});
