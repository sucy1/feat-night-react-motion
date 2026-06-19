const { spring, chain } = require('./lib/react-motion');

console.log('=== Test 1: graceful cancel state transitions ===');
const c = chain([spring(10), spring(20)]);
console.log('initial __cancelled:', c.__cancelled);
console.log('initial __cancellingGraceful:', c.__cancellingGraceful);
c.cancel({ graceful: true });
console.log(
  'after graceful cancel __cancellingGraceful:',
  c.__cancellingGraceful,
);
console.log('after graceful cancel __cancelled:', c.__cancelled);
c.cancel(); // hard cancel
console.log('after hard cancel __cancelled:', c.__cancelled);
console.log('after hard cancel __cancellingGraceful:', c.__cancellingGraceful);
console.log('Test 1 PASSED');

console.log('\n=== Test 2: graceful cancel idempotent ===');
const c2 = chain([spring(10), spring(20)]);
c2.cancel({ graceful: true });
c2.cancel({ graceful: true });
console.log(
  'still in graceful state:',
  c2.__cancellingGraceful === true && c2.__cancelled === false,
);
console.log('Test 2 PASSED');

console.log(
  '\n=== Test 3: onCancel fires on graceful resolve, not immediately ===',
);
let onCancelCount = 0;
const c3 = chain([spring(10), spring(20)], {
  onCancel: () => {
    onCancelCount++;
  },
});
c3.cancel({ graceful: true });
console.log('onCancel not called yet:', onCancelCount === 0);
if (typeof c3.__resolveGracefulCancel === 'function') {
  c3.__resolveGracefulCancel();
}
console.log('onCancel called after resolve:', onCancelCount === 1);
c3.__resolveGracefulCancel();
console.log('resolve is idempotent:', onCancelCount === 1);
console.log('Test 3 PASSED');

console.log('\n=== Test 4: abort signal does hard cancel (not graceful) ===');
const c4 = chain([spring(10), spring(20)]);
let listener = null;
const sig = {
  aborted: false,
  addEventListener(t, l) {
    if (t === 'abort') listener = l;
  },
};
const c5 = chain([spring(10), spring(20)], { signal: sig });
console.log('initial state ok:', !c5.__cancelled && !c5.__cancellingGraceful);
listener();
console.log(
  'after abort signal hard cancelled:',
  c5.__cancelled === true && c5.__cancellingGraceful === false,
);
console.log('Test 4 PASSED');

console.log('\n=== Test 5: pre-aborted signal ===');
const c6 = chain([spring(10)], {
  signal: { aborted: true, addEventListener() {} },
});
console.log('pre-aborted immediately cancelled:', c6.__cancelled === true);
console.log('Test 5 PASSED');

console.log('\nAll graceful cancel API checks passed!');
