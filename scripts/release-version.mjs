import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
const input = (process.env.INPUT_VERSION || '').trim().replace(/^v/, '');
let version;
if (input) {
  if (!/^\d+(\.\d+){0,2}$/.test(input)) throw new Error('Use a numeric stable version such as v1.2.0');
  version = input.split('.').concat(['0', '0']).slice(0, 3).map(Number).join('.');
} else {
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).trim().split('\n').filter(tag => /^v\d+\.\d+\.\d+$/.test(tag));
  tags.sort((a, b) => {
    const aa = a.slice(1).split('.').map(Number), bb = b.slice(1).split('.').map(Number);
    return bb[0] - aa[0] || bb[1] - aa[1] || bb[2] - aa[2];
  });
  if (tags.length) { const [major, minor, patch] = tags[0].slice(1).split('.').map(Number); version = `${major}.${minor}.${patch + 1}`; }
  else version = JSON.parse(readFileSync('package.json', 'utf8')).version;
}
if (execFileSync('git', ['tag', '--list', `v${version}`], { encoding: 'utf8' }).trim()) throw new Error(`Tag v${version} already exists`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`Release version: ${version}`);
