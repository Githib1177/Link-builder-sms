<script>
// ⬇️ Nahraď v souboru jen tuto funkci sendSms (zbytek nech jak je)
async function sendSms(){
  const toRaw   = Q('#smsTo').value.trim();
  const lang    = Q('#smsLang').value;
  const text    = (function(){
    const map = { cz:'#smsCZ', en:'#smsEN', de:'#smsDE' };
    const el = Q(map[lang] || '#smsCZ');
    return (el && el.value) ? el.value.trim() : '';
  })();
  const statusEl = Q('#smsStatus');

  if(!toRaw){ statusEl.textContent = 'Zadej alespoň jedno číslo.'; return; }
  if(!text){ statusEl.textContent = 'Nejprve klikni na „Vygenerovat odkazy“, aby se vytvořil text.'; return; }

  // normalizace tel. čísel (stejně jako dřív)
  const numbers = toRaw
    .split(/[,\n;]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/[^+\d]/g,''))
    .filter(s => /^\+?\d{8,15}$/.test(s));

  if(numbers.length === 0){ statusEl.textContent = 'Žádné validní číslo (použij +420…).'; return; }

  statusEl.textContent = 'Odesílám…';

  try{
    const resp = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ to: numbers, text })
    });
    const data = await resp.json().catch(()=> ({}));

    if(!resp.ok || !data){
      throw new Error(data?.error || 'Chyba při odesílání');
    }

    // vyhodnocení výsledků
    const results = Array.isArray(data.results) ? data.results : [];
    const okCount = results.filter(r => r && (r.err === 0 || /<err>0<\/err>/.test(String(r.raw||'')))).length;

    // vytáhneme detaily z 1. výsledku (id, cena, kredit) – pokud je gateway poslala
    const first = results[0] || {};
    const raw   = String(first.raw || '');

    const smsId    = first.sms_id || (raw.match(/<sms_id>(\d+)<\/sms_id>/)?.[1] || '');
    const price    = first.price   || (raw.match(/<price>([^<]+)<\/price>/)?.[1] || '');
    const credit   = first.credit  || (raw.match(/<credit>([^<]+)<\/credit>/)?.[1] || '');
    const endpoint = first.endpoint || '';

    if(data.ok || okCount > 0){
      const parts = [];
      if(smsId)  parts.push(`id: ${smsId}`);
      if(price)  parts.push(`cena: ${Number(price).toFixed ? Number(price).toFixed(2) : price} Kč`);
      if(credit) parts.push(`kredit: ${credit}`);
      if(results.length > 1) parts.unshift(`odesláno ${okCount}/${results.length}`);
      statusEl.textContent = '✓ SMS odeslána' + (parts.length ? ` (${parts.join(', ')})` : '');
    }else{
      // najdeme první chybu a zobrazíme zprávu
      const errItem = results.find(r => r && r.err !== 0) || {};
      const errMsg  = errItem.errMessage || data.error || 'neznámá chyba';
      statusEl.textContent = '✗ Nepodařilo se odeslat: ' + errMsg;
    }
  }catch(e){
    statusEl.textContent = '✗ Nepodařilo se odeslat: ' + (e.message || e);
  }
}
</script>
