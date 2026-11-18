/* LaTeX Anywhere formatting engine v1.9.5. Pure and self-contained.
 * No network requests, DOM access, or code evaluation. The host supplies
 * its existing, deterministic mathSegments parser.
 */
(() => {
  'use strict';
  const MARK = '\uE001';
  const sizeNames = new Set(['tiny','scriptsize','footnotesize','small','normalsize',
    'large','Large','LARGE','huge','Huge']);
  const allowed = new Set(['bold','italic','underline','strike','color','blackboard','calligraphic']);
  const isAllowed = format => allowed.has(format) ||
    (typeof format === 'string' && format.startsWith('size:') && sizeNames.has(format.slice(5)));
  const safeColor = color => /^#[0-9a-fA-F]{6}$/.test(String(color)) ? color : '#3158e5';
  const escapeText = value => String(value)
    .replace(/\\/g, '\\textbackslash{}').replace(/([{}%$&#_])/g, '\\$1');
  const likelyMath = text => /\\[a-zA-Z]+|[=+*/^_<>]|\d\s*[-+]\s*\d/.test(text) || /^[a-zA-Z]$/.test(text.trim());
  // Math alphabet commands work only on math atoms. Putting \text{...}
  // inside \mathbb or \mathcal cancels the font change. Preserve whitespace
  // between text words explicitly, rather than silently collapsing it.
  function styledAlphabet(value, command, inMath) {
    if (inMath) return `\\${command}{${value}}`;
    return String(value).match(/[A-Za-z0-9]+|\s+|[^A-Za-z0-9\s]+/g)?.map(token => {
      if (/^[A-Za-z0-9]+$/.test(token)) return `\\${command}{${token}}`;
      return `\\text{${escapeText(token)}}`;
    }).join('') || '';
  }
  function wrapper(value, format, color, inMath, forceText=false) {
    const useMath = inMath || (!forceText && likelyMath(value));
    const v = useMath ? value : `\\text{${escapeText(value)}}`;
    // TeX font-size declarations are scoped by an explicit group. KaTeX
    // understands the same size macros in inline and display math.
    if (format.startsWith('size:') && isAllowed(format)) {
      return `{\\${format.slice(5)} ${v}}`;
    }
    switch (format) {
      case 'bold': return useMath ? `\\mathbf{${v}}` : `\\text{\\textbf{${escapeText(value)}}}`;
      case 'italic': return useMath ? `\\mathit{${v}}` : `\\text{\\textit{${escapeText(value)}}}`;
      case 'underline': return `\\underline{${v}}`;
      case 'strike': return `\\cancel{${v}}`;
      case 'blackboard': return styledAlphabet(value, 'mathbb', inMath);
      case 'calligraphic': return styledAlphabet(value, 'mathcal', inMath);
      case 'color': return `\\textcolor{${safeColor(color)}}{${v}}`;
      default: throw new Error('Formato desconhecido');
    }
  }
  function outside(text, type, color, forceText=false) {
    // Don't consume actual paragraph breaks: create one inline math expression
    // per non-empty line, without converting the breaks into display math.
    return text.split(/(\r?\n)/g).map(s => !s || /^(\r?\n)$/.test(s) ? s : `\\(${wrapper(s,type,color,false,forceText)}\\)`).join('');
  }
  function runsOf(source, parts) {
    let offset = 0;
    return parts.map(p => {
      const len = p.kind === 'math' ? p.raw.length : p.value.length;
      const run = { ...p, start:offset, end:offset + len };
      if (p.kind === 'math') {
        run.bodyStart = run.start + p.openLength;
        run.bodyEnd = run.end - p.closeLength;
        run.open = p.raw.slice(0,p.openLength);
        run.close = p.raw.slice(p.raw.length - p.closeLength);
        run.body = p.raw.slice(p.openLength, p.raw.length - p.closeLength);
      }
      offset += len;
      return run;
    });
  }
  function analyze(source, start, end, parts) {
    const runs = runsOf(source,parts);
    const math = runs.filter(r => r.kind === 'math' && (start === end
      ? start >= r.bodyStart && start <= r.bodyEnd
      : start < r.end && end > r.start));
    const single = math.length === 1 && (
      (start >= math[0].bodyStart && end <= math[0].bodyEnd) ||
      (start === math[0].start && end === math[0].end));
    return {runs, math, single, needsDecision:math.length > 0 && !single,
      firstMode:math[0]?.environment ? `\\begin{${math[0].environment}}` : (math[0]?.open || null) };
  }
  // Replace a range and put the caret in the new content. The marker is
  // temporary and is never included in the user's document.
  function replace(source,start,end,replacement) {
    const i = replacement.indexOf(MARK);
    const clean = replacement.replaceAll(MARK,'');
    return { status:'ok', text:source.slice(0,start)+clean+source.slice(end),
      caret:start+(i < 0 ? clean.length : i) };
  }
  function inlineSingle(source,start,end,run,type,color) {
    const full = start === run.start && end === run.end;
    const s = full ? run.bodyStart : start;
    const e = full ? run.bodyEnd : end;
    if (s < run.bodyStart || e > run.bodyEnd) return null;
    const selected = source.slice(s,e);
    const styled = (run.environment && selected && /&|\\\\/.test(selected))
      ? lineSafeMath(selected,type,color) : wrapper(selected || MARK,type,color,true);
    return replace(source,s,e,styled);
  }
  function lineSafeMath(body, type, color) {
    // An align/gather environment has structural separators (& and \\).
    // Do not hide those separators inside a macro argument.
    const parts = body.split(/(\\\\|(?<!\\)&)/g);
    return parts.map(x => x === '\\\\' || x === '&' || !x ? x : wrapper(x,type,color,true)).join('');
  }
  function formatSeparate(source,start,end,runs,type,color) {
    let result = '', caret = 0;
    for (const run of runs) {
      if (start >= run.end || end <= run.start) {
        result += source.slice(run.start,run.end);
        continue;
      }
      const a = Math.max(start,run.start), b = Math.min(end,run.end);
      if (run.kind === 'text') {
        result += source.slice(run.start,a);
        result += outside(source.slice(a,b),type,color,true);
        caret = result.length;
        result += source.slice(b,run.end);
      } else {
        // Retain both original delimiters; only style text inside the body.
        const bodyA = Math.max(a,run.bodyStart), bodyB = Math.min(b,run.bodyEnd);
        result += run.open;
        result += source.slice(run.bodyStart,bodyA);
        if (bodyA < bodyB) result += wrapper(source.slice(bodyA,bodyB),type,color,true);
        caret = result.length;
        result += source.slice(bodyB,run.bodyEnd) + run.close;
      }
    }
    return {status:'ok', text:result, caret};
  }
  function formatExpand(source,start,end,analysis,type,color) {
    const {runs,math} = analysis;
    const first = math[0];
    // Don't split a delimiter: include its whole expression when a selection
    // reaches any portion of that expression.
    for (const run of math) {
      start = Math.min(start,run.start);
      end = Math.max(end,run.end);
    }
    let combined = '';
    for (const run of runs) {
      if (end <= run.start || start >= run.end) continue;
      if (run.kind === 'math') {
        combined += lineSafeMath(run.body,type,color);
      } else {
        const a=Math.max(start,run.start), b=Math.min(end,run.end);
        combined += source.slice(a,b).split(/(\r?\n)/g).map(t => !t || /^(\r?\n)$/.test(t)
          ? t : wrapper(t,type,color,false,true)).join('');
      }
    }
    return replace(source,start,end,first.open+combined+first.close);
  }
  function formatSource({source,start,end,format,color='#3158e5',strategy=null,parts}) {
    if (typeof source !== 'string' || !Array.isArray(parts) || !isAllowed(format))
      return {status:'error',message:'Seleção ou comando inválido'};
    start=Math.max(0,Math.min(source.length,start|0));
    end=Math.max(start,Math.min(source.length,end|0));
    const info=analyze(source,start,end,parts);
    if (info.single) return inlineSingle(source,start,end,info.math[0],format,color);
    if (info.needsDecision) {
      if (!strategy) return {status:'choose',firstMode:info.firstMode,mathCount:info.math.length};
      if (strategy==='expand') return formatExpand(source,start,end,info,format,color);
      if (strategy==='separate') return formatSeparate(source,start,end,info.runs,format,color);
      return {status:'error',message:'Estratégia inválida'};
    }
    return replace(source,start,end,outside(source.slice(start,end) || MARK,format,color));
  }
  const api={formatSource,analyze,wrapper,outside};
  globalThis.LatexAnywhereFormatting=api;
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
})();
