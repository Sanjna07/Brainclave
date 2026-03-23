import { execSync } from 'child_process';
try {
  const output = execSync('npx tsc --noEmit', { stdio: 'pipe' });
  console.log('SUCCESS:\n' + output.toString());
} catch(e) {
  console.log('ERROR:\n' + e.stdout.toString() + '\n' + e.stderr.toString());
}
