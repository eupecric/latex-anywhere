/* Persistent visibility controls, available even when all page UI is hidden. */
'use strict';
const GLOBAL_KEY='latex-anywhere-visibility-v2:global-hidden';
const DOMAIN_PREFIX='latex-anywhere-visibility-v2:domain-hidden:';
const globalToggle=document.getElementById('globalHidden');
const domainToggle=document.getElementById('domainHidden');
const domainName=document.getElementById('domainName');
const status=document.getElementById('status');
let domain=null;
let domainKey=null;
let legacyOrigin=null;
function showStatus(globalHidden,domainHidden) {
  status.textContent=globalHidden?'Oculta em todos os sites':
    domainHidden?'Oculta neste domínio':'Extensão ativa';
}
async function refresh() {
  const keys=[GLOBAL_KEY];
  if (domainKey) keys.push(domainKey);
  if (legacyOrigin) keys.push(`latex-anywhere-enabled-v1:${legacyOrigin}`);
  const values=await chrome.storage.local.get(keys);
  const globalHidden=values[GLOBAL_KEY]===true;
  const domainHidden=domainKey
    ? (typeof values[domainKey]==='boolean' ? values[domainKey]
      : values[`latex-anywhere-enabled-v1:${legacyOrigin}`]===false)
    : false;
  globalToggle.checked=globalHidden;
  domainToggle.checked=domainHidden;
  domainToggle.disabled=!domainKey;
  showStatus(globalHidden,domainHidden);
}
async function init() {
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if (tab?.id!=null) {
      const reply=await chrome.tabs.sendMessage(tab.id,{type:'latex-anywhere:get-state'},{frameId:0});
      if (reply?.domain) {
        domain=reply.domain;
        domainKey=DOMAIN_PREFIX+domain;
        domainName.textContent=domain==='local-files'?'Arquivos locais (file://)':domain;
      }
    }
  } catch { /* No content script on browser-internal or restricted pages. */ }
  if (!domainKey) domainName.textContent='Não disponível nesta página';
  await refresh();
}
globalToggle.addEventListener('change',async()=>{
  globalToggle.disabled=true;
  try { await chrome.storage.local.set({[GLOBAL_KEY]:globalToggle.checked});await refresh(); }
  catch { status.textContent='Falha ao salvar configuração.'; }
  finally { globalToggle.disabled=false; }
});
domainToggle.addEventListener('change',async()=>{
  if (!domainKey) return;
  domainToggle.disabled=true;
  try { await chrome.storage.local.set({[domainKey]:domainToggle.checked});await refresh(); }
  catch { status.textContent='Falha ao salvar configuração.'; }
  finally { domainToggle.disabled=false; }
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if (area==='local' && (GLOBAL_KEY in changes || (domainKey && domainKey in changes)))
    void refresh();
});
void init();
