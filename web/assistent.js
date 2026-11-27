// =============================================================================
// Syndexia Platform - Syn, het assistentje.
//
// Syn zweeft rechtsonder op elk scherm van het kantoor. Sta je in een VME, dan kent hij
// de gegevens van die VME; op de andere schermen kent hij het overzicht van het kantoor.
// Hij weet ook waar alles staat en legt uit hoe je iets doet. De vraag gaat naar de Edge
// Function "ai-assistent", die de gegevens ophaalt met jouw login. Syn leest alleen: hij
// boekt, verstuurt of wijzigt niets. Het gesprek wordt niet bewaard; na herladen is het weg.
//
// Het paneel hangt buiten <main>, zodat het blijft staan terwijl de schermen eronder wisselen.
// Voor eigenaars staat dezelfde assistent onderaan het portaal (zonder zwevend figuurtje).
// =============================================================================
const SYN_FIGUUR = `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
  <path d="M10 28 32 9l22 19v24a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5z" fill="#fff"/>
  <path d="M6 30 32 7l26 23" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <g class="synogen"><rect x="19" y="29" width="9" height="11" rx="3" fill="#2B1622"/><rect x="36" y="29" width="9" height="11" rx="3" fill="#2B1622"/>
    <circle cx="25" cy="32.5" r="1.8" fill="#fff"/><circle cx="42" cy="32.5" r="1.8" fill="#fff"/></g>
  <path d="M25 46q7 6 14 0" fill="none" stroke="#8B1A4A" stroke-width="3" stroke-linecap="round"/></svg>`;
const SYN_TIPS = {
  vme: ['Maak een taak: meterstanden opnemen tegen eind deze maand', 'Welke dossiers staan open?', 'Wie heeft nog provisies openstaan?', 'Open een dossier voor een lek in de garage'],
  kantoor: ['Wat staat er vandaag te doen?', 'Welke taken staan nog open?', 'Welke gebouwen hebben openstaande provisies?', 'Hoe neem ik een gebouw over?'],
};
// Eén beurt in het gesprek. Bij Syn kunnen er twee dingen onder het antwoord staan:
//   acties      wat hij zelf al uitgevoerd heeft (groen vinkje)
//   voorstellen wat naar buiten gaat en dus eerst door de syndicus bevestigd moet worden
const synBel = (b, nr) => `<div class="synrij ${b.role === 'user' ? 'ik' : 'syn'}"><div class="synbel">${esc(b.content)}${(b.acties ?? []).length ? `<ul class="synacties">${b.acties.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</div></div>${(b.voorstellen ?? []).map((v, i) => `<div class="synvoorstel" data-beurt="${nr}" data-nr="${i}"><b>${esc(v.titel)}</b><span class="klein">${esc(v.uitleg)}</span><p>${esc(v.tekst)}</p>
    ${v.stand === 'gedaan' ? `<span class="pil ok">verstuurd</span>` : v.stand === 'niet' ? '<span class="pil">niet verstuurd</span>' : `${v.fout ? `<div class="melding fout">${esc(v.fout)}</div>` : ''}<div class="synknoppen"><button type="button" data-synja>Bevestigen en mailen</button><button type="button" class="stil" data-synnee>Niet doen</button></div>`}</div>`).join('')}`;
// Waar sta je? In een VME praat Syn over die VME, anders over het kantoor.
const synPlek = () => (location.hash.startsWith('#/vme/') && S.vme ? { sleutel: S.vme.id, soort: 'vme', naam: S.vme.naam, extra: { vme_id: S.vme.id, boekjaar_id: S.bj?.id ?? null } } : { sleutel: 'kantoor', soort: 'kantoor', naam: S.kantoor?.naam ?? '', extra: {} });
async function synVraag(extra, gesprek, tekst) {
  const { data, error } = await sb.functions.invoke('ai-assistent', { body: { ...extra, vraag: tekst, geschiedenis: gesprek } });
  if (error || data?.fout) { let uitleg = data?.fout ?? error.message; try { uitleg = (await error.context.json()).fout ?? uitleg; } catch (e) { /* geen uitleg */ } throw new Error(uitleg); }
  gesprek.push({ role: 'user', content: tekst }, { role: 'assistant', content: data.antwoord, acties: data.acties ?? [], voorstellen: data.voorstellen ?? [] });
  return (data.acties ?? []).length;   // aantal uitgevoerde acties: dan moet het scherm erachter ververst worden
}
// Na een actie van Syn het scherm erachter opnieuw tekenen, zodat de nieuwe taak of het nieuwe dossier er meteen staat.
async function synVervers() { try { if (location.hash.startsWith('#/vme/') && S.vme) await laadVme(S.vme.id); await route(); } catch (e) { /* het scherm verversen mag het gesprek niet breken */ } }

function synTeken() {
  const paneel = document.getElementById('synpaneel'); if (!paneel || paneel.hidden) return;
  const plek = synPlek(), gesprek = ((S.gesprekken ??= {})[plek.sleutel] ??= []);
  paneel.innerHTML = `<div class="synkop"><span class="synkopfiguur">${SYN_FIGUUR}</span><div><b>Syn</b><br><span>${plek.soort === 'vme' ? `over ${esc(plek.naam)}` : 'over het hele kantoor'}</span></div>
      ${gesprek.length ? '<button type="button" class="synlicht" id="synnieuw">Opnieuw</button>' : ''}<button type="button" class="synlicht" id="syndicht" aria-label="Sluiten">✕</button></div>
    <div class="syngesprek" id="syngesprek">${gesprek.length ? gesprek.map(synBel).join('') : `<div class="synrij syn"><div class="synbel">Dag! Ik ben Syn. Zeg wat ik moet doen of vraag me iets over ${plek.soort === 'vme' ? 'dit gebouw' : 'je gebouwen'}. Ik maak taken, open dossiers, werk ze bij, voer attesten in, plan vergaderingen en zet werkopdrachten klaar. Wat naar buiten gaat, bevestig jij eerst.</div></div>
      <div class="syntips">${SYN_TIPS[plek.soort].map((t) => `<button type="button" class="syntip">${esc(t)}</button>`).join('')}</div>`}<div id="synfout"></div></div>
    <form id="synform"><input name="vraag" maxlength="2000" required autocomplete="off" placeholder="Zeg wat ik moet doen…" aria-label="Je vraag of opdracht aan Syn"><button aria-label="Versturen">➤</button></form>`;
  const vak = document.getElementById('syngesprek'), f = document.getElementById('synform'); vak.scrollTop = vak.scrollHeight;
  const stel = async (tekst) => {
    vak.insertAdjacentHTML('beforeend', `${synBel({ role: 'user', content: tekst })}<div class="synrij syn" id="syndenkt"><div class="synbel synpuntjes"><i></i><i></i><i></i></div></div>`); vak.scrollTop = vak.scrollHeight;
    f.vraag.value = ''; f.querySelector('button').disabled = true;
    try { const gedaan = await synVraag(plek.extra, gesprek, tekst); synTeken(); if (gedaan) synVervers(); }
    catch (e) { document.getElementById('syndenkt')?.remove(); vak.lastElementChild?.matches('.synrij.ik') && vak.lastElementChild.remove(); f.querySelector('button').disabled = false; f.vraag.value = tekst;
      document.getElementById('synfout').innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; vak.scrollTop = vak.scrollHeight; }
  };
  f.onsubmit = (ev) => { ev.preventDefault(); const t = f.vraag.value.trim(); if (t) stel(t); };
  // een voorstel bevestigen of weigeren
  paneel.querySelectorAll('.synvoorstel').forEach((el) => { const v = gesprek[Number(el.dataset.beurt)]?.voorstellen?.[Number(el.dataset.nr)]; if (!v) return;
    const nee = el.querySelector('[data-synnee]'), ja = el.querySelector('[data-synja]');
    if (nee) nee.onclick = () => { v.stand = 'niet'; synTeken(); };
    if (ja) ja.onclick = async () => { ja.disabled = true; ja.textContent = 'Bezig…';
      try {
        const { data, error } = await sb.functions.invoke('werkopdracht', { body: { ...v.gegevens, kanaal: 'mail' } });
        if (error || data?.fout) { let uitleg = data?.fout ?? error.message; try { uitleg = (await error.context.json()).fout ?? uitleg; } catch (e) { /* geen uitleg */ } throw new Error(uitleg); }
        v.stand = 'gedaan'; v.fout = null; synTeken(); synVervers();
      } catch (e) { v.fout = e.message; synTeken(); }
    }; });
  paneel.querySelectorAll('.syntip').forEach((b) => { b.onclick = () => stel(b.textContent); });
  document.getElementById('syndicht').onclick = () => synOpen(false);
  const nieuw = document.getElementById('synnieuw'); if (nieuw) nieuw.onclick = () => { gesprek.length = 0; synTeken(); };
  f.vraag.focus();
}
function synOpen(open) {
  const paneel = document.getElementById('synpaneel'), knop = document.getElementById('synknop');
  paneel.hidden = !open; knop.setAttribute('aria-expanded', String(open)); knop.classList.toggle('open', open);
  if (open) synTeken(); else knop.focus();
}
// Zet het figuurtje op de pagina (één keer) en toont het alleen voor wie bij een kantoor hoort.
UIT.synToon = () => {
  let knop = document.getElementById('synknop');
  if (!knop) {
    document.body.insertAdjacentHTML('beforeend', `<button type="button" id="synknop" aria-label="Open Syn, je assistent" aria-expanded="false" hidden>${SYN_FIGUUR}</button><section id="synpaneel" aria-label="Syn, je assistent" hidden></section>`);
    knop = document.getElementById('synknop');
    knop.onclick = () => synOpen(document.getElementById('synpaneel').hidden);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !document.getElementById('synpaneel').hidden) synOpen(false); });
    window.addEventListener('hashchange', () => setTimeout(synTeken, 400));   // andere pagina: Syn praat over wat nu open staat
  }
  const mag = !!(S.sessie && S.kantoor) && !(UIT.openbaar && /^#\/(meld|aanvaard)\//.test(location.hash));
  knop.hidden = !mag; if (!mag) document.getElementById('synpaneel').hidden = true;
};

// In het portaal: een eigenaar stelt vragen over zijn eigen gegevens (vast blok, geen figuurtje).
UIT.portaalExtra = () => { const g = (S.portaalGesprek ??= []);
  return `<div class="kaart"><h3 style="margin-top:0">Een vraag?</h3><p class="klein">De assistent beantwoordt vragen over uw eigen gegevens op deze pagina. Voor al het andere neemt u contact op met uw syndicus.</p>
    <div id="asgesprek">${g.map(synBel).join('')}</div>
    ${g.length ? '' : `<p>${['Hoeveel moet ik nog betalen en tegen wanneer?', 'Wanneer is de volgende vergadering?'].map((t) => `<button type="button" class="stil astip" style="margin:0 6px 6px 0">${esc(t)}</button>`).join('')}</p>`}
    <form id="fas"><div class="rij" style="align-items:flex-end"><div style="flex:1 1 300px"><label>Uw vraag</label><input name="vraag" maxlength="2000" required autocomplete="off"></div><div><button>Vragen</button></div></div></form><div id="asfout"></div></div>`; };
UIT.portaalBind = (opnieuw) => {
  const f = document.getElementById('fas'); if (!f) return;
  const stel = async (tekst) => {
    const knop = f.querySelector('button'); knop.disabled = true; knop.textContent = 'Even denken…';
    try { await synVraag({ portaal: true }, S.portaalGesprek, tekst); opnieuw(); }
    catch (e) { knop.disabled = false; knop.textContent = 'Vragen'; document.getElementById('asfout').innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; }
  };
  f.onsubmit = (ev) => { ev.preventDefault(); const t = f.vraag.value.trim(); if (t) stel(t); };
  // een voorstel bevestigen of weigeren
  paneel.querySelectorAll('.synvoorstel').forEach((el) => { const v = gesprek[Number(el.dataset.beurt)]?.voorstellen?.[Number(el.dataset.nr)]; if (!v) return;
    const nee = el.querySelector('[data-synnee]'), ja = el.querySelector('[data-synja]');
    if (nee) nee.onclick = () => { v.stand = 'niet'; synTeken(); };
    if (ja) ja.onclick = async () => { ja.disabled = true; ja.textContent = 'Bezig…';
      try {
        const { data, error } = await sb.functions.invoke('werkopdracht', { body: { ...v.gegevens, kanaal: 'mail' } });
        if (error || data?.fout) { let uitleg = data?.fout ?? error.message; try { uitleg = (await error.context.json()).fout ?? uitleg; } catch (e) { /* geen uitleg */ } throw new Error(uitleg); }
        v.stand = 'gedaan'; v.fout = null; synTeken(); synVervers();
      } catch (e) { v.fout = e.message; synTeken(); }
    }; });
  document.querySelectorAll('.astip').forEach((b) => { b.onclick = () => stel(b.textContent); });
};
