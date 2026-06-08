param(
  [string]$ListenAddress = "172.24.0.1",
  [int]$ListenPort = 9225,
  [string]$TargetHost = "127.0.0.1",
  [int]$TargetPort = 9222
)

$ErrorActionPreference = "Stop"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($ListenAddress), $ListenPort)
$listener.Start()
Write-Host "CDP relay listening on $ListenAddress`:$ListenPort -> $TargetHost`:$TargetPort"

while ($true) {
  $client = $listener.AcceptTcpClient()
  [void][System.Threading.ThreadPool]::QueueUserWorkItem(
    [System.Threading.WaitCallback]{
      param($state)
      $client = $state.Client
      $targetHost = $state.TargetHost
      $targetPort = $state.TargetPort
      $target = $null
      try {
        $target = [System.Net.Sockets.TcpClient]::new($targetHost, $targetPort)
        $clientStream = $client.GetStream()
        $targetStream = $target.GetStream()
        $toTarget = $clientStream.CopyToAsync($targetStream)
        $toClient = $targetStream.CopyToAsync($clientStream)
        [System.Threading.Tasks.Task]::WaitAny($toTarget, $toClient) | Out-Null
      } catch {
      } finally {
        try { $client.Close() } catch {}
        if ($target) {
          try { $target.Close() } catch {}
        }
      }
    },
    [pscustomobject]@{
      Client = $client
      TargetHost = $TargetHost
      TargetPort = $TargetPort
    }
  )
}
