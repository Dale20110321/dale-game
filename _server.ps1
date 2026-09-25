$port = 8111
$root = "C:\1"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.AbsolutePath.TrimStart('/')
  if ($path -eq '') { $path = 'index.html' }
  $full = Join-Path $root ($path -replace '/', [IO.Path]::DirectorySeparatorChar)
  try {
    $bytes = [IO.File]::ReadAllBytes($full)
    $ctx.Response.ContentType = 'text/html'
    $ctx.Response.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate')
    $ctx.Response.Headers.Add('Pragma', 'no-cache')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    $ctx.Response.StatusCode = 404
    $msg = [Text.Encoding]::UTF8.GetBytes('404')
    $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
  }
  $ctx.Response.Close()
}