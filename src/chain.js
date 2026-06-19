/* @flow */
import type { OpaqueConfig, ChainOpaqueConfig, ChainOptions } from './Types';

export default function chain(
  steps: Array<OpaqueConfig>,
  options?: ChainOptions,
): ChainOpaqueConfig {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('chain() requires a non-empty array of spring configs');
  }

  const firstStep = steps[0];
  let cancelled = false;
  const onCancel = options && options.onCancel;

  const doCancel = () => {
    if (!cancelled) {
      cancelled = true;
      if (typeof onCancel === 'function') {
        try {
          onCancel();
        } catch (e) {
          // swallow errors from user callback to avoid breaking animation loop
        }
      }
    }
  };

  const signal = options && options.signal;
  if (signal) {
    if (signal.aborted) {
      doCancel();
    } else if (typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', doCancel);
    }
  }

  const config: ChainOpaqueConfig = {
    __chain: true,
    __currentStep: 0,
    __cancelled: false,
    __steps: steps,
    __getCancelled: () => cancelled,
    cancel: doCancel,
    val: firstStep.val,
    stiffness: firstStep.stiffness,
    damping: firstStep.damping,
    precision: firstStep.precision,
  };

  Object.defineProperty(config, '__cancelled', {
    get() {
      return cancelled;
    },
  });

  return config;
}
