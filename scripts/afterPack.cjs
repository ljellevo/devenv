const { execFileSync } = require('node:child_process');
const path = require('node:path');
exports.default = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)], { stdio: 'inherit' });
};
