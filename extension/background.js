/* LaTeX Anywhere v1.10.1 — persistent visibility and badge state. */
'use strict';

async function showState(tabId,state) {
  if (!Number.isInteger(tabId)) return;
  const globalHidden=state?.globalHidden===true;
  const domainHidden=state?.domainHidden===true;
  const text=globalHidden?'ALL':domainHidden?'OFF':'';
  const title=globalHidden?'LaTeX Anywhere: oculto em todos os sites — clique para configurar'
    :domainHidden?'LaTeX Anywhere: oculto neste domínio — clique para configurar'
    :'LaTeX Anywhere: ativo — clique para configurar a visibilidade';
  try {
    await chrome.action.setBadgeText({tabId,text});
    await chrome.action.setBadgeBackgroundColor({tabId,color:globalHidden?'#964248':'#5B6473'});
    await chrome.action.setTitle({tabId,title});
  } catch { /* Tab closed or restricted. */ }
}

async function toggleForTab(tabId) {
  if (!Number.isInteger(tabId)) return;
  try {
    const response=await chrome.tabs.sendMessage(tabId,
      {type:'latex-anywhere:toggle'},{frameId:0});
    if (typeof response?.enabled==='boolean') await showState(tabId,response);
  } catch { /* Restricted page; visibility can still be changed via the popup. */ }
}

// Clicking the extension action opens popup.html, including when globally off.
chrome.commands.onCommand.addListener((command,tab)=>{
  if (command!=='toggle-latex-anywhere') return;
  if (tab?.id!=null) {void toggleForTab(tab.id);return;}
  chrome.tabs.query({active:true,currentWindow:true}).then(tabs=>{
    void toggleForTab(tabs[0]?.id);
  }).catch(()=>{});
});
chrome.runtime.onMessage.addListener((message,sender)=>{
  if (message?.type==='latex-anywhere:state' && sender.frameId===0) {
    void showState(sender.tab?.id,message);
  }
});
