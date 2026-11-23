/* LaTeX Anywhere v1.10.3 — scoped hide/minimize preferences. */
'use strict';
const GLOBAL_HIDDEN='latex-anywhere-visibility-v2:global-hidden';
const DOMAIN_HIDDEN='latex-anywhere-visibility-v2:domain-hidden:';
const GLOBAL_MINIMIZED='latex-anywhere-minimize-v1:global';
const DOMAIN_MINIMIZED='latex-anywhere-minimize-v1:domain:';
const fields={
  tabHidden:document.getElementById('tabHidden'),
  domainHidden:document.getElementById('domainHidden'),
  globalHidden:document.getElementById('globalHidden'),
  tabMinimized:document.getElementById('tabMinimized'),
  domainMinimized:document.getElementById('domainMinimized'),
  globalMinimized:document.getElementById('globalMinimized')
};
const status=document.getElementById('status');
const domainName=document.getElementById('domainName');
let activeTabId=null,domain=null,origin=null,ready=false;
const key=field=>field==='globalHidden'?GLOBAL_HIDDEN:field==='domainHidden'?DOMAIN_HIDDEN+domain:
  field==='globalMinimized'?GLOBAL_MINIMIZED:DOMAIN_MINIMIZED+domain;
async function tabScope(type,patch){
  if(activeTabId===null) return null;
  return chrome.runtime.sendMessage({type,tabId:activeTabId,patch});
}
async function refresh(){
  const readKeys=[GLOBAL_HIDDEN,GLOBAL_MINIMIZED];
  if(domain){readKeys.push(DOMAIN_HIDDEN+domain,DOMAIN_MINIMIZED+domain);}
  if(origin) readKeys.push('latex-anywhere-enabled-v1:'+origin);
  const [values,scope]=await Promise.all([
    chrome.storage.local.get(readKeys),tabScope('latex-anywhere:get-tab-scope').catch(()=>null)
  ]);
  const state={
    globalHidden:values[GLOBAL_HIDDEN]===true,
    domainHidden:domain?(typeof values[DOMAIN_HIDDEN+domain]==='boolean'
      ? values[DOMAIN_HIDDEN+domain] : values['latex-anywhere-enabled-v1:'+origin]===false):false,
    tabHidden:scope?.hidden===true,
    globalMinimized:values[GLOBAL_MINIMIZED]===true,
    domainMinimized:domain && values[DOMAIN_MINIMIZED+domain]===true,
    tabMinimized:scope?.minimized===true
  };
  for(const [field,input] of Object.entries(fields)){
    input.checked=state[field]===true;
    input.disabled=(field.startsWith('tab')&&!Number.isInteger(activeTabId))||
      (field.startsWith('domain')&&!domain);
  }
  const hidden=state.globalHidden?'em todos os sites':state.domainHidden?'neste domínio':
    state.tabHidden?'nesta aba':null;
  const minimized=state.globalMinimized?'em todos os sites':state.domainMinimized?'neste domínio':
    state.tabMinimized?'nesta aba':null;
  status.textContent=hidden?'Oculta '+hidden:minimized?'Minimizada '+minimized:'Extensão ativa';
  ready=true;
}
async function init(){
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(Number.isInteger(tab?.id)){
      activeTabId=tab.id;
      const state=await chrome.tabs.sendMessage(activeTabId,{type:'latex-anywhere:get-state'},{frameId:0});
      if(state?.domain){domain=state.domain;domainName.textContent=domain==='local-files'?'Arquivos locais':domain;}
    }
  }catch{/* Restricted page still permits global and per-tab controls. */}
  if(!domain)domainName.textContent='Indisponível nesta página';
  await refresh();
}
for(const [field,input] of Object.entries(fields)){
  input.addEventListener('change',async()=>{
    if(!ready)return;
    const checked=input.checked;
    input.disabled=true;
    try{
      if(field.startsWith('tab')){
        await tabScope('latex-anywhere:set-tab-scope',{
          [field==='tabHidden'?'hidden':'minimized']:checked
        });
      }else if(!field.startsWith('domain')||domain){
        await chrome.storage.local.set({[key(field)]:checked});
      }
      await refresh();
    }catch{status.textContent='Falha ao salvar a preferência.';input.disabled=false;}
  });
}
chrome.storage.onChanged.addListener((changes,area)=>{
  if(ready&&(area==='local'||area==='session'))void refresh();
});
void init();