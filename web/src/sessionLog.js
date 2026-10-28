export function logFilename(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return `adventure-log-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`
}

export function downloadLog(source, extra) {
  const json = JSON.stringify(source.exportLog(extra), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = logFilename()
  link.hidden = true
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Some browsers start the download after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
