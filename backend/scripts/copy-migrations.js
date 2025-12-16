const fs = require('fs');
const path = require('path');

// Ensure dist/migrations directory exists
const distMigrationsDir = path.join(__dirname, '..', 'dist', 'migrations');
if (!fs.existsSync(distMigrationsDir)) {
  fs.mkdirSync(distMigrationsDir, { recursive: true });
}

// Copy all SQL files from src/migrations to dist/migrations
const srcMigrationsDir = path.join(__dirname, '..', 'src', 'migrations');
const files = fs.readdirSync(srcMigrationsDir);

files
  .filter(file => file.endsWith('.sql'))
  .forEach(file => {
    const srcPath = path.join(srcMigrationsDir, file);
    const destPath = path.join(distMigrationsDir, file);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to dist/migrations/`);
  });

console.log('✅ Migration files copied successfully');


