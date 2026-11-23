/* LaTeX Anywhere: Markdown editing commands (source-only, no HTML). Apache-2.0. */
(function (root) {
  'use strict';
  const tools = [
    {id:'h1',label:'H1',title:'Título principal'},
    {id:'h2',label:'H2',title:'Subtítulo'},
    {id:'h3',label:'H3',title:'Título de nível 3'},
    {id:'bold',label:'B',title:'Negrito Markdown (**texto**)'},
    {id:'italic',label:'I',title:'Itálico Markdown (*texto*)'},
    {id:'strike',label:'S',title:'Riscado Markdown (~~texto~~)'},
    {id:'code',label:'</>',title:'Código inline Markdown'},
    {id:'link',label:'🔗',title:'Link Markdown'},
    {id:'bullet',label:'• Lista',title:'Lista com marcadores'},
    {id:'number',label:'1. Lista',title:'Lista numerada'},
    {id:'task',label:'☐',title:'Lista de tarefas'},
    {id:'quote',label:'❝',title:'Citação'},
    {id:'fence',label:'```',title:'Bloco de código Markdown'},
    {id:'table',label:'▦',title:'Tabela Markdown 2×2'},
    {id:'rule',label:'―',title:'Linha horizontal Markdown'}
  ];
  function clamp(x, size) {
    return Number.isFinite(x) ? Math.max(0,Math.min(size,Math.trunc(x))) : 0;
  }
  function apply(source,start,end,action) {
    source=String(source);
    start=clamp(start,source.length);end=clamp(end,source.length);
    if(start>end)[start,end]=[end,start];
    const selected=source.slice(start,end);
    function replacement(from,to,text,selFrom=text.length,selTo=selFrom) {
      return {text:source.slice(0,from)+text+source.slice(to),
        start:from+selFrom,end:from+selTo};
    }
    const pairs={bold:['**','**','texto'],italic:['*','*','texto'],strike:['~~','~~','texto'],code:['`','`','código']};
    if (pairs[action]) {
      const [open,close,placeholder]=pairs[action];
      // Toggle on the selected markup or on a selection enclosed by markup.
      if(selected && selected.startsWith(open) && selected.endsWith(close) &&
          selected.length>=open.length+close.length) {
        const inner=selected.slice(open.length,selected.length-close.length);
        return replacement(start,end,inner,0,inner.length);
      }
      if(selected && source.slice(start-open.length,start)===open &&
          source.slice(end,end+close.length)===close) {
        return replacement(start-open.length,end+close.length,selected,0,selected.length);
      }
      const inner=selected||placeholder;
      return replacement(start,end,open+inner+close,open.length,
        selected ? open.length+inner.length : open.length+inner.length);
    }
    if(action==='link') {
      const label=selected||'texto';
      const href='https://exemplo.com';
      const code=`[${label}](${href})`;
      const urlAt=label.length+3;
      return replacement(start,end,code,urlAt,urlAt+href.length);
    }
    if(action==='fence') {
      if(selected.startsWith('```\n')&&selected.endsWith('\n```')) {
        const inner=selected.slice(4,-4);
        return replacement(start,end,inner,0,inner.length);
      }
      const before=(start>0&&source[start-1]!=='\n')?'\n':'';
      const after=(end<source.length&&source[end]!=='\n')?'\n':'';
      const content=selected;
      const code=before+'```\n'+content+'\n```'+after;
      return replacement(start,end,code,before.length+4+content.length);
    }
    if(action==='table') {
      const text='| Coluna 1 | Coluna 2 |\n| --- | --- |\n| Valor 1 | Valor 2 |';
      const before=(start>0&&source[start-1]!=='\n')?'\n':'';
      const after=(end<source.length&&source[end]!=='\n')?'\n':'';
      return replacement(start,end,before+text+after,before.length+2,before.length+10);
    }
    if(action==='rule') {
      const before=(start>0&&source[start-1]!=='\n')?'\n':'';
      const after=(end<source.length&&source[end]!=='\n')?'\n':'';
      const text=before+'---'+after;
      return replacement(start,end,text,text.length);
    }
    // Line formatting affects every line touched by the selection, even when
    // a user selects only part of the first line. It never introduces HTML.
    const headings={h1:'# ',h2:'## ',h3:'### '};
    const lineActions=new Set(['h1','h2','h3','bullet','number','quote','task']);
    if (!lineActions.has(action)) return null;
    const a=start===0?0:source.lastIndexOf('\n',start-1)+1;
    const terminator=source.indexOf('\n',Math.max(a,end===start?end:end-1));
    const b=terminator<0?source.length:terminator;
    const lines=source.slice(a,b).split('\n');
    function strip(line){
      if(headings[action])return line.replace(/^\s{0,3}#{1,6}\s+/,'');
      if(action==='bullet')return line.replace(/^\s*[-*+]\s+/,'');
      if(action==='number')return line.replace(/^\s*\d+[.)]\s+/,'');
      if(action==='quote')return line.replace(/^\s*>\s?/,'');
      return line.replace(/^\s*-\s*\[[ xX]\]\s*/,'');
    }
    const isSet=line=>{
      if(headings[action])return line.startsWith(headings[action]);
      if(action==='bullet')return /^\s*[-*+]\s+/.test(line);
      if(action==='number')return /^\s*\d+[.)]\s+/.test(line);
      if(action==='quote')return /^\s*>\s?/.test(line);
      return /^\s*-\s*\[[ xX]\]\s*/.test(line);
    };
    const remove=lines.every(isSet);
    const rendered=lines.map((line,i)=>{
      const bare=strip(line);
      if(remove)return bare;
      if(headings[action])return headings[action]+bare;
      if(action==='bullet')return '- '+bare;
      if(action==='number')return (i+1)+'. '+bare;
      if(action==='quote')return '> '+bare;
      return '- [ ] '+bare;
    });
    const out=rendered.join('\n');
    if(start===end&&lines.length===1){
      // Keep the caret at the same content character after applying a prefix.
      const oldLine=lines[0],newLine=rendered[0];
      const delta=newLine.length-oldLine.length;
      const offset=clamp(start-a+delta,newLine.length);
      return replacement(a,b,out,offset);
    }
    return replacement(a,b,out,0,out.length);
  }
  const exported={tools,apply};
  root.LatexAnywhereMarkdownShortcuts=exported;
  if(typeof module!=='undefined'&&module.exports) module.exports=exported;
})(typeof globalThis!=='undefined'?globalThis:this);
