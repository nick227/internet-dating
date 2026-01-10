/**
 * Health Check: Schedule Daemon Heartbeat Monitor
 * 
 * Usage:
 *   pnpm tsx scripts/monitoring/checkScheduleDaemonHealth.ts
 * 
 * Exit codes:
 *   0 = healthy
 *   1 = unhealthy (no heartbeat in 5 minutes)
 * 
 * Integrate with your alerting system:
 *   - Nagios/Zabbix
 *   - Prometheus + AlertManager
 *   - CloudWatch/DataDog
 *   - Simple cron job that sends email on exit 1
 */

import { prisma } from '../../src/lib/prisma/client.js';

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function checkHealth() {
  try {
    const daemon = await prisma.workerInstance.findFirst({
      where: {
        workerType: 'schedule_daemon',
        status: 'RUNNING'
      },
      orderBy: {
        lastHeartbeatAt: 'desc'
      }
    });

    if (!daemon) {
      console.error('❌ CRITICAL: No schedule daemon found running');
      console.error('Action: Start the daemon with `pnpm tsx scripts/scheduleDaemon.ts`');
      process.exit(1);
    }

    const lastHeartbeat = daemon.lastHeartbeatAt.getTime();
    const now = Date.now();
    const ageMs = now - lastHeartbeat;
    const ageMinutes = Math.floor(ageMs / 60_000);

    if (ageMs > HEARTBEAT_TIMEOUT_MS) {
      console.error(`❌ CRITICAL: Schedule daemon heartbeat stale`);
      console.error(`   Worker ID: ${daemon.id}`);
      console.error(`   Last heartbeat: ${daemon.lastHeartbeatAt.toISOString()}`);
      console.error(`   Age: ${ageMinutes} minutes (threshold: 5 minutes)`);
      console.error(`   Hostname: ${daemon.hostname}`);
      console.error(`   PID: ${daemon.pid}`);
      console.error('');
      console.error('Action: Restart the daemon immediately');
      process.exit(1);
    }

    console.log('✅ Schedule daemon healthy');
    console.log(`   Worker ID: ${daemon.id}`);
    console.log(`   Last heartbeat: ${daemon.lastHeartbeatAt.toISOString()}`);
    console.log(`   Age: ${ageMinutes} minutes`);
    console.log(`   Hostname: ${daemon.hostname}`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error checking daemon health:', error);
    process.exit(1);
  }
}

checkHealth();
