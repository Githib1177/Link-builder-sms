import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createWalletHandler } from '../api/wallet.js';
import { createSessionCookie } from '../api/_auth.js';
test('authenticated manual flow: initial card, code release, withdrawal, failure and retry reuse one card',async()=>{
  const oldDb=process.env.DATABASE_URL,oldSecret=process.env.SESSION_SECRET;
  process.env.DATABASE_URL='local-test';process.env.SESSION_SECRET='local-test-only';
  const db=new PGlite();
  const sql=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  const objects=[];let fail=false;
  const handler=createWalletHandler({connect:()=>sql,getConfig:()=>({issuerId:'123',classSuffix:'test'}),putObject:async object=>{if(fail)throw new Error('Google nepotvrdil aktualizaci.');objects.push(object);},makeSaveUrl:id=>'https://pay.google.com/gp/v/save/'+id});
  const base={alfred:'DEMOXX',checkinComplete:false,paymentComplete:false,lockerReady:false,operatorConfirmed:true,boxCode:'482751',releaseAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
  async function call(change={}){const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};await handler({method:'POST',headers:{cookie:createSessionCookie().split(';')[0]},body:{...base,...change}},res);return res;}
  try{
    assert.equal((await call({operatorConfirmed:false})).code,400);assert.equal(objects.length,0);
    const pending=await call();assert.equal(pending.code,200);assert.equal(pending.body.state,'pending');assert.ok(!JSON.stringify(objects.at(-1)).includes(base.boxCode));
    const ready=await call({checkinComplete:true,paymentComplete:true,lockerReady:true});assert.equal(ready.body.state,'ready');assert.equal(pending.body.passId,ready.body.passId);assert.equal(objects.at(-1).header.defaultValue.value,base.boxCode);
    const withdrawn=await call({checkinComplete:true,paymentComplete:false,lockerReady:true});assert.equal(withdrawn.body.state,'pending');assert.ok(!JSON.stringify(objects.at(-1)).includes(base.boxCode));
    fail=true;assert.equal((await call()).code,503);fail=false;
    assert.equal((await call()).body.passId,pending.body.passId);
    const rows=await sql`SELECT * FROM wallet_passes`;assert.equal(rows.length,1);assert.equal(rows[0].claim,null);assert.equal(Number(rows[0].busy_until),0);
  }finally{await db.close();if(oldDb===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldDb;if(oldSecret===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=oldSecret;}
});
