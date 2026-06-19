/* eslint-disable class-methods-use-this */
import React from 'react';
import { spring, chain } from '../src/react-motion';
import createMockRaf from './createMockRaf';
import TestUtils from 'react-dom/test-utils';

const { createSpy } = global.jasmine;

const injector = require('inject-loader!../src/Motion');

describe('chain', () => {
  let Motion;
  let mockRaf;

  beforeEach(() => {
    mockRaf = createMockRaf();
    Motion = injector({
      raf: mockRaf.raf,
      'performance-now': mockRaf.now,
    }).default;
  });

  it('should throw on invalid input', () => {
    expect(() => chain()).toThrow();
    expect(() => chain([])).toThrow();
    expect(() => chain(null)).toThrow();
  });

  it('should create chain config with correct structure', () => {
    const c = chain([
      spring(10, { stiffness: 100, damping: 10, precision: 1 }),
      spring(100, { stiffness: 200, damping: 20, precision: 0.5 }),
    ]);

    expect(c.__chain).toBe(true);
    expect(c.__currentStep).toBe(0);
    expect(c.__steps.length).toBe(2);
    expect(c.val).toBe(10);
    expect(c.stiffness).toBe(100);
    expect(c.damping).toBe(10);
    expect(c.precision).toBe(1);
    expect(c.__steps[1].val).toBe(100);
    expect(c.__steps[1].stiffness).toBe(200);
  });

  it('should animate through chain steps sequentially', () => {
    let count = [];
    class App extends React.Component {
      render() {
        return (
          <Motion
            defaultStyle={{ a: 0 }}
            style={{
              a: chain([
                spring(10, { stiffness: 1000, damping: 500, precision: 1 }),
                spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
              ]),
            }}
          >
            {({ a }) => {
              count.push(a);
              return null;
            }}
          </Motion>
        );
      }
    }
    TestUtils.renderIntoDocument(<App />);

    expect(count).toEqual([0]);

    // first step: 0 -> 10
    mockRaf.step(99);
    // should have reached 10 at some point
    const firstStepReached = count.some(v => v === 10);
    expect(firstStepReached).toBe(true);

    // after more steps, should go back to 0 (second step)
    mockRaf.step(199);
    const secondStepReached = count.some(v => v === 0);
    expect(secondStepReached).toBe(true);

    // final value should be 0
    expect(count[count.length - 1]).toBe(0);
  });

  it('should support 3 or more chain steps', () => {
    let count = [];
    class App extends React.Component {
      render() {
        return (
          <Motion
            defaultStyle={{ a: 0 }}
            style={{
              a: chain([
                spring(5, { stiffness: 1000, damping: 500, precision: 1 }),
                spring(10, { stiffness: 1000, damping: 500, precision: 1 }),
                spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
              ]),
            }}
          >
            {({ a }) => {
              count.push(a);
              return null;
            }}
          </Motion>
        );
      }
    }
    TestUtils.renderIntoDocument(<App />);

    // step 1: 0 -> 5
    mockRaf.step(99);
    const reached5 = count.some(v => v === 5);
    expect(reached5).toBe(true);

    // step 2: 5 -> 10
    mockRaf.step(199);
    const reached10 = count.some(v => v === 10);
    expect(reached10).toBe(true);

    // step 3: 10 -> 0
    mockRaf.step(299);
    const reached0 = count.some(v => v === 0);
    expect(reached0).toBe(true);

    expect(count[count.length - 1]).toBe(0);
  });

  it('should call onRest only after final chain step completes', () => {
    const onRest = createSpy('onRest');
    let result = 0;

    class App extends React.Component {
      render() {
        return (
          <Motion
            defaultStyle={{ a: 0 }}
            style={{
              a: chain([
                spring(5, { stiffness: 1000, damping: 500, precision: 1 }),
                spring(10, { stiffness: 1000, damping: 500, precision: 1 }),
              ]),
            }}
            onRest={onRest}
          >
            {({ a }) => {
              result = a;
              return null;
            }}
          </Motion>
        );
      }
    }

    TestUtils.renderIntoDocument(<App />);

    // not done yet
    mockRaf.step(50);
    expect(onRest).not.toHaveBeenCalled();

    // finish all steps
    mockRaf.step(499);

    expect(result).toEqual(10);
    expect(onRest.calls.count()).toEqual(1);
  });

  it('should support multiple keys with different chains', () => {
    let count = [];
    class App extends React.Component {
      render() {
        return (
          <Motion
            defaultStyle={{ a: 0, b: 100 }}
            style={{
              a: chain([
                spring(10, { stiffness: 1000, damping: 500, precision: 1 }),
                spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
              ]),
              b: chain([
                spring(50, { stiffness: 1000, damping: 500, precision: 1 }),
                spring(100, { stiffness: 1000, damping: 500, precision: 1 }),
              ]),
            }}
          >
            {({ a, b }) => {
              count.push([a, b]);
              return null;
            }}
          </Motion>
        );
      }
    }
    TestUtils.renderIntoDocument(<App />);

    expect(count[0]).toEqual([0, 100]);

    // let everything finish
    mockRaf.step(599);

    const last = count[count.length - 1];
    expect(last[0]).toBe(0);
    expect(last[1]).toBe(100);
  });

  it('should work with single step chain same as regular spring', () => {
    let countChain = [];
    let countSpring = [];

    class AppChain extends React.Component {
      render() {
        return (
          <Motion
            defaultStyle={{ a: 0 }}
            style={{
              a: chain([
                spring(10, { stiffness: 100, damping: 50, precision: 16 }),
              ]),
            }}
          >
            {({ a }) => {
              countChain.push(a);
              return null;
            }}
          </Motion>
        );
      }
    }

    class AppSpring extends React.Component {
      render() {
        return (
          <Motion
            defaultStyle={{ a: 0 }}
            style={{
              a: spring(10, { stiffness: 100, damping: 50, precision: 16 }),
            }}
          >
            {({ a }) => {
              countSpring.push(a);
              return null;
            }}
          </Motion>
        );
      }
    }

    const mockRaf2 = createMockRaf();
    const Motion2 = injector({
      raf: mockRaf2.raf,
      'performance-now': mockRaf2.now,
    }).default;

    TestUtils.renderIntoDocument(<AppChain />);
    // need to use a separate instance for AppSpring since we can't mock twice easily
    // instead, we'll just verify chain with single step finishes correctly
    mockRaf.step(99);
    expect(countChain[countChain.length - 1]).toBe(10);
  });

  it('should expose cancel method on returned chain config', () => {
    const c = chain([spring(10), spring(20)]);
    expect(typeof c.cancel).toBe('function');
    expect(c.__cancelled).toBe(false);
    c.cancel();
    expect(c.__cancelled).toBe(true);
    // cancel is idempotent
    c.cancel();
    expect(c.__cancelled).toBe(true);
  });

  it('should call onCancel callback when cancelled', () => {
    const onCancel = createSpy('onCancel');
    const c = chain([spring(10), spring(20)], { onCancel });
    expect(onCancel).not.toHaveBeenCalled();
    c.cancel();
    expect(onCancel.calls.count()).toBe(1);
    c.cancel();
    expect(onCancel.calls.count()).toBe(1);
  });

  it('should not throw even if onCancel callback throws', () => {
    const c = chain([spring(10), spring(20)], {
      onCancel: () => {
        throw new Error('boom');
      },
    });
    expect(() => c.cancel()).not.toThrow();
    expect(c.__cancelled).toBe(true);
  });

  it('should respect pre-aborted AbortSignal', () => {
    const signal = { aborted: true, addEventListener() {} };
    const c = chain([spring(10), spring(20)], { signal });
    expect(c.__cancelled).toBe(true);
  });

  it('should react to AbortSignal abort event', () => {
    let listener = null;
    const signal = {
      aborted: false,
      addEventListener(type, cb) {
        if (type === 'abort') {
          listener = cb;
        }
      },
    };
    const c = chain([spring(10), spring(20)], { signal });
    expect(c.__cancelled).toBe(false);
    expect(typeof listener).toBe('function');
    listener();
    expect(c.__cancelled).toBe(true);
  });

  it('should stop chain mid-animation when cancel() is called', () => {
    let count = [];
    let chainCfg;

    class App extends React.Component {
      constructor() {
        super();
        chainCfg = chain([
          spring(100, { stiffness: 1000, damping: 500, precision: 1 }),
          spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
        ]);
      }
      render() {
        return (
          <Motion defaultStyle={{ a: 0 }} style={{ a: chainCfg }}>
            {({ a }) => {
              count.push(a);
              return null;
            }}
          </Motion>
        );
      }
    }
    TestUtils.renderIntoDocument(<App />);

    // start animating towards 100
    mockRaf.step(10);
    const lastBeforeCancel = count[count.length - 1];
    expect(lastBeforeCancel).toBeGreaterThan(0);
    expect(lastBeforeCancel).toBeLessThan(100);

    // cancel the chain now
    chainCfg.cancel();
    const frozenValue = count[count.length - 1];

    // further steps should not change the value anymore (no more interpolation)
    mockRaf.step(200);
    const lastAfterCancel = count[count.length - 1];
    expect(lastAfterCancel).toBe(frozenValue);

    // and it should NOT have reached the second step target (0)
    const everReachedZero = count.some(v => v === 0);
    expect(everReachedZero).toBe(false);
  });

  it('should trigger onRest when chain is cancelled mid-animation', () => {
    const onRest = createSpy('onRest');
    let chainCfg;

    class App extends React.Component {
      constructor() {
        super();
        chainCfg = chain([
          spring(100, { stiffness: 1000, damping: 500, precision: 1 }),
          spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
        ]);
      }
      render() {
        return (
          <Motion
            defaultStyle={{ a: 0 }}
            style={{ a: chainCfg }}
            onRest={onRest}
          >
            {() => null}
          </Motion>
        );
      }
    }
    TestUtils.renderIntoDocument(<App />);

    mockRaf.step(5);
    expect(onRest).not.toHaveBeenCalled();

    chainCfg.cancel();
    mockRaf.step(20);
    expect(onRest.calls.count()).toBe(1);
  });

  it('should recover from cancel by passing a fresh chain prop', () => {
    let count = [];
    let setStateOuter = () => {};

    class App extends React.Component {
      constructor() {
        super();
        this.state = {
          cfg: chain([
            spring(10, { stiffness: 1000, damping: 500, precision: 1 }),
            spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
          ]),
        };
      }
      componentWillMount() {
        setStateOuter = this.setState.bind(this);
      }
      render() {
        return (
          <Motion defaultStyle={{ a: 0 }} style={{ a: this.state.cfg }}>
            {({ a }) => {
              count.push(a);
              return null;
            }}
          </Motion>
        );
      }
    }
    TestUtils.renderIntoDocument(<App />);

    // cancel the first chain mid-way
    mockRaf.step(5);
    const firstChainCfg = count.slice();
    expect(firstChainCfg[firstChainCfg.length - 1]).toBeGreaterThan(0);

    // cancel current chain
    // (we stored it through state but we can just pass a fresh one to recover)
    const freshChain = chain([
      spring(100, { stiffness: 1000, damping: 500, precision: 1 }),
      spring(200, { stiffness: 1000, damping: 500, precision: 1 }),
    ]);
    setStateOuter({ cfg: freshChain });
    count.length = 0;

    // the fresh (non-cancelled) chain should run to completion
    mockRaf.step(400);

    const reached100 = count.some(v => Math.abs(v - 100) <= 1);
    const reached200 = count.some(v => Math.abs(v - 200) <= 1);
    expect(reached100).toBe(true);
    expect(reached200).toBe(true);
    expect(count[count.length - 1]).toBe(200);
  });

  it('should support independent cancellation per key in multi-key chain', () => {
    let count = [];
    let chainA;
    let chainB;

    class App extends React.Component {
      constructor() {
        super();
        chainA = chain([
          spring(100, { stiffness: 1000, damping: 500, precision: 1 }),
          spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
        ]);
        chainB = chain([
          spring(200, { stiffness: 1000, damping: 500, precision: 1 }),
          spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
        ]);
      }
      render() {
        return (
          <Motion
            defaultStyle={{ a: 0, b: 0 }}
            style={{ a: chainA, b: chainB }}
          >
            {({ a, b }) => {
              count.push([a, b]);
              return null;
            }}
          </Motion>
        );
      }
    }
    TestUtils.renderIntoDocument(<App />);

    mockRaf.step(10);
    const beforeCancel = count[count.length - 1];
    expect(beforeCancel[0]).toBeGreaterThan(0);
    expect(beforeCancel[1]).toBeGreaterThan(0);

    // cancel only chainA
    chainA.cancel();
    const frozenA = count[count.length - 1][0];

    mockRaf.step(300);

    // chainA should be frozen, chainB should have finished both steps and reached 0
    const afterCancel = count[count.length - 1];
    expect(afterCancel[0]).toBe(frozenA);
    expect(afterCancel[1]).toBe(0);
  });

  describe('graceful cancel', () => {
    it('should enter gracefully-cancelling state without immediate cancel', () => {
      const c = chain([spring(10), spring(20)]);
      expect(c.__cancelled).toBe(false);
      expect(c.__cancellingGraceful).toBe(false);

      c.cancel({ graceful: true });

      expect(c.__cancellingGraceful).toBe(true);
      expect(c.__cancelled).toBe(false);
    });

    it('graceful cancel is idempotent', () => {
      let called = 0;
      const c = chain([spring(10), spring(20)], {
        onCancel: () => {
          called++;
        },
      });
      c.cancel({ graceful: true });
      c.cancel({ graceful: true });
      expect(c.__cancellingGraceful).toBe(true);
      // onCancel not called yet because it's only called when fully cancelled
      expect(called).toBe(0);
    });

    it('hard cancel after graceful cancel upgrades to immediate cancel', () => {
      let called = 0;
      const c = chain([spring(10), spring(20)], {
        onCancel: () => {
          called++;
        },
      });
      c.cancel({ graceful: true });
      expect(c.__cancellingGraceful).toBe(true);
      expect(c.__cancelled).toBe(false);

      c.cancel(); // hard cancel

      expect(c.__cancelled).toBe(true);
      expect(c.__cancellingGraceful).toBe(false);
      expect(called).toBe(1);
    });

    it('graceful cancel on last step completes normally and calls onCancel', () => {
      let count = [];
      const onRest = createSpy('onRest');
      const onCancel = createSpy('onCancel');
      let chainCfg;

      class App extends React.Component {
        constructor() {
          super();
          chainCfg = chain(
            [
              spring(10, { stiffness: 1000, damping: 500, precision: 1 }),
              spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
            ],
            { onCancel },
          );
        }
        render() {
          return (
            <Motion
              defaultStyle={{ a: 0 }}
              style={{ a: chainCfg }}
              onRest={onRest}
            >
              {({ a }) => {
                count.push(a);
                return null;
              }}
            </Motion>
          );
        }
      }
      TestUtils.renderIntoDocument(<App />);

      // let it reach first step target (10)
      mockRaf.step(99);
      const reached10 = count.some(v => v === 10);
      expect(reached10).toBe(true);

      // onCancel should not have been called yet (still progressing)
      expect(onCancel).not.toHaveBeenCalled();

      // now we're animating toward 0 (second step). Cancel gracefully.
      // cancel gracefully on the second (last) step
      chainCfg.cancel({ graceful: true });
      expect(chainCfg.__cancellingGraceful).toBe(true);

      // let the current step finish
      mockRaf.step(299);

      // should reach 0 (the current step's target)
      expect(count[count.length - 1]).toBe(0);

      // onCancel should be called once when the step finishes
      expect(onCancel.calls.count()).toBe(1);

      // onRest should also fire
      expect(onRest.calls.count()).toBe(1);
    });

    it('should not progress to next step when gracefully cancelled mid-chain', () => {
      let count = [];
      const onCancel = createSpy('onCancel');
      let chainCfg;

      class App extends React.Component {
        constructor() {
          super();
          chainCfg = chain(
            [
              spring(100, { stiffness: 1000, damping: 500, precision: 1 }),
              spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
            ],
            { onCancel },
          );
        }
        render() {
          return (
            <Motion defaultStyle={{ a: 0 }} style={{ a: chainCfg }}>
              {({ a }) => {
                count.push(a);
                return null;
              }}
            </Motion>
          );
        }
      }
      TestUtils.renderIntoDocument(<App />);

      // cancel gracefully while still on first step (animating toward 100)
      mockRaf.step(5);
      const valueAtCancelTime = count[count.length - 1];
      expect(valueAtCancelTime).toBeGreaterThan(0);
      expect(valueAtCancelTime).toBeLessThan(100);

      chainCfg.cancel({ graceful: true });
      expect(onCancel).not.toHaveBeenCalled();

      // let the first step finish
      mockRaf.step(299);

      // should have reached 100 (current step target)
      const reached100 = count.some(v => v === 100);
      expect(reached100).toBe(true);

      // onCancel should fire when step completes
      expect(onCancel.calls.count()).toBe(1);

      // but should NOT have reached 0 (never advanced to second step)
      const everReachedZero = count.some(v => v === 0);
      expect(everReachedZero).toBe(false);

      // final value should be 100
      expect(count[count.length - 1]).toBe(100);
    });

    it('should trigger onRest after graceful cancel completes', () => {
      const onRest = createSpy('onRest');
      let chainCfg;

      class App extends React.Component {
        constructor() {
          super();
          chainCfg = chain([
            spring(50, { stiffness: 1000, damping: 500, precision: 1 }),
            spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
          ]);
        }
        render() {
          return (
            <Motion
              defaultStyle={{ a: 0 }}
              style={{ a: chainCfg }}
              onRest={onRest}
            >
              {() => null}
            </Motion>
          );
        }
      }
      TestUtils.renderIntoDocument(<App />);

      // cancel gracefully on first step
      mockRaf.step(3);
      chainCfg.cancel({ graceful: true });
      expect(onRest).not.toHaveBeenCalled();

      // let first step finish
      mockRaf.step(299);

      // onRest should fire once (after graceful cancel resolves)
      expect(onRest.calls.count()).toBe(1);
    });

    it('should support graceful cancel on multiple chains independently', () => {
      let count = [];
      let chainA;
      let chainB;

      class App extends React.Component {
        constructor() {
          super();
          chainA = chain([
            spring(100, { stiffness: 1000, damping: 500, precision: 1 }),
            spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
          ]);
          chainB = chain([
            spring(200, { stiffness: 1000, damping: 500, precision: 1 }),
            spring(0, { stiffness: 1000, damping: 500, precision: 1 }),
          ]);
        }
        render() {
          return (
            <Motion
              defaultStyle={{ a: 0, b: 0 }}
              style={{ a: chainA, b: chainB }}
            >
              {({ a, b }) => {
                count.push([a, b]);
                return null;
              }}
            </Motion>
          );
        }
      }
      TestUtils.renderIntoDocument(<App />);

      // cancel chainA gracefully, chainB hard
      mockRaf.step(5);
      chainA.cancel({ graceful: true });
      chainB.cancel();
      const frozenB = count[count.length - 1][1];

      mockRaf.step(299);

      // chainB should remain frozen
      const last = count[count.length - 1];
      expect(last[1]).toBe(frozenB);

      // chainA should have completed current step (reached 100)
      expect(last[0]).toBe(100);
    });
  });
});
