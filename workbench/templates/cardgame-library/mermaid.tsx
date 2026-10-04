import {isValidElement, memo, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode} from 'react';

let renderQueue: Promise<unknown> = Promise.resolve();
let engine: Promise<typeof import('mermaid')['default']> | undefined;
function loadEngine() {
  return engine ??= import('mermaid').then(({default: mermaid}) => {
    mermaid.initialize({startOnLoad:false, securityLevel:'strict', suppressErrorRendering:true, theme:'neutral'});
    return mermaid;
  });
}

const MermaidDiagram = memo(function MermaidDiagram({source}: {source:string}) {
  const element = useRef<HTMLDivElement>(null);
  const id = 'diagram-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [visible, setVisible] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    observer.observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
    return () => observer.disconnect();
  }, []);
  const [result, setResult] = useState<{source:string; svg?:string; error?:string}>();
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {setVisible(true); observer.disconnect();}
    }, {rootMargin:'200px'});
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    const render = renderQueue.then(async () => {
      const mermaid = await loadEngine();
      mermaid.initialize({startOnLoad:false, securityLevel:'strict', suppressErrorRendering:true, theme:dark ? 'dark' : 'neutral'});
      return mermaid.render(id, source);
    });
    renderQueue = render.catch(() => undefined);
    void render.then(({svg}) => {
      if (!disposed) setResult({source, svg});
    }, error => {
      if (!disposed) setResult({source, error:error instanceof Error ? error.message : String(error)});
    });
    return () => {disposed = true;};
  }, [visible, source, id, dark]);
  const current = result?.source === source ? result : undefined;
  return <div ref={element} className="reader-diagram" style={{minHeight:80, margin:'16px 0'}}>
    {current?.svg ? <div role="img" aria-label="Mermaid 图表" style={{overflowX:'auto'}} dangerouslySetInnerHTML={{__html:current.svg}} />
      : current?.error ? <div><p role="status">图表暂时无法渲染，请检查 Mermaid 语法或继续加载完整代码块。</p><pre><code>{source}</code></pre><details><summary>错误详情</summary><pre>{current.error}</pre></details></div>
      : <p role="status" style={{color:'var(--wb-muted)',fontSize:12}}>正在准备图表…</p>}
    {current?.svg && <details style={{fontSize:12,color:'var(--wb-muted)'}}><summary style={{cursor:'pointer'}}>图表源码</summary><pre><code>{source}</code></pre></details>}
  </div>;
});

/** Override the block, not inline code; regular fenced code keeps its original DOM. */
export function MarkdownPre({children, node: _node, ...props}: ComponentProps<'pre'> & {node?:unknown}) {
  const child = isValidElement<{className?:string;children?:ReactNode}>(children) ? children : undefined;
  if (child?.props.className?.split(/\s+/).includes('language-mermaid')) {
    return <MermaidDiagram source={String(child.props.children ?? '').replace(/\n$/, '')} />;
  }
  return <pre {...props}>{children}</pre>;
}
