'use client'

import { useRef, useState } from 'react'
import { Markdown } from '@/components/ui/markdown'
import { RULES_TEMPLATE } from '@/lib/rules-template'

const TOOLS: { label: string; title: string; wrap?: [string, string]; line?: string }[] = [
  { label: 'B', title: 'Bold', wrap: ['**', '**'] },
  { label: 'I', title: 'Italic', wrap: ['_', '_'] },
  { label: 'H', title: 'Heading', line: '## ' },
  { label: '• List', title: 'Bullet list', line: '- ' },
  { label: '1. List', title: 'Numbered list', line: '1. ' },
]

/** Plain textarea with a few formatting buttons and a live preview, so staff can write rules without knowing Markdown. */
export function MarkdownEditor({ value, onChange, rows = 10, max = 10000 }: { value: string; onChange: (v: string) => void; rows?: number; max?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [tab, setTab] = useState<'write' | 'preview'>('write')

  const apply = (tool: (typeof TOOLS)[number]) => {
    const el = ref.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el
    let next: string
    let caret: number
    if (tool.wrap) {
      const [l, r] = tool.wrap
      next = value.slice(0, a) + l + (value.slice(a, b) || 'text') + r + value.slice(b)
      caret = a + l.length
    } else {
      const start = value.lastIndexOf('\n', a - 1) + 1
      next = value.slice(0, start) + tool.line + value.slice(start)
      caret = a + (tool.line?.length ?? 0)
    }
    onChange(next.slice(0, max))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret) })
  }

  const tabBtn = (t: 'write' | 'preview') => `px-3 py-1.5 text-sm capitalize ${tab === t ? 'border-b-2 border-cyan-400 text-cyan-400' : 'text-gray-400'}`

  return (
    <div className="rounded border border-gray-600 bg-gray-800">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-700 px-2">
        <button type="button" className={tabBtn('write')} onClick={() => setTab('write')}>write</button>
        <button type="button" className={tabBtn('preview')} onClick={() => setTab('preview')}>preview</button>
        {tab === 'write' && (
          <div className="ml-auto flex flex-wrap gap-1 py-1">
            {TOOLS.map((t) => (
              <button key={t.label} type="button" title={t.title} onClick={() => apply(t)} className="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600">{t.label}</button>
            ))}
            <button
              type="button"
              className="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
              onClick={() => { if (!value.trim() || confirm('Replace the current text with the template?')) onChange(RULES_TEMPLATE) }}
            >Insert template</button>
          </div>
        )}
      </div>
      {tab === 'write' ? (
        <textarea
          ref={ref}
          rows={rows}
          maxLength={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Write the rules. Markdown works: ## headings, **bold**, - lists, 1. numbered lists, | tables |"
          className="w-full bg-transparent px-3 py-2 font-mono text-sm text-white outline-none"
        />
      ) : (
        <div className="min-h-[8rem] bg-black/40 px-4 py-3">
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-gray-500">Nothing to preview yet.</p>}
        </div>
      )}
      <div className="px-3 pb-1 text-right text-xs text-gray-500">{value.length}/{max}</div>
    </div>
  )
}
