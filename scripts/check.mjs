import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mathSource} from './math-source.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const content=path.resolve(root,'../content');
const errors=[];
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function walk(dir){let result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);result.push(...entry.isDirectory()?await walk(p):[p]);}return result;}
const files=await walk(root), pages=files.filter(p=>p.endsWith('.html'));
for(const file of files.filter(p=>/\.(html|css|js|md|svg|json)$/.test(p))){
 const s=await fs.readFile(file,'utf8');
 if(/\/Users\/|\/home\/|\.chatgpt-projects|mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s)) errors.push(`Private path/email: ${path.relative(root,file)}`);
 if(/\.pdf(?:["')\s]|$)/i.test(s)) errors.push(`Unexpected PDF reference: ${path.relative(root,file)}`);
}
for(const file of pages){
 const s=await fs.readFile(file,'utf8'), ids=[...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 if(new Set(ids).size!==ids.length)errors.push(`Duplicate id: ${path.basename(file)}`);
 if((s.match(/<h1>/g)||[]).length!==1)errors.push(`Heading count: ${path.basename(file)}`);
 if(/katex-error|undefined|NaN/.test(s))errors.push(`Rendering artifact: ${path.basename(file)}`);
 const article=s.match(/<article class="article">([\s\S]*?)<\/article>/)?.[1]||'';
 if(/<a(?![^>]*class="figure-zoom")\b[^>]*href=/.test(article))errors.push(`Inline body hyperlink: ${path.basename(file)}`);
 for(const m of s.matchAll(/\b(?:href|src)="([^"]+)"/g)){
  const target=m[1];if(target==='#'||!target)continue;
  if(/^(https?:|data:|mailto:|javascript:)/.test(target)){errors.push(`Nonlocal resource/link: ${path.basename(file)}: ${target}`);continue;}
  const [local,anchor]=target.split('#');
  if(!local){if(anchor&&!ids.includes(anchor))errors.push(`Missing anchor: ${path.basename(file)}#${anchor}`);continue;}
  const resolved=path.resolve(path.dirname(file),decodeURIComponent(local));
  try{await fs.access(resolved);}catch{errors.push(`Missing resource: ${path.basename(file)} → ${target}`);}
 }
}
for(const file of files.filter(p=>p.endsWith('.css'))){const s=await fs.readFile(file,'utf8');for(const m of s.matchAll(/url\(["']?([^"')]+)["']?\)/g)){if(m[1].startsWith('data:'))continue;try{await fs.access(path.resolve(path.dirname(file),m[1]));}catch{errors.push(`Missing CSS resource: ${m[1]}`);}}}
for(const name of await fs.readdir(content)){
 if(!name.endsWith('.md'))continue;
 const source=await fs.readFile(path.join(content,name),'utf8');
 const html=await fs.readFile(path.join(root,name.replace(/\.md$/,'.html')),'utf8');
 const normalizeIndent=text=>text.split('\n').map(line=>line.trimStart()).join('\n').trim();
 const expectedMath=mathSource(source).expressions.map(x=>normalizeIndent(x.tex));
 const decode=text=>text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[x]));
 const renderedMath=[...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>normalizeIndent(decode(m[1]).replace(/^\\mathsf\{([\s\S]*)\}$/,'$1')));
 if(JSON.stringify(expectedMath)!==JSON.stringify(renderedMath))errors.push(`Equation payload/order changed in HTML: ${name}`);
 let fence=null,procedure=false;
 for(const line of source.split('\n')){
  const marker=line.match(/^\s*(`{3,}|~{3,})(.*)$/);
  if(marker){
   if(!fence){fence={char:marker[1][0],length:marker[1].length};procedure=/pseudocode/.test(marker[2]);}
   else if(marker[1][0]===fence.char&&marker[1].length>=fence.length){fence=null;procedure=false;}
   continue;
  }
  if(fence){if(procedure&&line.trim()&&!html.includes(esc(line)))errors.push(`Pseudocode text changed: ${name}: ${line.trim()}`);continue;}
  if(/\\[\[\]()]|\$\$/.test(line))errors.push(`Unprotected GitHub math delimiter: ${name}`);
  if(/\$(?!`)|(?<!`)\$/.test(line.replace(/\$`[^`]*`\$/g,'')))errors.push(`Unprotected inline dollar: ${name}`);
 }
 for(const m of source.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)){
  if(!m[1].startsWith('../src/figures/'))errors.push(`Nonportable source image: ${name}: ${m[1]}`);
  try{await fs.access(path.resolve(content,m[1]));}catch{errors.push(`Missing source image: ${name}: ${m[1]}`);}
 }
}
for(const file of files.filter(p=>p.endsWith('.md'))){
 const source=await fs.readFile(file,'utf8');
 for(const m of source.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)){
  try{await fs.access(path.resolve(path.dirname(file),m[1]));}catch{errors.push(`Missing download image: ${path.basename(file)}: ${m[1]}`);}
 }
}
const total=(await Promise.all(files.map(p=>fs.stat(p)))).reduce((n,s)=>n+s.size,0);
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`PASS: ${pages.length} HTML pages, ${files.length} files, ${(total/1048576).toFixed(2)} MiB.`);
console.log('Local resources, equation output, literal pseudocode, portable Markdown/images, heading anchors and private-path checks passed.');
