# Schedule Daemon Alerting Setup

## Critical Alert: Daemon Heartbeat Monitor

**Location:** `backend/scripts/monitoring/checkScheduleDaemonHealth.ts`

This script checks if the schedule daemon is alive and healthy.

### Exit Codes
- `0` = Healthy (daemon heartbeat within last 5 minutes)
- `1` = Unhealthy (no daemon or stale heartbeat)

---

## Quick Setup Options

### Option 1: Simple Cron Job + Email (Fastest)

**On Linux/Mac:**
```bash
# Add to crontab (runs every 5 minutes)
*/5 * * * * cd /path/to/backend && pnpm tsx scripts/monitoring/checkScheduleDaemonHealth.ts || mail -s "CRITICAL: Schedule Daemon Down" ops@yourcompany.com < /dev/null
```

**On Windows (Task Scheduler):**
```powershell
# Create task that runs every 5 minutes:
$action = New-ScheduledTaskAction -Execute "pnpm" -Argument "tsx scripts/monitoring/checkScheduleDaemonHealth.ts" -WorkingDirectory "C:\wamp64\www\internet-dating.com\backend"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "ScheduleDaemonHealthCheck"
```

---

### Option 2: Prometheus + AlertManager

**1. Create metrics endpoint:**
```typescript
// backend/src/registry/domains/monitoring/index.ts
export async function getDaemonMetrics(req: Request, res: Response) {
  const daemon = await prisma.workerInstance.findFirst({
    where: { workerType: 'schedule_daemon', status: 'RUNNING' },
    orderBy: { lastHeartbeatAt: 'desc' }
  });

  const lastHeartbeatAge = daemon 
    ? Date.now() - daemon.lastHeartbeatAt.getTime()
    : 999_999_999;

  res.setHeader('Content-Type', 'text/plain');
  res.send(`
# HELP schedule_daemon_heartbeat_age_seconds Age of last heartbeat in seconds
# TYPE schedule_daemon_heartbeat_age_seconds gauge
schedule_daemon_heartbeat_age_seconds ${lastHeartbeatAge / 1000}

# HELP schedule_daemon_up Whether daemon is healthy (1 = healthy, 0 = down)
# TYPE schedule_daemon_up gauge
schedule_daemon_up ${lastHeartbeatAge < 300_000 ? 1 : 0}
  `.trim());
}
```

**2. Add to Prometheus config:**
```yaml
scrape_configs:
  - job_name: 'app_monitoring'
    scrape_interval: 30s
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/monitoring/daemon-metrics'
```

**3. Add alert rule:**
```yaml
# alertmanager.yml
groups:
  - name: schedule_daemon
    interval: 1m
    rules:
      - alert: ScheduleDaemonDown
        expr: schedule_daemon_up == 0
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "Schedule daemon is down"
          description: "No heartbeat for 3+ minutes. Automatic jobs will not run."
```

---

### Option 3: Datadog

```bash
# Install Datadog agent, then create check:
# /etc/datadog-agent/checks.d/schedule_daemon.py

from checks import AgentCheck
import subprocess

class ScheduleDaemonCheck(AgentCheck):
    def check(self, instance):
        try:
            result = subprocess.run(
                ['pnpm', 'tsx', 'scripts/monitoring/checkScheduleDaemonHealth.ts'],
                cwd='/path/to/backend',
                capture_output=True,
                timeout=10
            )
            
            if result.returncode == 0:
                self.gauge('schedule_daemon.up', 1)
                self.service_check('schedule_daemon.health', AgentCheck.OK)
            else:
                self.gauge('schedule_daemon.up', 0)
                self.service_check(
                    'schedule_daemon.health', 
                    AgentCheck.CRITICAL,
                    message=result.stderr.decode()
                )
        except Exception as e:
            self.gauge('schedule_daemon.up', 0)
            self.service_check('schedule_daemon.health', AgentCheck.CRITICAL, message=str(e))
```

---

### Option 4: AWS CloudWatch (if on EC2/ECS)

```bash
#!/bin/bash
# /etc/cron.d/schedule-daemon-check (runs every 5 minutes)
*/5 * * * * root cd /app/backend && pnpm tsx scripts/monitoring/checkScheduleDaemonHealth.ts && aws cloudwatch put-metric-data --metric-name ScheduleDaemonHealth --namespace InternetDating --value 1 || aws cloudwatch put-metric-data --metric-name ScheduleDaemonHealth --namespace InternetDating --value 0
```

**Create CloudWatch alarm:**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name schedule-daemon-down \
  --alarm-description "Schedule daemon heartbeat failed" \
  --metric-name ScheduleDaemonHealth \
  --namespace InternetDating \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:123456789:ops-alerts
```

---

### Option 5: Uptime Robot / Pingdom (External HTTP Check)

**1. Create health endpoint:**
```typescript
// backend/src/registry/domains/monitoring/index.ts
export async function getDaemonHealth(req: Request, res: Response) {
  const daemon = await prisma.workerInstance.findFirst({
    where: { workerType: 'schedule_daemon', status: 'RUNNING' },
    orderBy: { lastHeartbeatAt: 'desc' }
  });

  const lastHeartbeatAge = daemon 
    ? Date.now() - daemon.lastHeartbeatAt.getTime()
    : 999_999_999;

  if (lastHeartbeatAge > 5 * 60 * 1000) {
    return res.status(503).json({
      status: 'unhealthy',
      error: 'Schedule daemon heartbeat stale',
      lastHeartbeat: daemon?.lastHeartbeatAt,
      ageMinutes: Math.floor(lastHeartbeatAge / 60_000)
    });
  }

  res.json({
    status: 'healthy',
    lastHeartbeat: daemon?.lastHeartbeatAt,
    ageSeconds: Math.floor(lastHeartbeatAge / 1000)
  });
}
```

**2. Configure Uptime Robot:**
- URL: `https://yourdomain.com/monitoring/daemon-health`
- Method: GET
- Expected Status Code: 200
- Check Interval: 5 minutes
- Alert when down for: 2 checks (10 minutes)

---

## Recommended: Start with Option 1, Graduate to Option 2/4

- **Week 1:** Simple cron job + email (5 minutes to set up)
- **Week 2-4:** Add proper monitoring (Prometheus/DataDog) as you scale
- **Production:** Full observability stack with escalation

---

## Testing Your Alert

```bash
# 1. Stop the daemon
pm2 stop schedule-daemon

# 2. Wait 6 minutes

# 3. Run health check manually
cd backend
pnpm tsx scripts/monitoring/checkScheduleDaemonHealth.ts
# Should exit with code 1 and print error

# 4. Verify your alert fires

# 5. Restart daemon
pm2 start schedule-daemon
```

---

## What to Alert On (Priority Order)

| Alert | Threshold | Severity | Action |
|-------|-----------|----------|--------|
| **Daemon heartbeat stale** | 5 minutes | CRITICAL | Restart daemon immediately |
| Schedule enabled but nextRunAt NULL | Any | HIGH | Check logs, may need manual fix |
| Schedule failed 3+ times in a row | 3 failures | MEDIUM | Investigate job logs |
| Daemon restart frequency | >3/hour | MEDIUM | Check for crash loop |

---

## Next Steps After Setup

1. ✅ Set up heartbeat alert (this document)
2. Add dashboard to visualize:
   - Schedule run success rate
   - Daemon uptime
   - Job execution duration trends
3. Set up log aggregation (ELK, Datadog Logs, CloudWatch)
4. Create runbook for "daemon down" incident response
