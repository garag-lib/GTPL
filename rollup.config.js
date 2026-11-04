import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import fs from 'fs';

// Leer package.json
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// Banner para el archivo (con ! para que terser lo preserve)
const banner = `/*!
* ${packageJson.name} v${packageJson.version}
* (c) 2024 ${packageJson.author}
* @license ${packageJson.license}
* @repository ${packageJson.repository}
*/`;

export default [
  // -----------------------------------------------------------
  // 🌍 ESM moderno (para browsers y Node >=14)
  // -----------------------------------------------------------
  {
    input: { gtpl: 'src/lib/gtpl.ts', runtime: 'src/lib/runtime.ts' },
    output: {
      dir: 'dist',
      entryFileNames: '[name].esm.js',
      chunkFileNames: 'shared/[name].esm.js',
      format: 'es',
      sourcemap: true,
      banner,
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig-rollup.json',
        declaration: false,
        declarationMap: false
      }),
      terser({
        format: { comments: /^!/ } // Preserva solo el banner
      })
    ],
    external: ['tslib']
  },

  // -----------------------------------------------------------
  // 🖥️ Compatibilidad con Node (CommonJS)
  // -----------------------------------------------------------
  {
    input: { gtpl: 'src/lib/gtpl.ts', runtime: 'src/lib/runtime.ts' },
    output: {
      dir: 'dist',
      entryFileNames: '[name].cjs',
      chunkFileNames: 'shared/[name].cjs',
      format: 'cjs',
      sourcemap: true,
      banner,
      exports: 'default'
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig-rollup.json',
        declaration: false,
        declarationMap: false
      }),
      terser({
        format: { comments: /^!/ }
      })
    ],
    external: ['tslib']
  },

  // -----------------------------------------------------------
  // 🌐 Web plano (IIFE / UMD global)
  // -----------------------------------------------------------
  {
    input: 'src/lib/gtpl.ts',
    output: ['dist/gtpl.global.js', 'docs/gtpl.global.js'].map(file => ({
      file,
      format: 'iife', // o "umd" si quieres compatibilidad AMD
      name: 'gtpl',   // expone como window.gtpl
      sourcemap: true,
      banner
    })),
    plugins: [
      typescript({
        tsconfig: './tsconfig-rollup.json',
        declaration: false,
        declarationMap: false
      }),
      terser({
        format: { comments: /^!/ }
      })
    ],
    external: ['tslib']
  },

  // -----------------------------------------------------------
  // 📘 Declaraciones de tipos (.d.ts)
  // -----------------------------------------------------------
  {
    input: { gtpl: 'src/lib/gtpl.ts', runtime: 'src/lib/runtime.ts' },
    output: {
      dir: 'dist',
      entryFileNames: '[name].d.ts',
      chunkFileNames: 'shared/[name].d.ts',
      format: 'es',
      banner
    },
    plugins: [dts()],
    external: ['tslib']
  }
];
