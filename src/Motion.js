/* @flow */
import mapToZero from './mapToZero';
import stripStyle from './stripStyle';
import stepper from './stepper';
import defaultNow from 'performance-now';
import defaultRaf from 'raf';
import shouldStopAnimation from './shouldStopAnimation';
import React from 'react';
import PropTypes from 'prop-types';

import type {
  ReactElement,
  PlainStyle,
  Style,
  Velocity,
  MotionProps,
  OpaqueConfig,
} from './Types';

const msPerFrame = 1000 / 60;

type MotionState = {
  currentStyle: PlainStyle,
  currentVelocity: Velocity,
  lastIdealStyle: PlainStyle,
  lastIdealVelocity: Velocity,
  currentChainSteps: { [key: string]: number },
  cancelledChains: { [key: string]: boolean },
};

export default class Motion extends React.Component<MotionProps, MotionState> {
  static propTypes = {
    // TOOD: warn against putting a config in here
    defaultStyle: PropTypes.objectOf(PropTypes.number),
    style: PropTypes.objectOf(
      PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
    ).isRequired,
    children: PropTypes.func.isRequired,
    onRest: PropTypes.func,
  };

  constructor(props: MotionProps) {
    super(props);
    this.state = this.defaultState();
  }

  unmounting: boolean = false;
  wasAnimating: boolean = false;
  animationID: ?number = null;
  prevTime: number = 0;
  accumulatedTime: number = 0;

  defaultState(): MotionState {
    const { defaultStyle, style } = this.props;
    const currentStyle = defaultStyle || stripStyle(style);
    const currentVelocity = mapToZero(currentStyle);
    const currentChainSteps: { [key: string]: number } = {};
    const cancelledChains: { [key: string]: boolean } = {};
    for (let key in style) {
      if (!Object.prototype.hasOwnProperty.call(style, key)) {
        continue;
      }
      const styleValue = style[key];
      if (typeof styleValue !== 'number' && styleValue.__chain) {
        currentChainSteps[key] = 0;
        cancelledChains[key] =
          (typeof styleValue.__getCancelled === 'function' &&
            styleValue.__getCancelled()) ||
          styleValue.__cancelled === true;
      }
    }
    return {
      currentStyle,
      currentVelocity,
      lastIdealStyle: currentStyle,
      lastIdealVelocity: currentVelocity,
      currentChainSteps,
      cancelledChains,
    };
  }

  // it's possible that currentStyle's value is stale: if props is immediately
  // changed from 0 to 400 to spring(0) again, the async currentStyle is still
  // at 0 (didn't have time to tick and interpolate even once). If we naively
  // compare currentStyle with destVal it'll be 0 === 0 (no animation, stop).
  // In reality currentStyle should be 400
  unreadPropStyle: ?Style = null;
  // after checking for unreadPropStyle != null, we manually go set the
  // non-interpolating values (those that are a number, without a spring
  // config)
  clearUnreadPropStyle = (destStyle: Style): void => {
    let dirty = false;
    let {
      currentStyle,
      currentVelocity,
      lastIdealStyle,
      lastIdealVelocity,
    } = this.state;

    for (let key in destStyle) {
      if (!Object.prototype.hasOwnProperty.call(destStyle, key)) {
        continue;
      }

      const styleValue = destStyle[key];
      if (typeof styleValue === 'number') {
        if (!dirty) {
          dirty = true;
          currentStyle = { ...currentStyle };
          currentVelocity = { ...currentVelocity };
          lastIdealStyle = { ...lastIdealStyle };
          lastIdealVelocity = { ...lastIdealVelocity };
        }

        currentStyle[key] = styleValue;
        currentVelocity[key] = 0;
        lastIdealStyle[key] = styleValue;
        lastIdealVelocity[key] = 0;
      }
    }

    if (dirty) {
      this.setState({
        currentStyle,
        currentVelocity,
        lastIdealStyle,
        lastIdealVelocity,
        currentChainSteps: this.state.currentChainSteps,
        cancelledChains: this.state.cancelledChains,
      });
    }
  };

  isChainCancelled = (key: string): boolean => {
    if (this.state.cancelledChains[key]) {
      return true;
    }
    const styleValue = this.props.style[key];
    if (typeof styleValue === 'number' || !styleValue.__chain) {
      return false;
    }
    return (
      (typeof styleValue.__getCancelled === 'function' &&
        styleValue.__getCancelled()) ||
      styleValue.__cancelled === true
    );
  };

  checkCancelledChains = (): boolean => {
    const propsStyle: Style = this.props.style;
    let changed = false;
    let cancelledChains = this.state.cancelledChains;
    let currentVelocity = this.state.currentVelocity;

    for (let key in propsStyle) {
      if (!Object.prototype.hasOwnProperty.call(propsStyle, key)) {
        continue;
      }
      if (cancelledChains[key]) {
        continue;
      }
      const styleValue = propsStyle[key];
      if (typeof styleValue === 'number' || !styleValue.__chain) {
        continue;
      }
      const cancelled =
        (typeof styleValue.__getCancelled === 'function' &&
          styleValue.__getCancelled()) ||
        styleValue.__cancelled === true;
      if (cancelled) {
        if (!changed) {
          changed = true;
          cancelledChains = { ...cancelledChains };
          currentVelocity = { ...currentVelocity };
        }
        cancelledChains[key] = true;
        currentVelocity[key] = 0;
      }
    }

    if (changed) {
      this.setState({ cancelledChains, currentVelocity });
    }
    return changed;
  };

  getEffectiveStyleValue = (key: string): number | OpaqueConfig => {
    const styleValue = this.props.style[key];
    if (typeof styleValue === 'number' || !styleValue.__chain) {
      return styleValue;
    }
    if (this.isChainCancelled(key)) {
      return this.state.currentStyle[key];
    }
    const currentStep = this.state.currentChainSteps[key] || 0;
    return styleValue.__steps[currentStep];
  };

  resolveChainSteps = (): boolean => {
    const propsStyle: Style = this.props.style;
    let progressed = false;
    let currentStyle = this.state.currentStyle;
    let currentVelocity = this.state.currentVelocity;
    let lastIdealStyle = this.state.lastIdealStyle;
    let lastIdealVelocity = this.state.lastIdealVelocity;
    let currentChainSteps = this.state.currentChainSteps;
    let cancelledChains = this.state.cancelledChains;

    for (let key in propsStyle) {
      if (!Object.prototype.hasOwnProperty.call(propsStyle, key)) {
        continue;
      }

      const styleValue = propsStyle[key];
      if (typeof styleValue === 'number' || !styleValue.__chain) {
        continue;
      }
      if (this.isChainCancelled(key)) {
        continue;
      }

      const stepIndex =
        currentChainSteps[key] != null ? currentChainSteps[key] : 0;
      const currentStepConfig = styleValue.__steps[stepIndex];

      const reached =
        Math.abs(currentStyle[key] - currentStepConfig.val) <=
          currentStepConfig.precision &&
        Math.abs(currentVelocity[key]) <= currentStepConfig.precision;

      if (!reached) {
        continue;
      }

      const isGracefullyCancelling =
        (typeof styleValue.__getCancellingGraceful === 'function' &&
          styleValue.__getCancellingGraceful()) ||
        styleValue.__cancellingGraceful === true;

      if (isGracefullyCancelling) {
        if (typeof styleValue.__resolveGracefulCancel === 'function') {
          styleValue.__resolveGracefulCancel();
        }
        if (!progressed) {
          progressed = true;
          currentStyle = { ...currentStyle };
          currentVelocity = { ...currentVelocity };
          lastIdealStyle = { ...lastIdealStyle };
          lastIdealVelocity = { ...lastIdealVelocity };
          currentChainSteps = { ...currentChainSteps };
          cancelledChains = { ...cancelledChains };
        }
        cancelledChains[key] = true;
        continue;
      }

      if (stepIndex < styleValue.__steps.length - 1) {
        if (!progressed) {
          progressed = true;
          currentStyle = { ...currentStyle };
          currentVelocity = { ...currentVelocity };
          lastIdealStyle = { ...lastIdealStyle };
          lastIdealVelocity = { ...lastIdealVelocity };
          currentChainSteps = { ...currentChainSteps };
          cancelledChains = { ...cancelledChains };
        }

        const nextStepIndex = stepIndex + 1;
        currentChainSteps[key] = nextStepIndex;
        const nextStepConfig = styleValue.__steps[nextStepIndex];
        currentStyle[key] = currentStepConfig.val;
        currentVelocity[key] = 0;
        lastIdealStyle[key] = currentStepConfig.val;
        lastIdealVelocity[key] = 0;
        // suppress unused warning
        void nextStepConfig;
      }
    }

    if (progressed) {
      this.setState({
        currentStyle,
        currentVelocity,
        lastIdealStyle,
        lastIdealVelocity,
        currentChainSteps,
        cancelledChains,
      });
    }

    return progressed;
  };

  shouldStopAnimationChainAware = (): boolean => {
    const propsStyle: Style = this.props.style;
    for (let key in propsStyle) {
      if (!Object.prototype.hasOwnProperty.call(propsStyle, key)) {
        continue;
      }

      const effectiveValue = this.getEffectiveStyleValue(key);
      const precision =
        typeof effectiveValue === 'number' ? 0.01 : effectiveValue.precision;

      if (Math.abs(this.state.currentVelocity[key]) > precision) {
        return false;
      }

      const targetVal =
        typeof effectiveValue === 'number'
          ? effectiveValue
          : effectiveValue.val;

      if (Math.abs(this.state.currentStyle[key] - targetVal) > precision) {
        return false;
      }
    }
    return true;
  };

  startAnimationIfNecessary = (): void => {
    if (this.unmounting || this.animationID != null) {
      return;
    }

    // TODO: when config is {a: 10} and dest is {a: 10} do we raf once and
    // call cb? No, otherwise accidental parent rerender causes cb trigger
    this.animationID = defaultRaf(timestamp => {
      // https://github.com/chenglou/react-motion/pull/420
      // > if execution passes the conditional if (this.unmounting), then
      // executes async defaultRaf and after that component unmounts and after
      // that the callback of defaultRaf is called, then setState will be called
      // on unmounted component.
      if (this.unmounting) {
        return;
      }

      // detect externally cancelled chains first (AbortSignal or cancel())
      if (this.checkCancelledChains()) {
        this.animationID = null;
        this.startAnimationIfNecessary();
        return;
      }

      // try to progress chain steps first
      if (this.resolveChainSteps()) {
        this.animationID = null;
        this.startAnimationIfNecessary();
        return;
      }

      // check if we need to animate in the first place
      if (this.shouldStopAnimationChainAware()) {
        if (this.wasAnimating && this.props.onRest) {
          this.props.onRest();
        }

        // no need to cancel animationID here; shouldn't have any in flight
        this.animationID = null;
        this.wasAnimating = false;
        this.accumulatedTime = 0;
        return;
      }

      this.wasAnimating = true;

      const currentTime = timestamp || defaultNow();
      const timeDelta = currentTime - this.prevTime;
      this.prevTime = currentTime;
      this.accumulatedTime = this.accumulatedTime + timeDelta;
      // more than 10 frames? prolly switched browser tab. Restart
      if (this.accumulatedTime > msPerFrame * 10) {
        this.accumulatedTime = 0;
      }

      if (this.accumulatedTime === 0) {
        // no need to cancel animationID here; shouldn't have any in flight
        this.animationID = null;
        this.startAnimationIfNecessary();
        return;
      }

      let currentFrameCompletion =
        (this.accumulatedTime -
          Math.floor(this.accumulatedTime / msPerFrame) * msPerFrame) /
        msPerFrame;
      const framesToCatchUp = Math.floor(this.accumulatedTime / msPerFrame);

      let newLastIdealStyle: PlainStyle = {};
      let newLastIdealVelocity: Velocity = {};
      let newCurrentStyle: PlainStyle = {};
      let newCurrentVelocity: Velocity = {};

      const propsStyle: Style = this.props.style;
      for (let key in propsStyle) {
        if (!Object.prototype.hasOwnProperty.call(propsStyle, key)) {
          continue;
        }

        const effectiveValue = this.getEffectiveStyleValue(key);
        if (typeof effectiveValue === 'number') {
          newCurrentStyle[key] = effectiveValue;
          newCurrentVelocity[key] = 0;
          newLastIdealStyle[key] = effectiveValue;
          newLastIdealVelocity[key] = 0;
        } else {
          let newLastIdealStyleValue = this.state.lastIdealStyle[key];
          let newLastIdealVelocityValue = this.state.lastIdealVelocity[key];
          for (let i = 0; i < framesToCatchUp; i++) {
            [newLastIdealStyleValue, newLastIdealVelocityValue] = stepper(
              msPerFrame / 1000,
              newLastIdealStyleValue,
              newLastIdealVelocityValue,
              effectiveValue.val,
              effectiveValue.stiffness,
              effectiveValue.damping,
              effectiveValue.precision,
            );
          }
          const [nextIdealX, nextIdealV] = stepper(
            msPerFrame / 1000,
            newLastIdealStyleValue,
            newLastIdealVelocityValue,
            effectiveValue.val,
            effectiveValue.stiffness,
            effectiveValue.damping,
            effectiveValue.precision,
          );

          newCurrentStyle[key] =
            newLastIdealStyleValue +
            (nextIdealX - newLastIdealStyleValue) * currentFrameCompletion;
          newCurrentVelocity[key] =
            newLastIdealVelocityValue +
            (nextIdealV - newLastIdealVelocityValue) * currentFrameCompletion;
          newLastIdealStyle[key] = newLastIdealStyleValue;
          newLastIdealVelocity[key] = newLastIdealVelocityValue;
        }
      }

      this.animationID = null;
      // the amount we're looped over above
      this.accumulatedTime -= framesToCatchUp * msPerFrame;

      this.setState({
        currentStyle: newCurrentStyle,
        currentVelocity: newCurrentVelocity,
        lastIdealStyle: newLastIdealStyle,
        lastIdealVelocity: newLastIdealVelocity,
        currentChainSteps: this.state.currentChainSteps,
        cancelledChains: this.state.cancelledChains,
      });

      this.unreadPropStyle = null;

      this.startAnimationIfNecessary();
    });
  };

  componentDidMount() {
    this.prevTime = defaultNow();
    this.startAnimationIfNecessary();
  }

  UNSAFE_componentWillReceiveProps(props: MotionProps) {
    if (this.unreadPropStyle != null) {
      // previous props haven't had the chance to be set yet; set them here
      this.clearUnreadPropStyle(this.unreadPropStyle);
    }

    // initialize chain steps/cancellation for new incoming style keys
    let currentChainSteps = this.state.currentChainSteps;
    let cancelledChains = this.state.cancelledChains;
    let chainStepsDirty = false;
    for (let key in props.style) {
      if (!Object.prototype.hasOwnProperty.call(props.style, key)) {
        continue;
      }
      const styleValue = props.style[key];
      if (typeof styleValue !== 'number' && styleValue.__chain) {
        if (!(key in currentChainSteps)) {
          if (!chainStepsDirty) {
            chainStepsDirty = true;
            currentChainSteps = { ...currentChainSteps };
            cancelledChains = { ...cancelledChains };
          }
          currentChainSteps[key] = 0;
          cancelledChains[key] =
            (typeof styleValue.__getCancelled === 'function' &&
              styleValue.__getCancelled()) ||
            styleValue.__cancelled === true;
        }
      }
    }
    if (chainStepsDirty) {
      this.setState({ currentChainSteps, cancelledChains });
    }

    this.unreadPropStyle = props.style;
    if (this.animationID == null) {
      this.prevTime = defaultNow();
      this.startAnimationIfNecessary();
    }
  }

  componentWillUnmount() {
    this.unmounting = true;
    if (this.animationID != null) {
      defaultRaf.cancel(this.animationID);
      this.animationID = null;
    }
  }

  render(): ReactElement {
    const renderedChildren = this.props.children(this.state.currentStyle);
    return renderedChildren && React.Children.only(renderedChildren);
  }
}
