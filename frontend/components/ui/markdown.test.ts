// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from './markdown'

const html = (md: string) => renderToStaticMarkup(createElement(Markdown, null, md))

describe('Markdown', () => {
  it('renders headings, bold, lists and tables', () => {
    const out = html('## Format\n\n**Best of 3**\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    expect(out).toContain('<h2')
    expect(out).toContain('<strong')
    expect(out).toContain('<li>one</li>')
    expect(out).toContain('<table')
  })
  it('never renders raw HTML, scripts, images or javascript: links', () => {
    const out = html('<script>alert(1)</script><img src=x onerror=alert(1)>\n\n![pic](http://x/y.png)\n\n[click](javascript:alert(1))')
    expect(out).not.toMatch(/<script|<img|href="javascript/i) // the text is shown escaped, never as markup
  })
  it('opens links safely in a new tab', () => {
    const out = html('[site](https://example.com)')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer nofollow"')
  })
})
