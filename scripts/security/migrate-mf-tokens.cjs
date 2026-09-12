// Use only with the selected environment's server-side credentials. Never prints tokens.
const { createClient } = require('@supabase/supabase-js');
const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
async function main() {
  const mode=process.argv[2];
  if (!['--check','--stage','--finalize'].includes(mode)) throw Error('Specify --check, --stage or --finalize');
  const { NEXT_PUBLIC_SUPABASE_URL:url, SUPABASE_SERVICE_ROLE_KEY:apiKey, ORDER_ACCESS_SECRET:secret, SECURITY_TENANT_SLUG:slug }=process.env;
  if (!url || !apiKey || !secret || secret.length<32 || !['quadra','chiba'].includes(slug)) throw Error('Environment is incomplete');
  const db=createClient(url,apiKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:tenant,error:te}=await db.from('tenants').select('id').eq('slug',slug).eq('is_active',true).single();
  if(te||!tenant) throw Error('Tenant validation failed');
  const {data:rows,error}=await db.from('mf_tokens').select('id,tenant_id,access_token,refresh_token,access_token_encrypted,refresh_token_encrypted,updated_at');
  if(error) throw Error('Run schema migrations before this operation');
  const key=createHash('sha256').update(secret+':secret-at-rest-v1').digest();
  function decrypt(value,context){const [v,iv,tag,body]=value.split('.');if(v!=='enc1')throw Error('Unsupported ciphertext');const d=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));d.setAAD(Buffer.from(context));d.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([d.update(Buffer.from(body,'base64url')),d.final()]).toString()}
  function encrypt(value,context){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(context));const body=Buffer.concat([c.update(value,'utf8'),c.final()]);const result=['enc1',iv.toString('base64url'),c.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');if(decrypt(result,context)!==value)throw Error('Verification failed');return result}
  let legacy=0,encrypted=0;
  for(const row of rows){
    if(row.id!==1 || (row.tenant_id && row.tenant_id!==tenant.id))throw Error('Unexpected connection ownership; stop for review');
    const hasLegacy=!!(row.access_token||row.refresh_token);
    if(hasLegacy)legacy++;
    if(row.access_token_encrypted&&row.refresh_token_encrypted){decrypt(row.access_token_encrypted,tenant.id+':mf-access');decrypt(row.refresh_token_encrypted,tenant.id+':mf-refresh');encrypted++}
    if(mode==='--check')continue;
    const patch={tenant_id:tenant.id};
    if(hasLegacy){patch.access_token_encrypted=encrypt(row.access_token||'',tenant.id+':mf-access');patch.refresh_token_encrypted=encrypt(row.refresh_token||'',tenant.id+':mf-refresh')}
    else if(!row.access_token_encrypted||!row.refresh_token_encrypted)throw Error('Missing connection credentials');
    if(mode==='--finalize'){patch.access_token='';patch.refresh_token=''}
    // Compare-and-swap: never overwrite a concurrent OAuth refresh/reconnection.
    let q=db.from('mf_tokens').update(patch).eq('id',row.id);
    for(const f of ['updated_at','access_token','refresh_token','access_token_encrypted','refresh_token_encrypted']) q=row[f]===null?q.is(f,null):q.eq(f,row[f]);
    const {data:changed,error:ue}=await q.select('id');
    if(ue||changed?.length!==1)throw Error('Concurrent change or write failure; recheck before retrying');
  }
  console.log(JSON.stringify({mode,tenant:slug,connections:rows.length,legacy_before:legacy,encrypted_before:encrypted,success:true}));
}
main().catch(()=>{console.error('MF credential migration failed. Values withheld; verify environment and schema, then recheck concurrent updates.');process.exitCode=1});
