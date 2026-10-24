import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import {pages} from '../src/documents.mjs';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(site, 'dist');
const contentDir = path.join(site, 'content');
const figureDir = path.join(site, 'src/figures');

const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
await fs.mkdir(contentDir, {recursive:true});
await fs.mkdir(figureDir, {recursive:true});
await fs.rm(dist, {recursive:true, force:true});
await fs.mkdir(path.join(dist,'assets/figures'), {recursive:true});
await fs.mkdir(path.join(dist,'downloads'), {recursive:true});
await fs.writeFile(path.join(dist,'.nojekyll'),'');

const mathCounts = {block:0, inline:0};
const md = new MarkdownIt({html:false, linkify:false, typographer:false});
md.inline.ruler.before('escape','inline_math',(state,silent) => {
  const slash=state.src.startsWith('\\(',state.pos);
  const quoted=state.src.startsWith('$`',state.pos);
  const dollar=state.src[state.pos]==='$'&&state.src[state.pos+1]!=='$';
  if(!slash&&!dollar)return false;
  const width=slash||quoted?2:1, close=slash?'\\)':quoted?'`$':'$';
  let end=state.src.indexOf(close,state.pos+width);
  while(end>=0&&state.src[end-1]==='\\'&&dollar)end=state.src.indexOf(close,end+1);
  if (end < 0) return false;
  if (!silent) { const token = state.push('inline_math','math',0); token.content = state.src.slice(state.pos+width,end); }
  state.pos = end+width;
  return true;
});
md.block.ruler.before('fence','block_math',(state,startLine,endLine,silent) => {
  const first = state.src.slice(state.bMarks[startLine]+state.tShift[startLine],state.eMarks[startLine]).trim();
  const opener = first.startsWith('\\[') ? '\\[' : first.startsWith('$$') ? '$$' : null;
  if (!opener) return false;
  const closer = opener === '$$' ? '$$' : '\\]';
  let pieces = [], line = startLine;
  let current = first.slice(opener.length), found = false;
  for (; line < endLine; line++) {
    if (line !== startLine) current = state.src.slice(state.bMarks[line]+state.tShift[line],state.eMarks[line]);
    const at = current.indexOf(closer);
    if (at >= 0) { pieces.push(current.slice(0,at)); found=true; break; }
    pieces.push(current);
  }
  if (!found) return false;
  if (silent) return true;
  const token = state.push('block_math','math',0); token.block=true; token.content=pieces.join('\n').trim(); token.map=[startLine,line+1];
  state.line=line+1;
  return true;
},{alt:['paragraph','reference','blockquote','list']});
const renderMath = (tex, displayMode) => katex.renderToString(`\\mathsf{${tex}}`,{displayMode,throwOnError:true,output:'htmlAndMathml',trust:false,strict: code => code === 'unicodeTextInMathMode' ? 'ignore' : 'error'});
md.renderer.rules.inline_math = (tokens,i) => { mathCounts.inline++; return renderMath(tokens[i].content,false); };
md.renderer.rules.block_math = (tokens,i) => { mathCounts.block++; return `<div class="math-block">${renderMath(tokens[i].content,true)}</div>\n`; };
md.renderer.rules.link_open = () => '';
md.renderer.rules.link_close = () => '';
md.renderer.rules.table_open = () => '<div class="table-scroll"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';
md.renderer.rules.image = (tokens,i) => {
  const token=tokens[i], src=token.attrGet('src').replace(/^\.\.\/src\/figures\//,'assets/figures/'), alt=token.content;
  return `<a class="figure-zoom" href="${esc(src)}" data-zoom><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"><span class="figure-label"><span>${esc(alt)}</span><span>Enlarge figure ↗</span></span></a>`;
};
function renderProcedure(text) {
  const root={indent:-1,children:[]}, stack=[root];
  for (const original of text.split('\n')) {
    if (!original.trim()) continue;
    const line=original.replace(/\t/g,'    '), indent=line.length-line.trimStart().length;
    while (stack.length>1 && stack.at(-1).indent>=indent) stack.pop();
    const node={indent,text:line.trim(),children:[]}; stack.at(-1).children.push(node); stack.push(node);
  }
  function list(nodes,depth=0) { return `<${depth ? 'ul':'ol'}>${nodes.map(node=>`<li${/:$/.test(node.text)?' class="phase"':''}><span>${esc(node.text)}</span>${node.children.length?list(node.children,depth+1):''}</li>`).join('')}</${depth?'ul':'ol'}>`; }
  return `<div class="procedure" aria-label="Procedure">${list(root.children)}</div>\n`;
}
md.renderer.rules.fence = (tokens,i) => {
  const token=tokens[i];
  if(token.info.trim()==='math'){mathCounts.block++;return `<div class="math-block">${renderMath(token.content.trim(),true)}</div>\n`;}
  if(token.info.trim()==='pseudocode')return `<pre class="pseudocode" aria-label="Algorithm"><code>${esc(token.content.trimEnd())}</code></pre>\n`;
  if (/→|─|└|│/.test(token.content) && /MOSFET|Supply|supply|heater|ground/.test(token.content) && !/pseudocode/.test(token.info)) return `<pre class="wiring">${esc(token.content)}</pre>\n`;
  return renderProcedure(token.content);
};
md.renderer.rules.code_block = (tokens,i) => renderProcedure(tokens[i].content);
function renderDocument(source) {
  const title = source.match(/^#\s+(.+)$/m)?.[1] || 'Technical notes';
  const body = source.replace(/^#\s+.+\n?/m,'');
  const tokens = md.parse(body,{}), headings=[], used = new Map();
  for(let i=0;i<tokens.length;i++) {
    if(tokens[i].type !== 'heading_open') continue;
    const label=tokens[i+1].children?.map(t=>t.content).join('') || tokens[i+1].content;
    let base=label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-') || 'section';
    const n=(used.get(base)||0)+1; used.set(base,n); const id=n===1?base:`${base}-${n}`;
    tokens[i].attrSet('id',id);
    if(['h2','h3'].includes(tokens[i].tag)) headings.push({id,label,level:tokens[i].tag});
  }
  return {title,html:md.renderer.render(tokens,md.options,{}),headings};
}
function navigation(active) {
  return `<nav class="site-nav" id="document-navigation" aria-label="Documents"><p class="nav-label">Documents</p><a href="index.html"${active==='home'?' aria-current="page"':''}>Overview</a>${pages.filter(p=>!p.unreviewed).map(p=>`<a href="${p.id}.html"${active===p.id?' aria-current="page"':''}>${esc(p.label)}</a>`).join('')}<div class="nav-divider"></div><a href="downloads/all-documents.md" download>Download notes ↓</a><div class="unreviewed-nav">${pages.filter(p=>p.unreviewed).map(p=>`<a href="${p.id}.html"${active===p.id?' aria-current="page"':''}>* ${esc(p.label)}</a>`).join('')}<p>Not yet reviewed by Yon Visell</p></div></nav>`;
}
function pageTemplate(page, data, body, home=false) {
  const sequence=pages.filter(p=>!p.unreviewed), idx=sequence.findIndex(p=>p.id===page.id), prev=sequence[idx-1], next=idx>=0?sequence[idx+1]:null;
  const toc=data.headings?.length?`<aside class="toc" aria-label="On this page"><p class="toc-label">On this page</p>${data.headings.map(h=>`<a href="#${h.id}"${h.level==='h3'?' class="toc-sub"':''}>${esc(h.label)}</a>`).join('')}</aside>`:'<aside></aside>';
  const tools=home?'':`<div class="doc-tools"><a href="downloads/${page.id}.md" download>Download Markdown ↓</a><button class="text-button" type="button" data-print>Print / save PDF</button></div>`;
  const footer=home?'':`<nav class="page-footer" aria-label="Adjacent documents"><div>${prev?`<span>Previous</span><a href="${prev.id}.html">← ${esc(prev.label)}</a>`:'<span>Documentation</span><a href="index.html">← Overview</a>'}</div><div class="next">${next?`<span>Next</span><a href="${next.id}.html">${esc(next.label)} →</a>`:''}</div></nav>`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${esc(page.description)}"><title>${home?"TPP control":esc(page.label)+" · TPP control"}</title><link rel="stylesheet" href="assets/katex/katex.min.css"><link rel="stylesheet" href="assets/site.css"><script src="assets/site.js" defer></script></head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-top"><a class="brand" href="index.html">TPP control<small>Circuits · Measurement · Control</small></a><span class="top-note">Circuits and control</span><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="document-navigation">Contents</button></header><div class="layout">${navigation(page.id)}<main class="document" id="main"><header class="doc-header"><p class="eyebrow">${esc(page.section || 'Technical notes')}</p><h1>${esc(data.title)}</h1>${tools}</header>${body}${footer}</main>${toc}</div><footer class="site-footer"><span>TPP control</span><span>Circuits, calibration and local temperature control</span></footer><dialog class="image-dialog" aria-label="Enlarged figure"><div class="dialog-top"><span data-dialog-title>Figure</span><a href="#" data-original target="_blank" rel="noopener">Open original ↗</a><button class="dialog-close" type="button">Close</button></div><div class="dialog-image-wrap"><img alt="Enlarged figure"></div></dialog></body></html>\n`;
}
const latexDir=path.join(contentDir,'latex');
const latexDownloads=[];
if(await exists(latexDir)) {
  for(const name of await fs.readdir(latexDir)) {
    if(!/\.(tex|zip)$/.test(name)) continue;
    await fs.copyFile(path.join(latexDir,name),path.join(dist,'downloads',name));
    latexDownloads.push(name);
  }
  if(await exists(path.join(latexDir,'images')))await fs.cp(path.join(latexDir,'images'),path.join(dist,'downloads/images'),{recursive:true});
}

const manifest=[];
let allDocuments='# TPP control\n\n';
for(const page of pages) {
  const cached=path.join(contentDir,`${page.id}.md`);
  if(!await exists(cached)) throw new Error(`Missing repository content: content/${page.id}.md. Run the explicit sync command first.`);
  const source=await fs.readFile(cached,'utf8');
  const data=renderDocument(source);
  await fs.writeFile(path.join(dist,`${page.id}.html`),pageTemplate(page,data,`<article class="article">${data.html}</article>`));
  const download=source.replace(/\]\(\.\.\/src\/figures\//g,'](../assets/figures/');
  await fs.writeFile(path.join(dist,'downloads',`${page.id}.md`),download);
  allDocuments += `\n---\n\n${download}`;
  manifest.push({id:page.id,title:data.title,sourceFile:path.basename(page.source),sha256:createHash('sha256').update(source).digest('hex'),sections:data.headings.length});
}
await fs.writeFile(path.join(dist,'downloads/all-documents.md'),allDocuments);
const home={id:'home',section:'Thermopneumatic pixels',description:'Temperature control, circuits and calibration for thermopneumatic pixels.'};
const homeBody=`<p class="lead">Temperature control for foil and wire tactile pixels.</p><p class="overview-text">The model uses measured electrical power to predict heating and cooling. Resistance measurements correct the temperature estimate. The controller ends each pulse at the chosen temperature or duration.</p><ol class="doc-list">${pages.filter(p=>!p.unreviewed).map((p,i)=>`<li><span class="number">0${i+1}</span><div><h2><a href="${p.id}.html">${esc(p.label)}</a></h2><p>${esc(p.description)}</p></div></li>`).join('')}</ol>${latexDownloads.length ? '<p class="home-note">Controller source: '+latexDownloads.map(name=>`<a href="downloads/${esc(name)}" download>${name.endsWith(".zip")?"LaTeX project ZIP ↓":"TeX source ↓"}</a>`).join(' · ')+'</p>' : ''}<div class="unreviewed-note">${pages.filter(p=>p.unreviewed).map(p=>`<p><a href="${p.id}.html">* ${esc(p.label)}</a> — ${esc(p.description)}</p>`).join('')}<p>Not yet reviewed by Yon Visell.</p></div>`;
await fs.writeFile(path.join(dist,'index.html'),pageTemplate(home,{title:'TPP control',headings:[]},homeBody,true));
for(const name of await fs.readdir(figureDir)) if(/\.(png|jpe?g|svg|webp)$/i.test(name)) await fs.copyFile(path.join(figureDir,name),path.join(dist,'assets/figures',name));
for(const name of ['site.css','site.js']) await fs.copyFile(path.join(site,'src',name),path.join(dist,'assets',name));
const katexRoot=path.join(site,'node_modules/katex');
await fs.mkdir(path.join(dist,'assets/katex'),{recursive:true});
await fs.copyFile(path.join(katexRoot,'dist/katex.min.css'),path.join(dist,'assets/katex/katex.min.css'));
await fs.cp(path.join(katexRoot,'dist/fonts'),path.join(dist,'assets/katex/fonts'),{recursive:true});
await fs.copyFile(path.join(katexRoot,'LICENSE'),path.join(dist,'assets/katex/LICENSE.txt'));
await fs.writeFile(path.join(dist,'build-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),documents:manifest,math:mathCounts},null,2)+'\n');
console.log(`Built ${pages.length+1} pages; ${mathCounts.block} display equations, ${mathCounts.inline} inline expressions.`);
console.log('Output: dist/');
