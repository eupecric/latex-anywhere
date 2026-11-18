/* LaTeX Anywhere 1.9.7. Static, local command catalog. No remote data. */
(() => {
  'use strict';
  const entry = (symbol, command, label='') => ({symbol, command, label: label || command});
  const from = (items) => items.map(([symbol, command, label]) => entry(symbol, command, label));
  const greekLower = from([
    ['α','\\alpha'],['β','\\beta'],['γ','\\gamma'],['δ','\\delta'],['ε','\\epsilon'],
    ['ζ','\\zeta'],['η','\\eta'],['θ','\\theta'],['ι','\\iota'],['κ','\\kappa'],
    ['λ','\\lambda'],['μ','\\mu'],['ν','\\nu'],['ξ','\\xi'],['ο','\\omicron'],
    ['π','\\pi'],['ρ','\\rho'],['σ','\\sigma'],['τ','\\tau'],['υ','\\upsilon'],
    ['φ','\\phi'],['χ','\\chi'],['ψ','\\psi'],['ω','\\omega']
  ]);
  const greekUpper = from([
    ['Α','\\Alpha'],['Β','\\Beta'],['Γ','\\Gamma'],['Δ','\\Delta'],['Ε','\\Epsilon'],
    ['Ζ','\\Zeta'],['Η','\\Eta'],['Θ','\\Theta'],['Ι','\\Iota'],['Κ','\\Kappa'],
    ['Λ','\\Lambda'],['Μ','\\Mu'],['Ν','\\Nu'],['Ξ','\\Xi'],['Ο','\\Omicron'],
    ['Π','\\Pi'],['Ρ','\\Rho'],['Σ','\\Sigma'],['Τ','\\Tau'],['Υ','\\Upsilon'],
    ['Φ','\\Phi'],['Χ','\\Chi'],['Ψ','\\Psi'],['Ω','\\Omega']
  ]);
  const greekVariant = from([
    ['ϵ','\\varepsilon'],['ϑ','\\vartheta'],['ϖ','\\varpi'],
    ['ϱ','\\varrho'],['ς','\\varsigma'],['ϕ','\\varphi']
  ]);
  const template = (symbol, command, label='', options={}) =>
    ({symbol, command, template:true, label:label || command, ...options});
  const quick = [
    template('x²', String.raw`{{selection}}^{{{cursor}}}`, 'Expoente'),
    template('xₙ', String.raw`{{selection}}_{{{cursor}}}`, 'Índice inferior'),
    template('√', String.raw`\sqrt{{{selection}}{{cursor}}}`, 'Raiz quadrada'),
    template('ⁿ√', String.raw`\sqrt[{{cursor}}]{{{selection}}}`, 'Raiz n-ésima'),
    template('a/b', String.raw`\frac{{{selection}}{{cursor}}}{}`, 'Fração padrão (\frac)'),
    template('a⁄b', String.raw`\dfrac{{{selection}}{{cursor}}}{}`, 'Fração grande (\dfrac)'),
    template('( )', String.raw`\left({{selection}}{{cursor}}\right)`, 'Parênteses ajustáveis'),
    template('[ ]', String.raw`\left[{{selection}}{{cursor}}\right]`, 'Colchetes ajustáveis'),
    template('| |', String.raw`\left|{{selection}}{{cursor}}\right|`, 'Módulo / valor absoluto')
  ];

  // 2×2 AMS matrix skeletons. Use an outer display math mode when inserted
  // in plain text; inside an existing math mode leave delimiters unchanged.
  const matrixCode = (env) => String.raw`\begin{${env}}
{{selection}}{{cursor}} & a_{12} \\
a_{21} & a_{22}
\end{${env}}`;
  const arrayCode = (wrap='') => {
    const begin=String.raw`\begin{array}{cc}`;
    const end=String.raw`\end{array}`;
    const inside=String.raw`{{selection}}{{cursor}} & a_{12} \\
a_{21} & a_{22}`;
    if (wrap==='round') return String.raw`\left(\,${begin}
${inside}
${end}\,\right)`;
    if (wrap==='square') return String.raw`\left[\,${begin}
${inside}
${end}\,\right]`;
    return `${begin}\n${inside}\n${end}`;
  };
  const display = {display:true};
  const group = (id,title,sections) => ({id,title,sections});
  const groups = [
    group('greek','Gregas',[
      {title:'Minúsculas',items:greekLower}, {title:'Maiúsculas',items:greekUpper},
      {title:'Variantes',items:greekVariant}
    ]),
    group('structures','Estruturas',[
      {title:'Potências e raízes',items:[
        ...quick.slice(0,4),
        template('∛',String.raw`\sqrt[3]{{{selection}}{{cursor}}}`,'Raiz cúbica')
      ]},
      {title:'Frações — escolha do estilo',items:[
        template('a/b',String.raw`\frac{{{selection}}{{cursor}}}{}`,'Fração padrão (\frac); acompanha o math mode'),
        template('ᵃ⁄ᵇ',String.raw`\tfrac{{{selection}}{{cursor}}}{}`,'Fração pequena/inline (\tfrac)'),
        template('A/B',String.raw`\dfrac{{{selection}}{{cursor}}}{}`,'Fração grande/display (\dfrac)'),
        template('cont.',String.raw`\cfrac{{{selection}}{{cursor}}}{}`,'Fração contínua (\cfrac)'),
        template('½',String.raw`\sfrac{{{selection}}{{cursor}}}{}`,'Fração diagonal xfrac (\sfrac): aproximação visual'),
        template('a/b',String.raw`{{selection}}/{{cursor}}`,'Fração com barra normal (a/b)')
      ]},
      {title:'Delimitadores automáticos',items:quick.slice(6)},
      {title:'Tamanhos dos delimitadores',items:[
        template('big( )',String.raw`\bigl({{selection}}{{cursor}}\bigr)`),
        template('Big( )',String.raw`\Bigl({{selection}}{{cursor}}\Bigr)`),
        template('bigg( )',String.raw`\biggl({{selection}}{{cursor}}\biggr)`),
        template('Bigg( )',String.raw`\Biggl({{selection}}{{cursor}}\Biggr)`),
        template('big[ ]',String.raw`\bigl[{{selection}}{{cursor}}\bigr]`),
        template('Big[ ]',String.raw`\Bigl[{{selection}}{{cursor}}\Bigr]`),
        template('bigg[ ]',String.raw`\biggl[{{selection}}{{cursor}}\biggr]`),
        template('Bigg[ ]',String.raw`\Biggl[{{selection}}{{cursor}}\Biggr]`),
        template('big| |',String.raw`\bigl|{{selection}}{{cursor}}\bigr|`),
        template('Big| |',String.raw`\Bigl|{{selection}}{{cursor}}\Bigr|`),
        template('bigg| |',String.raw`\biggl|{{selection}}{{cursor}}\biggr|`),
        template('Bigg| |',String.raw`\Biggl|{{selection}}{{cursor}}\Biggr|`)
      ]},
      {title:'Congruência modular',items:[
        template('mod',String.raw`{{selection}}\pmod{{{cursor}}}`,'Módulo com parênteses'),
        template('≡ mod',String.raw`{{selection}}\equiv {{cursor}}\pmod{}`,'Congruência módulo n')
      ]}
    ]),
    group('sets','Conjuntos',[
      {title:'Pertinência e inclusão',items:from([
        ['∈','\\in'],['∋','\\ni'],['∖','\\setminus'],
        ['⊂','\\subset'],['⊃','\\supset'],['⊆','\\subseteq'],['⊇','\\supseteq'],
        ['⊊','\\subsetneq'],['⊋','\\supsetneq'],['⊈','\\nsubseteq'],['⊉','\\nsupseteq']
      ])},
      {title:'Operações entre conjuntos',items:from([
        ['∪','\\cup'],['∩','\\cap'],['⋃','\\bigcup'],['⋂','\\bigcap'],
        ['⊔','\\sqcup'],['⊓','\\sqcap'],['⨆','\\bigsqcup']
      ])}
    ]),
    group('relations','Relações',[
      {title:'Ordem e comparação',items:from([
        ['∞','\\infty'],['≤','\\leq'],['≥','\\geq'],['≠','\\neq'],
        ['≪','\\ll'],['≫','\\gg'],['≺','\\prec'],['≼','\\preceq'],
        ['≻','\\succ'],['≽','\\succeq'],['≮','\\nless'],['≯','\\ngtr'],
        ['≰','\\nleq'],['≱','\\ngeq']
      ])},
      {title:'Equivalências e geometria',items:from([
        ['∼','\\sim'],['≅','\\cong'],['≃','\\simeq'],['≈','\\approx'],
        ['≡','\\equiv'],['⊥','\\perp'],['∥','\\parallel'],['∝','\\propto'],
        ['∠','\\angle'],['∣','\\mid'],['∦','\\nparallel'],['∤','\\nmid'],
        ['≁','\\nsim'],['≇','\\ncong']
      ])}
    ]),
    group('logic','Lógica',[
      {title:'Quantificadores e implicação',items:from([
        ['∀','\\forall'],['∃','\\exists'],['∄','\\nexists'],
        ['⇒','\\implies'],['⇔','\\iff'],['∴','\\therefore'],['∵','\\because']
      ])},
      {title:'Conectivos',items:from([
        ['∧','\\wedge'],['∨','\\vee'],['⋀','\\bigwedge'],['⋁','\\bigvee']
      ])}
    ]),
    group('operators','Operadores',[
      {title:'Operações',items:from([
        ['±','\\pm'],['×','\\times'],['∗','\\ast'],['⊕','\\oplus'],
        ['⊖','\\ominus'],['⊘','\\oslash'],['⊙','\\odot'],['⊗','\\otimes'],
        ['⨁','\\bigoplus'],['⨂','\\bigotimes'],['⨀','\\bigodot'],
        ['◦','\\circ'],['◯','\\bigcirc']
      ])},
      {title:'Formas geométricas',items:from([
        ['△','\\triangle'],['◃','\\triangleleft'],['▹','\\triangleright'],
        ['□','\\square'],['△','\\bigtriangleup'],['▽','\\bigtriangledown']
      ])}
    ]),
    group('functions','Funções',[
      {title:'Trigonometria',items:from([
        ['sin','\\sin'],['cos','\\cos'],['tan','\\tan'],['cot','\\cot'],
        ['sec','\\sec'],['csc','\\csc'],['arcsin','\\arcsin'],
        ['arccos','\\arccos'],['arctan','\\arctan']
      ])},
      {title:'Hiperbólicas e exponenciais',items:from([
        ['sinh','\\sinh'],['cosh','\\cosh'],['tanh','\\tanh'],
        ['log','\\log'],['ln','\\ln'],['exp','\\exp']
      ])},
      {title:'Outras funções',items:from([
        ['max','\\max'],['min','\\min'],['inf','\\inf'],['sup','\\sup'],
        ['mod','\\bmod']
      ])}
    ]),

    group('matrices','Matrizes',[
      {title:'Matrizes 2×2 (ambientes AMS)',items:[
        template('M₂×₂',matrixCode('matrix'),'matrix: sem delimitadores', {...display,hint:'\\begin{matrix}'}),
        template('(M)',matrixCode('pmatrix'),'pmatrix: parênteses', {...display,hint:'\\begin{pmatrix}'}),
        template('[M]',matrixCode('bmatrix'),'bmatrix: colchetes', {...display,hint:'\\begin{bmatrix}'}),
        template('{M}',matrixCode('Bmatrix'),'Bmatrix: chaves', {...display,hint:'\\begin{Bmatrix}'}),
        template('|M|',matrixCode('vmatrix'),'vmatrix: determinante, barras simples', {...display,hint:'\\begin{vmatrix}'}),
        template('‖M‖',matrixCode('Vmatrix'),'Vmatrix: barras duplas', {...display,hint:'\\begin{Vmatrix}'})
      ]},
      {title:'Array e delimitadores manuais',items:[
        template('array',arrayCode(),'array com colunas cc, sem delimitadores',{...display,hint:'\\begin{array}{cc}'}),
        template('(array)',arrayCode('round'),'array com parênteses ajustáveis',{...display,hint:'\\left( \\begin{array}'}),
        template('[array]',arrayCode('square'),'array com colchetes ajustáveis',{...display,hint:'\\left[ \\begin{array}'})
      ]}
    ]),
    group('integrals','Integrais',[
      {title:'Símbolos de integração',items:[
        template('∫',String.raw`\int {{selection}}{{cursor}}`,'Integral simples'),
        template('∮',String.raw`\oint {{selection}}{{cursor}}`,'Integral de contorno'),
        template('∬',String.raw`\iint {{selection}}{{cursor}}`,'Integral dupla'),
        template('∭',String.raw`\iiint {{selection}}{{cursor}}`,'Integral tripla')
      ]},
      {title:'Integral simples — limites e diferenciais',items:[
        template('∫ₐᵇ',String.raw`\int_{a}^{b} {{selection}}{{cursor}}\,\mathrm{d}x`,'Integral definida a até b',{...display,hint:'\\int_{a}^{b}'}),
        template('∫₀²',String.raw`\int_{0}^{2} {{selection}}{{cursor}}\,\mathrm{d}x`,'Integral definida de 0 até 2',{...display,hint:'\\int_{0}^{2}'}),
        template('∫ lim',String.raw`\int\limits_{a}^{b} {{selection}}{{cursor}}\,\mathrm{d}x`,'Integral com limites acima e abaixo',{...display,hint:'\\int\\limits'}),
        template('∫ f(x)',String.raw`\int {{selection}}{{cursor}}f(x)\,\mathrm{d}x`,'Integral indefinida com diferencial'),
        template('∫! f',String.raw`\int\! {{selection}}{{cursor}}f(x)\,\mathrm{d}x`,'Integral com espaço negativo após operador'),
        template('dx',String.raw`{{selection}}{{cursor}}\,\mathrm{d}x`,'Diferencial dx com espaço fino'),
        template('dy',String.raw`{{selection}}{{cursor}}\,\mathrm{d}y`,'Diferencial dy com espaço fino')
      ]},
      {title:'Integrais duplas e triplas',items:[
        template('∬D',String.raw`\iint_{D} {{selection}}{{cursor}}f(x,y)\,\mathrm{d}x\,\mathrm{d}y`,'Integral dupla na região D',{...display,hint:'\\iint_{D}'}),
        template('∬ lim',String.raw`\iint\limits_{D} {{selection}}{{cursor}}f(x,y)\,\mathrm{d}x\,\mathrm{d}y`,'Integral dupla com região abaixo',{...display,hint:'\\iint\\limits_D'}),
        template('∫∫',String.raw`\int_{a}^{b}\!\int_{c}^{d} {{selection}}{{cursor}}f(x,y)\,\mathrm{d}y\,\mathrm{d}x`,'Duas integrais sucessivas',{...display,hint:'\\int_a^b\\int_c^d'}),
        template('∫∫ lim',String.raw`\int\limits_{a}^{b}\!\int\limits_{c}^{d} {{selection}}{{cursor}}f(x,y)\,\mathrm{d}y\,\mathrm{d}x`,'Integrais sucessivas com limites',{...display,hint:'\\int\\limits'}),
        template('∭V',String.raw`\iiint_{V} {{selection}}{{cursor}}f(x,y,z)\,\mathrm{d}x\,\mathrm{d}y\,\mathrm{d}z`,'Integral tripla em V',{...display,hint:'\\iiint_{V}'})
      ]}
    ]),

    group('accents','Acentos',[
      {title:'Acentos sobre símbolos',items:[
        template('ā',String.raw`\bar{{{selection}}{{cursor}}}`,'Barra curta (\\bar)'),
        template('a⃗',String.raw`\vec{{{selection}}{{cursor}}}`,'Vetor (\\vec)'),
        template('â',String.raw`\hat{{{selection}}{{cursor}}}`,'Circunflexo (\\hat)'),
        template('ã',String.raw`\tilde{{{selection}}{{cursor}}}`,'Til (\\tilde)'),
        template('ȧ',String.raw`\dot{{{selection}}{{cursor}}}`,'Ponto (\\dot)'),
        template('ä',String.raw`\ddot{{{selection}}{{cursor}}}`,'Dois pontos (\\ddot)'),
        template('ǎ',String.raw`\check{{{selection}}{{cursor}}}`,'Háček (\\check)'),
        template('á',String.raw`\acute{{{selection}}{{cursor}}}`,'Acento agudo (\\acute)'),
        template('ă',String.raw`\breve{{{selection}}{{cursor}}}`,'Breve (\\breve)')
      ]},
      {title:'Marcações sobre ou sob expressões',items:[
        entry('⋯',String.raw`\cdots`,'Reticências centralizadas (\\cdots)'),
        entry('…',String.raw`\ldots`,'Reticências na linha de base (\\ldots)'),
        template('‾abc',String.raw`\overline{{{selection}}{{cursor}}}`,'Linha superior (\\overline)'),
        template('a̲b̲c̲',String.raw`\underline{{{selection}}{{cursor}}}`,'Linha inferior (\\underline)'),
        template('←abc',String.raw`\overleftarrow{{{selection}}{{cursor}}}`,'Seta superior à esquerda'),
        template('abc→',String.raw`\overrightarrow{{{selection}}{{cursor}}}`,'Seta superior à direita'),
        template('⌢abc',String.raw`\widetilde{{{selection}}{{cursor}}}`,'Til largo (\\widetilde)'),
        template('ˆabc',String.raw`\widehat{{{selection}}{{cursor}}}`,'Circunflexo largo (\\widehat)'),
        template('⏞abc',String.raw`\overbrace{{{selection}}{{cursor}}}`,'Chave superior (\\overbrace)'),
        template('⏟abc',String.raw`\underbrace{{{selection}}{{cursor}}}`,'Chave inferior (\\underbrace)')
      ]}
    ]),
    group('analysis','Análise',[
      {title:'Graus, valor absoluto e norma',items:[
        template('°',String.raw`{{selection}}{{cursor}}\degree`,'Ângulo em graus (\\degree)'),
        template('|x|',String.raw`\abs{{{selection}}{{cursor}}}`,'Módulo do pacote commath (\\abs)'),
        template('‖x‖',String.raw`\norm{{{selection}}{{cursor}}}`,'Norma do pacote commath (\\norm)'),
        template('‖x/y‖',String.raw`\norm{\frac{{{selection}}{{cursor}}}{\abs{y}}}`,'Norma de fração com módulo')
      ]},
      {title:'Somatórios e limites',items:[
        entry('∑',String.raw`\sum`,'Somatório (\\sum)'),
        template('Σₙ',String.raw`\sum_{n=1}^{3} {{selection}}{{cursor}}`,'Somatório n = 1 até 3',{...display,hint:'\\sum_{n=1}^{3}'}),
        template('Σ lim',String.raw`\sum\limits_{n=1}^{3} {{selection}}{{cursor}}`,'Somatório com limites forçados',{...display,hint:'\\sum\\limits'}),
        template('lim',String.raw`\lim_{n\to\infty} {{selection}}{{cursor}}`,'Limite n tendendo ao infinito'),
        template('lim↓',String.raw`\lim\limits_{n\to\infty} {{selection}}{{cursor}}`,'Limite com índice abaixo (\\limits)')
      ]},
      {title:'Coeficientes binomiais',items:[
        template('(n/r)',String.raw`\binom{{{selection}}{{cursor}}}{r}`,'Coeficiente binomial (\\binom)',{...display,hint:'\\binom{n}{r}'}),
        template('ⁿCᵣ',String.raw`{}^{{{selection}}{{cursor}}}C_r`,'Combinações: nCr'),
        template('ⁿPᵣ',String.raw`{}^{{{selection}}{{cursor}}}P_r`,'Arranjos: nPr')
      ]}
    ]),
    group('derivatives','Derivadas',[
      {title:'Derivadas ordinárias',items:[
        template('dy/dx',String.raw`\frac{\mathrm{d}{{selection}}{{cursor}}}{\mathrm{d}x}`,'Derivada ordinária de primeira ordem',{...display,hint:'\\frac{dy}{dx}'}),
        template('d²y/dx²',String.raw`\frac{\mathrm{d}^{2}{{selection}}{{cursor}}}{\mathrm{d}x^{2}}`,'Derivada ordinária de segunda ordem',{...display,hint:'\\frac{d^2y}{dx^2}'})
      ]},
      {title:'Derivadas parciais',items:[
        entry('∂',String.raw`\partial`,'Símbolo de derivada parcial'),
        template('∂z/∂x',String.raw`\frac{\partial {{selection}}{{cursor}}}{\partial x}`,'Primeira derivada parcial',{...display,hint:'\\frac{\\partial z}{\\partial x}'}),
        template('∂²z/∂x²',String.raw`\frac{\partial^{2} {{selection}}{{cursor}}}{\partial x^{2}}`,'Segunda derivada parcial',{...display,hint:'\\frac{\\partial^2 z}{\\partial x^2}'}),
        template('∂²z/∂x∂y',String.raw`\frac{\partial^{2} {{selection}}{{cursor}}}{\partial x\,\partial y}`,'Derivada parcial mista',{...display,hint:'\\frac{\\partial^2 z}{\\partial x\\partial y}'})
      ]}
    ]),
    group('negations','Negações AMS',[
      {title:'Negações prontas',items:from([
        ['≮','\\nless'],['≯','\\ngtr'],['≰','\\nleq'],['≱','\\ngeq'],
        ['⊈','\\nsubseteq'],['⊉','\\nsupseteq'],['∤','\\nmid'],
        ['∦','\\nparallel'],['≁','\\nsim'],['≇','\\ncong']
      ])},
      {title:'Com centernot (aproximação visual no KaTeX)',items:from([
        ['⇏','\\centernot\\implies'],['⇎','\\centernot\\iff'],
        ['∤','\\centernot\\mid'],['⊥̸','\\centernot\\perp'],
        ['≢','\\centernot\\equiv'],['∦','\\centernot\\parallel'],
        ['≁','\\centernot\\sim'],['≇','\\centernot\\cong']
      ])}
    ])
  ];
  const api = {groups,quick};
  globalThis.LatexAnywhereCatalog=api;
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
})();
