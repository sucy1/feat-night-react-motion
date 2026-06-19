/* @flow */
import type { OpaqueConfig, ChainOpaqueConfig } from './Types';

export default function chain(steps: Array<OpaqueConfig>): ChainOpaqueConfig {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('chain() requires a non-empty array of spring configs');
  }

  const firstStep = steps[0];

  return {
    __chain: true,
    __currentStep: 0,
    __steps: steps,
    val: firstStep.val,
    stiffness: firstStep.stiffness,
    damping: firstStep.damping,
    precision: firstStep.precision,
  };
}
