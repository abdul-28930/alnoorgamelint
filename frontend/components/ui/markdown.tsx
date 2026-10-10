'use client'

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Styled to match the site. Raw HTML in the text is never rendered (react-markdown escapes it) and images are dropped.
const components: Components = {
  h1: (p) => <h2 className="mb-3 mt-6 text-2xl font-bold text-cp-yellow first:mt-0" {...strip(p)} />,
  h2: (p) => <h2 className="mb-3 mt-6 text-2xl font-bold text-cp-yellow first:mt-0" {...strip(p)} />,
  h3: (p) => <h3 className="mb-2 mt-5 text-xl font-semibold text-cp-cyan first:mt-0" {...strip(p)} />,
  h4: (p) => <h4 className="mb-2 mt-4 font-semibold text-white" {...strip(p)} />,
  p: (p) => <p className="mb-3 leading-relaxed" {...strip(p)} />,
  ul: (p) => <ul className="mb-3 list-disc space-y-1 pl-6" {...strip(p)} />,
  ol: (p) => <ol className="mb-3 list-decimal space-y-1 pl-6" {...strip(p)} />,
  li: (p) => <li {...strip(p)} />,
  strong: (p) => <strong className="font-semibold text-white" {...strip(p)} />,
  em: (p) => <em className="italic" {...strip(p)} />,
  blockquote: (p) => <blockquote className="mb-3 border-l-4 border-cp-cyan/60 pl-4 text-gray-400" {...strip(p)} />,
  hr: () => <hr className="my-5 border-gray-700" />,
  code: (p) => <code className="rounded bg-black/50 px-1.5 py-0.5 text-sm text-cp-yellow" {...strip(p)} />,
  pre: (p) => <pre className="mb-3 overflow-x-auto rounded bg-black/50 p-3 text-sm" {...strip(p)} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-cp-cyan underline hover:text-cp-yellow">{children}</a>
  ),
  table: (p) => <div className="mb-3 overflow-x-auto"><table className="w-full text-left text-sm" {...strip(p)} /></div>,
  th: (p) => <th className="border-b border-gray-600 px-3 py-2 font-semibold text-cp-cyan" {...strip(p)} />,
  td: (p) => <td className="border-b border-gray-800 px-3 py-2" {...strip(p)} />,
}

// react-markdown passes the parsed `node` to components; it must not reach the DOM element
function strip<T extends object>(props: T): Omit<T, 'node'> {
  const { node: _node, ...rest } = props as T & { node?: unknown } // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest as Omit<T, "node">
}

export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`text-gray-300 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={['img']} unwrapDisallowed>
        {children}
      </ReactMarkdown>
    </div>
  )
}
