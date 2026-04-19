# Windows autostart (Task Scheduler)

## Server + worker as two actions

1. Open **Task Scheduler** → **Create Task…** (not Basic).

2. **General**: name e.g. `BridgeServer`, run only when user is logged on.

3. **Triggers** → New → **At log on** (your user).

4. **Actions** → New → **Start a program**  
   - Program: `cmd.exe`  
   - Arguments: `/c cd /d C:\path\to\chatgpt-worker-bridge && npm run start:server`  
   - Start in: `C:\path\to\chatgpt-worker-bridge`

5. Repeat for worker: name `BridgeWorker`, same trigger, arguments:  
   `/c cd /d C:\path\to\chatgpt-worker-bridge && npm run start:worker`

## PowerShell (register both)

Adjust `$root` to your clone path:

```powershell
$root = "C:\Users\User\hvac-saas\chatgpt-worker-bridge"
$serverAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$root`" && npm run start:server" -WorkingDirectory $root
$workerAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$root`" && npm run start:worker" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Register-ScheduledTask -TaskName "BridgeChatGPTServer" -Action $serverAction -Trigger $trigger -Settings $settings -Principal $principal -Force
Register-ScheduledTask -TaskName "BridgeChatGPTWorker" -Action $workerAction -Trigger $trigger -Settings $settings -Principal $principal -Force
```

## Remove

```powershell
Unregister-ScheduledTask -TaskName "BridgeChatGPTServer" -Confirm:$false
Unregister-ScheduledTask -TaskName "BridgeChatGPTWorker" -Confirm:$false
```

## NSSM (alternative)

Install NSSM, create service pointing to `node` with arguments `dist/main.js` and appropriate working directory for each app after `npm run build`.
