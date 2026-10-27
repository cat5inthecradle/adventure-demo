function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderInline(value) {
  const tokens = []
  let marker = '\u0000markdown-token-'
  while (value.includes(marker)) marker += '-'
  const hold = html => {
    const token = `${marker}${tokens.length}\u0000`
    tokens.push(html)
    return token
  }

  let rendered = value.replace(/`([^`]+)`/g, (_, code) =>
    hold(`<code>${code}</code>`)
  )
  rendered = rendered.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|#[^\s)]*)\)/g,
    (_, label, url) => hold(`<a href="${url}">${label}</a>`)
  )
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  rendered = rendered.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  return rendered.replace(new RegExp(`${marker}(\\d+)\\u0000`, 'g'),
    (_, index) => tokens[Number(index)])
}

export function renderMarkdown(text) {
  if (!text) return ''
  const lines = escapeHtml(String(text)).replaceAll('\r\n', '\n').split('\n')
  const output = []
  let paragraph = []
  let list = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    output.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!list.length) return
    output.push(`<ul>${list.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`)
    list = []
  }

  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    const bullet = /^-\s+(.+)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      const depth = heading[1].length
      output.push(`<h${depth}>${renderInline(heading[2])}</h${depth}>`)
    } else if (bullet) {
      flushParagraph()
      list.push(bullet[1])
    } else if (!line.trim()) {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line.trim())
    }
  }
  flushParagraph()
  flushList()
  return output.join('\n')
}
