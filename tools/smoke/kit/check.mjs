// Collects failures so a run reports all of them, not only the first.

const faults = [];

export function check(ok, message) {
  if (!ok) faults.push(message);
}

export function same(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) faults.push(`${message}: got ${a}, expected ${e}`);
}

export function done(summary) {
  if (faults.length > 0) {
    console.log(faults.slice(0, 40).join('\n'));
    if (faults.length > 40) console.log(`… and ${faults.length - 40} more`);
    process.exit(1);
  }
  console.log(summary);
}
