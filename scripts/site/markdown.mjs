import MarkdownIt from 'markdown-it';
export function renderGuide(markdown,{resolveLink}){
 const md=new MarkdownIt({html:false,linkify:false,typographer:false}).disable('image');
 const headings=[],counts=new Map(),tokens=md.parse(markdown,{});
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i];if(token.type!=='heading_open')continue;
  const inline=tokens[i+1],text=(inline.children??[]).filter(x=>['text','code_inline'].includes(x.type)).map(x=>x.content).join('');
  const seed=text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N} _-]/gu,'').trim().replace(/\s+/g,'-')||'section';
  const n=(counts.get(seed)??0)+1;counts.set(seed,n);const id=seed+(n>1?'-'+n:'');token.attrSet('id',id);headings.push({id,text,level:Number(token.tag.slice(1))});
 }
 const link=md.renderer.rules.link_open??((tokens,index,options,env,self)=>self.renderToken(tokens,index,options));
 md.renderer.rules.link_open=(tokens,index,options,env,self)=>{tokens[index].attrSet('href',resolveLink(tokens[index].attrGet('href')));return link(tokens,index,options,env,self);};
 return{html:md.renderer.render(tokens,md.options,{}),headings};
}
