/* Embed after the existing Falconi guest page. No guest data is fetched or sent on load. */
(() => {
  function render(){
    document.getElementById('falconi-wallet-save')?.remove();
    const root=document.getElementById('falconi-guest');
    const token=new URLSearchParams(location.hash.slice(1)).get('wallet');
    if(!root||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}\.[A-Za-z0-9_-]{43}$/.test(token||''))return;
    const language=root.lang||document.documentElement.lang;
    const lang=language.startsWith('de')?'de':language.startsWith('en')?'en':'cs';
    const text={
      cs:['Karta pobytu v telefonu','Uložte si Alfrédův kód do Google Wallet. Po potvrzení recepcí se do stejné karty doplní kód schránky.','Uložit do Google Wallet','Pro telefony Android. S povolenou polohou a oznámeními se karta může připomenout poblíž pensionu.'],
      en:['Your stay card on your phone','Save your Alfred code to Google Wallet. Once reception confirms everything is ready, your key safe code will be added to the same card.','Save to Google Wallet','For Android phones. With location and notifications enabled, your phone may remind you of the card near the pension.'],
      de:['Ihre Aufenthaltskarte auf dem Handy','Speichern Sie Ihren Alfréd-Code in Google Wallet. Nach Bestätigung durch die Rezeption wird der Schlüsselsafe-Code derselben Karte hinzugefügt.','In Google Wallet speichern','Für Android-Handys. Mit aktivierter Standortfreigabe und Benachrichtigungen kann Ihr Handy Sie in der Nähe der Pension an die Karte erinnern.']
    }[lang];
    const section=document.createElement('section');section.id='falconi-wallet-save';section.className='card';
    section.style.cssText='background:#e5eef6;border-color:#bfd0df';
    const title=document.createElement('h2');title.textContent=text[0];
    const description=document.createElement('p');description.textContent=text[1];
    const link=document.createElement('a');link.className='button';link.textContent=text[2];
    link.href='https://falconi-messenger.vercel.app/api/wallet-save?token='+encodeURIComponent(token);
    link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';
    const note=document.createElement('p');note.className='muted';note.style.cssText='font-size:13px;margin:12px 0 0';note.textContent=text[3];
    section.append(title,description,link,note);
    const status=root.querySelector('.status');if(status)status.after(section);else root.append(section);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
  window.addEventListener('hashchange',render);
})();
