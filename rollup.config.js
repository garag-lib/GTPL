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
    input: 'src/lib/gtpl.ts',
    output: {
      file: 'dist/gtpl.esm.js',
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
    ]
  },

  // -----------------------------------------------------------
  // 🖥️ Compatibilidad con Node (CommonJS)
  // -----------------------------------------------------------
  {
    input: 'src/lib/gtpl.ts',
    output: {
      file: 'dist/gtpl.cjs.js',
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
    ]
  },

  // -----------------------------------------------------------
  // 🌐 Web plano (IIFE / UMD global)
  // -----------------------------------------------------------
  {
    input: 'src/lib/gtpl.ts',
    output: {
      file: 'dist/gtpl.global.js',
      format: 'iife', // o "umd" si quieres compatibilidad AMD
      name: 'gtpl',   // expone como window.gtpl
      sourcemap: true,
      banner
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
    ]
  },

  // -----------------------------------------------------------
  // 📘 Declaraciones de tipos (.d.ts)
  // -----------------------------------------------------------
  {
    input: 'src/lib/gtpl.ts',
    output: {
      file: 'dist/gtpl.d.ts',
      format: 'es',
      banner
    },
    plugins: [dts()]
  }
];
