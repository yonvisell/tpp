import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pages} from '../src/documents.mjs';
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=process.argv.indexOf('--source-root');
if(index<0||!process.argv[index+1]) throw new Error('Usage: node scripts/sync.mjs --source-root /path/to/document-workspace [--latex relative-file.tex]');
const sourceRoot=path.resolve(process.argv[index+1]);
const contentDir=path.join(site,'content');
const figureDir=path.join(site,'src/figures');
const exists=async file=>{try{await fs.access(file);return true;}catch{return false;}};
function githubMath(source) {
  let fence=null;
  return source.split('\n').map(line=>{
    const marker=line.match(/^\s*(`{3,}|~{3,})/);
    if(marker){
      if(!fence) fence={char:marker[1][0],length:marker[1].length};
      else if(marker[1][0]===fence.char&&marker[1].length>=fence.length) fence=null;
      return line;
    }
    if(fence)return line;
    return line.replace(/\\\[/g,()=> '$$').replace(/\\\]/g,()=> '$$').replace(/\\\(/g,()=> '$').replace(/\\\)/g,()=> '$');
  }).join('\n');
}
await fs.mkdir(contentDir,{recursive:true});
await fs.mkdir(figureDir,{recursive:true});
async function sanitize(raw, origin) {
  const images = [...raw.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  for (const match of images) {
    const target = match[2].replace(/^<|>$/g,'').split(' ')[0];
    const filename = path.basename(target);
    if (!/\.(png|jpe?g|svg|webp)$/i.test(filename)) throw new Error(`Unsupported image: ${filename}`);
    const source = path.isAbsolute(target) ? target : path.resolve(path.dirname(origin), target);
    const allowed = path.join(sourceRoot,'TactileTeleopMVPRev06/images');
    if (!path.resolve(source).startsWith(path.resolve(allowed) + path.sep)) throw new Error(`Image outside selected circuit assets: ${filename}`);
    await fs.copyFile(source, path.join(figureDir, filename));
    const companion = source.replace(/\.(png|jpe?g|webp)$/i,'.svg');
    if (companion !== source && await exists(companion)) await fs.copyFile(companion,path.join(figureDir,path.basename(companion)));
    raw = raw.replace(match[0], `![${match[1]}](../src/figures/${filename})`);
  }
  raw = raw.split('\n').filter(line => !/^\s*(?:\[[^\]]+\]\([^)]+\)\s*(?:[·|]\s*)?)+\s*$/.test(line)).join('\n');
  raw = raw.replace(/(?<!!)\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1');
  raw = raw.replace(/<https?:\/\/[^>]+>/g, '').replace(/https?:\/\/[^\s<>]+/g, '');
  if (/\/Users\/|\/home\/|\.chatgpt-projects|mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw)) throw new Error(`Private path or email remains in ${path.basename(origin)}`);
  return githubMath(raw).trim() + '\n';
}


for(const page of pages){
 const original=path.join(sourceRoot,page.source);
 const sanitized=await sanitize(await fs.readFile(original,'utf8'),original);
 await fs.writeFile(path.join(contentDir,`${page.id}.md`),sanitized);
}
const latexIndex=process.argv.indexOf('--latex');
if(latexIndex>=0){
 const relative=process.argv[latexIndex+1];
 if(!relative||path.isAbsolute(relative)||!relative.endsWith('.tex'))throw new Error('LaTeX input must be a selected relative .tex path inside the source root.');
 const source=path.resolve(sourceRoot,relative);
 if(!source.startsWith(sourceRoot+path.sep))throw new Error('LaTeX path must remain inside the source root.');
 const text=await fs.readFile(source,'utf8');
 if(/\/Users\/|\/home\/|\.chatgpt-projects|mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text))throw new Error('Private path or email in selected LaTeX source.');
 await fs.mkdir(path.join(contentDir,'latex'),{recursive:true});
 await fs.writeFile(path.join(contentDir,'latex',path.basename(source)),text);
}
console.log(`Synchronized ${pages.length} selected documents and their circuit figures into repository content.`);
