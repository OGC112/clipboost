const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const BASE_COMMIT = '243cb278112bff6f5cb2a85896222ebc1082b3ba';

function git(args) {
  return cp.execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
}

function historicalFile(repoPath) {
  try {
    return git(['show', `${BASE_COMMIT}:${repoPath}`]);
  } catch (firstError) {
    // Make sure the historical rollback commit exists locally.
    git(['fetch', 'origin', BASE_COMMIT]);
    return git(['show', `${BASE_COMMIT}:${repoPath}`]);
  }
}

function write(repoPath, content) {
  const target = path.join(ROOT, ...repoPath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

console.log('Restoring original ClipBoost 21.6.0 frontend...');

let app = historicalFile('src/app.js');
let css = historicalFile('src/static.css');
let html = historicalFile('index.html');

// Preserve the chosen Mint display branding while restoring the original UI/layout.
app = app
  .replace(/<span>ClipBoost<\/span>/g, '<span>Mint</span>')
  .replace(/CLIPBOOST WORKSPACE/g, 'MINT WORKSPACE');

html = html
  .replace(/<title>ClipBoost<\/title>/i, '<title>Mint</title>');

write('src/app.js', app);
write('src/static.css', css);
write('index.html', html);

// Remove every redesign layer created after the original frontend.
// They will also be removed by `git add -A` in Auto Publisher.
const srcDir = path.join(ROOT, 'src');
if (fs.existsSync(srcDir)) {
  for (const name of fs.readdirSync(srcDir)) {
    if (/^(mint-|redesign-).*?\.(css|js)$/i.test(name)) {
      try { fs.unlinkSync(path.join(srcDir, name)); } catch {}
    }
  }
}

// Remove previous patch scripts, but keep this one harmlessly in the repo.
// More importantly, remove postinstall from package.json so this rollback
// does NOT keep rewriting app.js on later npm installs.
const scriptsDir = path.join(ROOT, 'scripts');
if (fs.existsSync(scriptsDir)) {
  for (const name of fs.readdirSync(scriptsDir)) {
    if (/^apply-21\./i.test(name)) {
      try { fs.unlinkSync(path.join(scriptsDir, name)); } catch {}
    }
  }
}

const packagePath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = '21.14.0';
if (pkg.scripts && pkg.scripts.postinstall === 'node scripts/restore-original-ui.cjs') {
  delete pkg.scripts.postinstall;
}
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// Keep package-lock version aligned when it exists.
const lockPath = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = '21.14.0';
    if (lock.packages && lock.packages['']) lock.packages[''].version = '21.14.0';
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  } catch {}
}

console.log('Original UI restored successfully.');
console.log('Base frontend commit:', BASE_COMMIT);
console.log('Version:', '21.14.0');
