import type { AICapability } from "nezha";

export const AI_CAPABILITY_LEVELS: Record<AICapability, number> = {
  pi: 1,
  internal: 2,
  opencode: 3,
  human: 4,
};

export function getCapabilityLevel(capability: AICapability): number {
  return AI_CAPABILITY_LEVELS[capability];
}

export function needsDelegation(
  complexity: number,
  selfCapability: AICapability,
): boolean {
  const selfLevel = AI_CAPABILITY_LEVELS[selfCapability];
  const requiredLevel = complexity >= 5 ? 3 : complexity >= 3 ? 2 : 1;
  return requiredLevel > selfLevel;
}

export function getDelegationTarget(selfCapability: AICapability): AICapability {
  const selfLevel = AI_CAPABILITY_LEVELS[selfCapability];
  if (selfLevel < 3) {
    return "opencode";
  }
  return "human";
}