(() => {
  const container=document.createElement('section');
  container.className='card';container.id='walletPanel';
  container.innerHTML=`<h2>Karta pobytu v Google Wallet · testování</h2>
    <p>Alfréd kód a odkaz na Previo budou na kartě ihned. Stav potvrzuje recepce ručně; propojení s Previo API zatím není aktivní.</p>
    <div class="grid two"><div><label for="walletRelease">Přístup ke schránce nejdříve</label><input id="walletRelease" type="datetime-local"></div><div><label for="walletExpires">Konec platnosti karty</label><input id="walletExpires" type="datetime-local"></div></div>
    <label class="state-switch"><input id="walletReady" type="checkbox"><span>Pro tohoto hosta je ve schránce vložená karta a správný kód je ověřený.</span></label>
    <label class="state-switch"><input id="walletConfirm" type="checkbox"><span>Potvrzuji Alfréd kód, stav check-inu a platby nahoře a platnost pobytu pro tuto kartu.</span></label>
    <p class="small">Kód schránky se doplní pouze při dokončeném check-inu, uhrazené platbě, potvrzené přípravě a dosažení času přístupu. Po změně stavu stiskněte Aktualizovat; stejný Alfréd kód aktualizuje stejnou kartu. Aktualizace telefonu vyžaduje internet.</p>
    <div class="row"><button id="walletSync" class="btn" type="button">Vytvořit / aktualizovat kartu</button><button id="walletCopy" class="btn-ghost" type="button" hidden>Kopírovat odkaz na kartu</button><a id="walletOpen" class="btn-ghost" target="_blank" rel="noopener noreferrer" hidden>Otevřít kartu</a></div><p id="walletStatus" role="status" aria-live="polite"></p>`;
  document.querySelector('#bookingState').closest('.card').after(container);
  const q=id=>document.getElementById(id);
  let saveUrl='', revision=0;
  const reset=()=>{revision++;saveUrl='';q('walletCopy').hidden=true;q('walletOpen').hidden=true;q('walletOpen').removeAttribute('href');q('walletConfirm').checked=false;q('walletStatus').textContent='';};
  for(const id of ['alf','box','done','unpaid','walletReady','walletRelease','walletExpires'])q(id).addEventListener('input',()=>{reset();if(id==='alf'||id==='box')q('walletReady').checked=false;});
  q('clear').addEventListener('click',()=>{reset();q('walletReady').checked=false;q('walletRelease').value='';q('walletExpires').value='';});
  document.addEventListener('falconi:stay-loaded',()=>{reset();q('walletReady').checked=false;q('walletRelease').value='';q('walletExpires').value='';});
  q('walletSync').addEventListener('click',async()=>{
    if(!q('walletConfirm').checked){q('walletStatus').textContent='Nejdříve potvrďte správnost údajů pro tuto kartu.';return;}
    const release=new Date(q('walletRelease').value),expires=new Date(q('walletExpires').value);
    if(!Number.isFinite(release.getTime())||!Number.isFinite(expires.getTime())){q('walletStatus').textContent='Vyplňte oba časy platnosti.';return;}
    const submittedRevision=revision;
    const body={alfred:q('alf').value,boxCode:q('box').value.trim(),checkinComplete:q('done').checked,paymentComplete:!q('unpaid').checked,lockerReady:q('walletReady').checked,operatorConfirmed:true,releaseAt:release.toISOString(),expiresAt:expires.toISOString()};
    q('walletSync').disabled=true;q('walletCopy').hidden=true;q('walletOpen').hidden=true;saveUrl='';q('walletStatus').textContent='Aktualizuji kartu…';
    try {
      const response=await fetch('/api/wallet',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Aktualizace se nezdařila.');
      if(!result.saveUrl?.startsWith('https://pay.google.com/gp/v/save/'))throw new Error('Neplatný odkaz na kartu.');
      // A changed form must never expose the previous guest's save link.
      if(revision!==submittedRevision||q('alf').value!==body.alfred)throw new Error('Údaje hosta se změnily. Karta byla zpracována pro původní Alfréd kód; načtěte správný pobyt.');
      saveUrl=result.saveUrl;q('walletOpen').href=saveUrl;q('walletOpen').hidden=false;q('walletCopy').hidden=false;
      q('walletStatus').textContent=result.state==='ready'?'Google potvrdil aktualizaci: Alfréd i kód schránky. Synchronizace telefonu může chvíli trvat.':'Google potvrdil aktualizaci: Alfréd kód a odkaz. Kód schránky není zveřejněný.';
      q('walletConfirm').checked=false;
    }catch(e){q('walletStatus').textContent=e.message;}finally{q('walletSync').disabled=false;}
  });
  q('walletCopy').addEventListener('click',async()=>{if(saveUrl)try{await navigator.clipboard.writeText(saveUrl);q('walletStatus').textContent='Odkaz na kartu byl zkopírován.';}catch{q('walletStatus').textContent='Kopírování není dostupné. Použijte Otevřít kartu.';}});
})();

