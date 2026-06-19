/* @flow */
import type {
  OpaqueConfig,
  ChainOpaqueConfig,
  ChainOptions,
  ChainCancelOptions,
} from './Types';

export default function chain(
  steps: Array<OpaqueConfig>,
  options?: ChainOptions,
): ChainOpaqueConfig {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('chain() requires a non-empty array of spring configs');
  }

  const firstStep = steps[0];
  let cancelled = false;
  let cancellingGraceful = false;
  const onCancel = options && options.onCancel;

  const triggerOnCancel = () => {
    if (typeof onCancel === 'function') {
      try {
        onCancel();
      } catch (e) {
        // swallow errors from user callback to avoid breaking animation loop
      }
    }
  };

  const cancel = (cancelOptions?: ChainCancelOptions): void => {
    const graceful = cancelOptions && cancelOptions.graceful;

    if (cancelled) {
      return;
    }

    if (graceful) {
      if (!cancellingGraceful) {
        cancellingGraceful = true;
      }
      return;
    }

    cancelled = true;
    cancellingGraceful = false;
    triggerOnCancel();
  };

  const signal = options && options.signal;
  if (signal) {
    if (signal.aborted) {
      cancelled = true;
      triggerOnCancel();
    } else if (typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', () => cancel());
    }
  }

  // internal helper: resolve graceful cancellation when current step finishes
  // Motion will call this via __resolveGracefulCancel when the step arrives
  const resolveGracefulCancel = (): void => {
    if (cancellingGraceful && !cancelled) {
      cancelled = true;
      cancellingGraceful = false;
      triggerOnCancel();
    }
  };

  const config: ChainOpaqueConfig = {
    __chain: true,
    __currentStep: 0,
    __cancelled: false,
    __cancellingGraceful: false,
    __steps: steps,
    __getCancelled: () => cancelled,
    __getCancellingGraceful: () => cancellingGraceful,
    __resolveGracefulCancel: resolveGracefulCancel,
    cancel,
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

  Object.defineProperty(config, '__cancellingGraceful', {
    get() {
      return cancellingGraceful;
    },
  });

  return config;
}
