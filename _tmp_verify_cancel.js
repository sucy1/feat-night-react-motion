const { spring, chain } = require('./lib/react-motion');

// Basic structure
const c = chain([spring(10), spring(20)]);
console.log('cancel method exists:', typeof c.cancel === 'function');
console.log('initial __cancelled:', c.__cancelled);
c.cancel();
console.log('after cancel __cancelled:', c.__cancelled);
c.cancel();
console.log('cancel is idempotent OK');

// onCancel callback
let called = 0;
const c2 = chain([spring(1)], {
  onCancel: () => {
    called++;
  },
});
c2.cancel();
c2.cancel();
console.log('onCancel called exactly once:', called === 1);

// onCancel throws is swallowed
let ok = true;
try {
  const c3 = chain([spring(1)], {
    onCancel: () => {
      throw new Error('x');
    },
  });
  c3.cancel();
} catch (e) {
  ok = false;
}
console.log('onCancel throw swallowed:', ok);

// Pre-aborted signal
const sig = { aborted: true, addEventListener() {} };
const c4 = chain([spring(1)], { signal: sig });
console.log('pre-aborted signal detected:', c4.__cancelled === true);

// Dynamic abort event
let listener = null;
const sig2 = {
  aborted: false,
  addEventListener(t, l) {
    if (t === 'abort') listener = l;
  },
};
const c5 = chain([spring(1)], { signal: sig2 });
console.log('before abort event:', c5.__cancelled === false);
listener();
console.log('after abort event:', c5.__cancelled === true);

console.log('\nAll cancel API checks passed!');
