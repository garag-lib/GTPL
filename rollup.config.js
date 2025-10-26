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
  // Configuración para el bundle JavaScript
  {
    input: 'src/lib/gtpl.ts',
    output: {
      file: 'dist/gtpl.min.js',
      format: 'umd',
      name: 'gtpl',
      sourcemap: true,
      banner,
      globals: {},
      exports: 'default'
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig-rollup.json',
        declaration: false, // No generar .d.ts aquí
        declarationMap: false
      }),
      terser({
        format: {
          comments: /^!/  // Preserva solo comentarios que empiezan con /*!
        }
      })
    ]
  },
  // Configuración para unificar los .d.ts en un solo archivo
  {
    input: 'src/lib/gtpl.ts',
    output: {
      file: 'dist/gtpl.d.ts',
      format: 'es',
      banner
    },
    plugins: [
      dts()
    ]
  }
];