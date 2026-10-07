import { build } from 'esbuild';
await build({ entryPoints: { main: 'src/main/main.ts', preload: 'src/main/preload.ts', supervisor: 'src/core/supervisor.ts', follower: 'src/core/follower.ts' }, outdir: 'dist', bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, external: ['electron', 'node-pty'], loader: { '.png': 'dataurl' }, sourcemap: true, target: 'node22' });
