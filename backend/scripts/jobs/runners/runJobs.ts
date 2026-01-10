import { fileURLToPath } from 'node:url';
import { prisma } from '../../../src/lib/prisma/client.js';
import { loadEnv } from '../../../src/lib/jobs/shared/utils.js';
import { getJob, getAllJobs, printUsage } from '../../../src/lib/jobs/shared/registry.js';

loadEnv();

async function main() {
  const command = process.argv[2];
  
  if (!command) {
    await printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === 'all') {
    const jobs = await getAllJobs();
    const jobNames = Object.keys(jobs).filter(name => name !== 'all');
    
    for (const jobName of jobNames) {
      const job = jobs[jobName];
      if (job) {
        console.log(`Running job: ${jobName}`);
        await job.run();
      }
    }
    console.log('All jobs completed.');
    return;
  }

  const job = await getJob(command);
  
  if (!job) {
    console.error(`Unknown job: ${command}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  await job.run();
  console.log(`Job "${command}" completed.`);
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch((err) => {
      console.error('Job failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
