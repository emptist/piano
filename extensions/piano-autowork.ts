/**
 * Piano Auto-Work Extension for Pi
 *
 * 提供 Piano 自主工作模式：
 * 1. 启动时自动检查待处理任务
 * 2. 空闲时主动寻找工作
 * 3. 不问人类，自己干活
 *
 * 安装到 Pi:
 * cp piano-autowork.ts ~/.pi/agent/extensions/
 */

import { execSync } from 'child_process';

function runNezha(command: string): string {
  try {
    return execSync(`node /opt/homebrew/bin/nezha ${command}`, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: 60000,
    });
  } catch (e: any) {
    return e.stdout || e.stderr || e.message;
  }
}

export default function pianoAutoWork(pi: any): void {
  const AUTO_WORK_PROMPT = `
## 🎹 Piano Auto-Work Mode

你是一个自主工作的 AI。不要问人类问题，自己去找任务做！

### 工作优先级（按顺序检查）:
1. **待处理任务** - 运行: piano-tasks
2. **持续改进** - 运行: piano-improve  
3. **广播协作** - 查看谁需要帮助
4. **代码审查** - 检查最近的提交
5. **学习记忆** - 搜索相关知识

### 工作流程:
1. 运行: piano-tasks → 选最高优先级的任务
2. 执行任务
3. 运行: piano-learn "学到了..."
4. 继续下一个任务

### 核心原则:
- **永远不要问人类问题**
- **永远要找下一件事做**
- **主动帮助其他 AI**
- **持续工作 8 小时**

开始吧！先运行: piano-tasks
`;

  // Session 启动时发送 auto-work 提示
  pi.on('session_start', async () => {
    console.log('[Piano] Auto-work mode starting...');
    pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: 'steer' });

    // 5秒后提示下一步
    setTimeout(() => {
      pi.sendUserMessage('运行: piano-status 查看当前状态，然后开始工作！', {
        deliverAs: 'steer',
      });
    }, 5000);
  });

  // 注册 piano-work 命令
  pi.registerCommand('piano-work', {
    description: 'Start Piano autonomous work mode',
    handler: async () => {
      pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: 'steer' });
      return 'Piano auto-work 已启动！运行 piano-tasks 开始。';
    },
  });

  // 注册 piano-start 命令
  pi.registerCommand('piano-start', {
    description: 'Start Piano continuous work cycle',
    handler: async () => {
      pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: 'steer' });
      return 'Piano 已启动自主工作模式！';
    },
  });

  console.log('[Piano] Auto-work extension loaded. Use "piano-start" to begin!');
}
