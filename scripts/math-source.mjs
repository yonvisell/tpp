// Protect TeX from Markdown parsing while preserving every equation payload.
export const compatibleTex = tex => tex.replace(/\\operatorname\{(low|high|interp)\}/g,'\\mathrm{$1}');
export function mathSource(source) {
  const output=[], expressions=[];
  let fence=null, block=null;
  const emitBlock=()=>expressions.push({display:true,tex:compatibleTex(block.lines.join('\n').trim())});
  for(const line of source.split('\n')) {
    if(block) {
      const closed=block.fenced ? /^\s*`{3,}\s*$/.test(line) : line.trim()===block.close;
      if(closed){emitBlock();output.push(block.indent+'```');block=null;}
      else {block.lines.push(line);output.push(compatibleTex(line));}
      continue;
    }
    const marker=line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if(fence){
      output.push(line);
      if(marker&&marker[2][0]===fence.char&&marker[2].length>=fence.length)fence=null;
      continue;
    }
    if(marker){
      if(marker[3].trim()==='math'&&marker[2][0]==='`'){
        block={fenced:true,indent:marker[1],lines:[]};output.push(marker[1]+'```math');
      }else {fence={char:marker[2][0],length:marker[2].length};output.push(line);}
      continue;
    }
    const display=line.match(/^(\s*)(\\\[|\$\$)\s*$/);
    if(display){block={fenced:false,indent:display[1],close:display[2]==='\\['?'\\]':'$$',lines:[]};output.push(display[1]+'```math');continue;}
    output.push(line.replace(/\\\((.*?)\\\)|\$`([^`]*?)`\$/g,(_whole,slash,quoted)=>{
      const tex=compatibleTex(slash??quoted);expressions.push({display:false,tex:tex.trim()});
      return '$`'+tex+'`$';
    }));
  }
  if(block)throw new Error('Unclosed display equation.');
  if(fence)throw new Error('Unclosed code fence.');
  return {text:output.join('\n'),expressions};
}
