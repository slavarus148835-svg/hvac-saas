$ErrorActionPreference = "Stop"
$scriptDir = Convert-Path $PSScriptRoot
$bridgeCmd = Join-Path $scriptDir "start-bridge.cmd"
$agentCmd = Join-Path $scriptDir "start-agent.cmd"
$telegramCmd = Join-Path $scriptDir "start-telegram.cmd"

if (-not (Test-Path $bridgeCmd)) { throw "start-bridge.cmd not found" }
if (-not (Test-Path $agentCmd)) { throw "start-agent.cmd not found" }
if (-not (Test-Path $telegramCmd)) { throw "start-telegram.cmd not found" }

$bridgeTaskName = "ProjectChatGPTBridge"
$agentTaskName = "ProjectCursorAgent"
$telegramTaskName = "ProjectTelegramBot"

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

function Remove-Task([string]$Name) {
    try {
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction Stop | Out-Null
        Write-Host "Removed old task '$Name'"
    } catch {
        # task absent - ignore
    }
}

function Register-Task([string]$Name, [string]$CmdPath, [string]$Description) {
    $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$CmdPath`"" -WorkingDirectory $scriptDir
    Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $Description -Force | Out-Null
    Write-Host "OK: task '$Name' created"
}

Remove-Task $bridgeTaskName
Remove-Task $agentTaskName
Remove-Task $telegramTaskName

Register-Task -Name $bridgeTaskName -CmdPath $bridgeCmd -Description "Local ChatGPT bridge API"
Register-Task -Name $agentTaskName -CmdPath $agentCmd -Description "Local Cursor-compatible agent worker"
Register-Task -Name $telegramTaskName -CmdPath $telegramCmd -Description "Telegram ingress and result notifier bot"

Write-Host "Autostart tasks are ready."
