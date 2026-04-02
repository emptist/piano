#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const POLL_INTERVAL = 10000;
const MAX_TASKS_PER_CYCLE = 3;

async function run(command) {
  try {
    const { stdout } = await execAsync(command, { timeout: 30000 });
    return stdout;
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

async function checkTasks() {
  console.log('\n📋 [CHECK] Looking for pending tasks...');
  const output = await run('node /opt/homebrew/bin/nezha tasks');
  const lines = output.split('\n').filter(l => l.includes('PENDING'));
  const match = lines[0]?.match(/PENDING\s+(\d+)/);
  const count = match ? parseInt(match[1]) : 0;
  console.log(`   Found ${count} pending tasks`);
  return count;
}

async function collaborate() {
  console.log('\n🤝 [COLLABORATE] Broadcasting to other AIs...');
  const msg = `Piano checking in - ${new Date().toISOString().slice(11,19)}`;
  await run(`node /opt/homebrew/bin/nezha share "${msg}"`);
}

async function execute() {
  console.log('\n⚡ [EXECUTE] Executing continuous improvement cycle...');
  const output = await run('node /opt/homebrew/bin/nezha improve');
  console.log('   ', output.trim().split('\n').slice(0,3).join(' '));
}

async function reflect() {
  console.log('\n🔄 [REFLECT] Saving cycle learning...');
  const cycle = `Piano continuous cycle at ${new Date().toISOString().slice(0,16)}`;
  await run(`node /opt/homebrew/bin/nezha learn "${cycle}" --importance 5`);
}

async function cycle() {
  console.log('\n' + '='.repeat(50));
  console.log('🎹 PIANO CONTINUOUS WORK CYCLE');
  console.log('='.repeat(50));

  const pending = await checkTasks();
  if (pending > 0) {
    await execute();
  }
  
  await collaborate();
  await reflect();
  
  console.log('\n✅ Cycle complete, sleeping...');
}

async function main() {
  console.log('🎹 Piano Continuous Work Engine Starting...');
  let count = 0;
  while (true) {
    try {
      await cycle();
      count++;
      console.log(`\n📊 Total cycles: ${count}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main();