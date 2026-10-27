import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/lesson/markdown.js'

describe('lesson markdown', () => {
  it('renders headings, paragraphs, lists and inline styles', () => {
    const markdown = '# Build it\n\nUse **bold**, *care*, and `look`.\n\n- One\n- Two'
    expect(renderMarkdown(markdown)).toBe([
      '<h1>Build it</h1>',
      '<p>Use <strong>bold</strong>, <em>care</em>, and <code>look</code>.</p>',
      '<ul><li>One</li><li>Two</li></ul>',
    ].join('\n'))
  })

  it('links only to web and hash URLs', () => {
    expect(renderMarkdown('[Web](https://example.com) [Level](#next) [No](javascript:alert(1))'))
      .toContain('<a href="https://example.com">Web</a> <a href="#next">Level</a> [No](javascript:alert(1))')
  })

  it('escapes HTML before rendering', () => {
    const rendered = renderMarkdown('<script>alert("no")</script>')
    expect(rendered).toContain('&lt;script&gt;')
    expect(rendered).not.toContain('<script>')
  })
})
