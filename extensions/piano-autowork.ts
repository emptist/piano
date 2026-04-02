import type { ExtensionAPI } from './shared.js';
import { runNezha } from './shared.js';

export default function pianoAutoWork(pi: ExtensionAPI): void {
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

  pi.on('session_start', async () => {
    console.log('[Piano] Auto-work mode ready. Type "piano-start" to begin!');
  });

  pi.registerCommand('piano-work', {
    description: 'Start Piano autonomous work mode',
    handler: async () => {
      pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: 'steer' });
      return 'Piano auto-work 已启动！运行 piano-tasks 开始。';
    },
  });

  pi.registerCommand('piano-start', {
    description: 'Start Piano continuous work cycle',
    handler: async () => {
      pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: 'steer' });
      return 'Piano 已启动自主工作模式！';
    },
  });

  console.log('[Piano] Auto-work extension loaded. Use "piano-start" to begin!');
}
