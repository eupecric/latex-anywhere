/* LaTeX Anywhere: local, DOM-only Markdown renderer (Marked 4.0.19, MIT).
 * User HTML is always text, never injected. No external resources are loaded.
 */
(() => {
  'use strict';
  const markedApi = globalThis.marked;
  if (!markedApi?.lexer) return;
  const parserOptions = { gfm:true, breaks:false, headerIds:false, mangle:false, smartypants:false };
  const renderableInline = new Set(['strong','em','del','codespan','link','image','br']);
  const renderableBlock = new Set(['heading','list','blockquote','code','table','hr']);
  const el = (tag, parent, content) => {
    const node = document.createElement(tag);
    if (typeof content === 'string') node.textContent = content;
    if (parent) parent.appendChild(node);
    return node;
  };
  function safeUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return ['https:','http:','mailto:'].includes(parsed.protocol) ? parsed.href : null;
    } catch { return null; }
  }
  function inlineTokens(source) {
    try { return markedApi.Lexer.lexInline(source, parserOptions); }
    catch { return [{type:'text',raw:source,text:source}]; }
  }
  function paintInline(parent, tokens) {
    for (const token of (tokens || [])) {
      switch (token.type) {
        case 'strong': paintInline(el('strong',parent),token.tokens || inlineTokens(token.text || '')); break;
        case 'em': paintInline(el('em',parent),token.tokens || inlineTokens(token.text || '')); break;
        case 'del': paintInline(el('del',parent),token.tokens || inlineTokens(token.text || '')); break;
        case 'codespan': el('code',parent,token.text || ''); break;
        case 'br': el('br',parent); break;
        case 'link': {
          const href = safeUrl(token.href || '');
          const link = href ? el('a',parent) : el('span',parent);
          if (href) { link.href=href; link.target='_blank'; link.rel='noopener noreferrer'; }
          paintInline(link,token.tokens || inlineTokens(token.text || ''));
          break;
        }
        case 'image': {
          // Do not make requests to user-supplied image URLs from a content script.
          el('span',parent,`[imagem: ${token.text || 'sem descrição'}]`);
          break;
        }
        case 'text': {
          if (token.tokens) paintInline(parent,token.tokens);
          else el('span',parent,token.text || token.raw || '');
          break;
        }
        case 'escape': el('span',parent,token.text || ''); break;
        case 'html': el('span',parent,token.raw || token.text || ''); break;
        default: el('span',parent,token.raw || token.text || '');
      }
    }
  }
  function paintBlock(parent, token) {
    switch(token.type) {
      case 'heading': paintInline(el(`h${Math.min(6,Math.max(1,token.depth || 1))}`,parent),token.tokens || inlineTokens(token.text || '')); break;
      case 'hr': el('hr',parent); break;
      case 'code': { const pre=el('pre',parent); el('code',pre,token.text || ''); break; }
      case 'blockquote': {
        const q=el('blockquote',parent);
        for (const t of token.tokens || []) paintBlock(q,t);
        break;
      }
      case 'list': {
        const list=el(token.ordered ? 'ol':'ul',parent);
        if (token.ordered && Number(token.start) > 1) list.start=Number(token.start);
        for (const item of token.items || []) {
          const li=el('li',list);
          if (item.task) { const check=el('input',li);check.type='checkbox';check.disabled=true;check.checked=!!item.checked; }
          const children=item.tokens || [];
          if (children.length) for (const child of children) paintBlock(li,child);
          else paintInline(li,inlineTokens(item.text || ''));
        }
        break;
      }
      case 'table': {
        const table=el('table',parent),head=el('thead',table),tr=el('tr',head);
        for (const c of token.header || []) paintInline(el('th',tr),inlineTokens(typeof c==='string'?c:c.text || ''));
        const body=el('tbody',table);
        for (const row of token.rows || []) {
          const r=el('tr',body);
          for (const c of row) paintInline(el('td',r),inlineTokens(typeof c==='string'?c:c.text || ''));
        }
        break;
      }
      case 'paragraph':
      case 'text': paintInline(el('p',parent),token.tokens || inlineTokens(token.text || '')); break;
      case 'space': break;
      case 'html': el('span',parent,token.raw || token.text || ''); break;
      default: el('span',parent,token.raw || token.text || '');
    }
  }
  function parts(source) {
    if (!source) return [];
    let tokens;
    try { tokens=markedApi.lexer(source,parserOptions); }
    catch { return [{kind:'text',raw:source}]; }
    const result=[];
    const addText = raw => { if (!raw) return; const last=result[result.length-1];
      if (last?.kind==='text') last.raw+=raw; else result.push({kind:'text',raw}); };
    let cursor=0;
    for (const block of tokens) {
      const raw=block.raw || '';
      if (source.slice(cursor,cursor+raw.length)!==raw) {
        // Never lose raw user content if a tokenizer normalizes line endings.
        return [{kind:'text',raw:source}];
      }
      cursor+=raw.length;
      if (renderableBlock.has(block.type)) result.push({kind:'markdown',block:true,raw,token:block});
      else if (block.type==='paragraph' || block.type==='text') {
        let innerOffset=0;
        for (const child of block.tokens || inlineTokens(raw)) {
          const part=child.raw || '';
          if (raw.slice(innerOffset,innerOffset+part.length)!==part) break;
          if (renderableInline.has(child.type)) result.push({kind:'markdown',block:false,raw:part,token:child});
          else addText(part);
          innerOffset+=part.length;
        }
        addText(raw.slice(innerOffset));
      } else addText(raw);
    }
    addText(source.slice(cursor));
    return result;
  }
  function codeRanges(source) {
    const ranges=[];
    try {
      let at=0;
      for (const block of markedApi.lexer(source,parserOptions)) {
        const raw=block.raw || '';
        if (block.type==='code') ranges.push([at,at+raw.length]);
        else if (block.type==='paragraph' || block.type==='heading' || block.type==='text') {
          let inner=0;
          for (const token of block.tokens || inlineTokens(raw)) {
            if (token.type==='codespan') ranges.push([at+inner,at+inner+(token.raw||'').length]);
            inner+=(token.raw||'').length;
          }
        }
        at+=raw.length;
      }
    } catch { /* The LaTeX lexer still handles malformed Markdown as source. */ }
    return ranges;
  }
  function paint(parent,piece) {
    if (piece.block) paintBlock(parent,piece.token);
    else paintInline(parent,[piece.token]);
  }
  const api={parts,paint,codeRanges};
  globalThis.LatexAnywhereMarkdown=api;
  if (typeof module!=='undefined' && module.exports) module.exports=api;
})();
