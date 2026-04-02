import { describe, it, expect } from 'vitest';
import { TaskRouter } from '../router/TaskRouter.js';

describe('TaskRouter', () => {
  it('should route high priority to opencode', () => {
    const router = new TaskRouter({ useOpenCode: true, usePi: true });
    const result = router.route('simple task', 'desc', 50);
    expect(result).toBe('opencode');
  });

  it('should route simple reminder to pi when enabled', () => {
    const router = new TaskRouter({ useOpenCode: true, usePi: true });
    const result = router.route('check logs', 'remind me to check');
    expect(result).toBe('pi');
  });

  it('should route planning tasks to pi when enabled', () => {
    const router = new TaskRouter({ useOpenCode: true, usePi: true });
    const result = router.route('plan the project', 'arrange tasks');
    expect(result).toBe('pi');
  });

  it('should route to opencode by default when enabled', () => {
    const router = new TaskRouter({ useOpenCode: true, usePi: false });
    const result = router.route('implement feature', 'complex task');
    expect(result).toBe('opencode');
  });

  it('should route to internal when all disabled', () => {
    const router = new TaskRouter({ useOpenCode: false, usePi: false });
    const result = router.route('any task');
    expect(result).toBe('internal');
  });

  it('should route simple tasks to pi when opencode disabled', () => {
    const router = new TaskRouter({ useOpenCode: false, usePi: true });
    const result = router.route('remind me something');
    expect(result).toBe('pi');
  });

  describe('delegation', () => {
    it('should not delegate when complexity is low', () => {
      const router = new TaskRouter({ useOpenCode: true, usePi: true, selfCapability: 'pi' });
      expect(router.shouldDelegate(20)).toBe(false);
    });

    it('should delegate when complexity exceeds capability', () => {
      const router = new TaskRouter({ useOpenCode: true, usePi: true, selfCapability: 'pi' });
      expect(router.shouldDelegate(80)).toBe(true);
    });

    it('should return opencode as delegation target for pi', () => {
      const router = new TaskRouter({ useOpenCode: true, usePi: true, selfCapability: 'pi' });
      expect(router.getDelegationTarget()).toBe('opencode');
    });

    it('should delegate to specified capability', () => {
      const router = new TaskRouter({ useOpenCode: true, usePi: true, selfCapability: 'pi' });
      const result = router.route('any task', undefined, 0, 'opencode');
      expect(result).toBe('opencode');
    });
  });
});
