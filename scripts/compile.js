const fs = require('fs').promises;
const path = require('path');
const { parse } = require('node-html-parser');
const gtpl = require('../dist/lib/gtpl.min.js');

// Tu función de compilación AOT (ajusta esta función según tus necesidades)
async function compileToAOT(htmlContent) {
    // Implementa tu lógica de compilación aquí
    // Esto es solo un ejemplo
    const root = parse(htmlContent);
    console.log(root);
    let code = '';
    if (root.childNodes.length == 1) {
        code = await gtpl.jit.GCode(root.childNodes[0]);
    } else {
        code = await gtpl.jit.GCode(root.childNodes);
    }
    return 'export default ' + code;
}

// Función para compilar archivos de una carpeta a otra
async function compileHtmlFiles(sourceDir, destDir) {
    try {
        const files = await fs.readdir(sourceDir);
        for (const file of files) {
            const ext = path.extname(file);
            if (ext === '.html') {
                const sourceFilePath = path.join(sourceDir, file);
                const destFilePath = path.join(destDir, path.basename(file, ext) + '.js');
                try {
                    const data = await fs.readFile(sourceFilePath, 'utf8');
                    const compiledContent = await compileToAOT(data);
                    await fs.writeFile(destFilePath, compiledContent, 'utf8');
                    console.log(`Archivo compilado exitosamente: ${destFilePath}`);
                } catch (readWriteError) {
                    console.error(`Error procesando el archivo ${sourceFilePath}:`, readWriteError);
                }
            }
        }
    } catch (err) {
        console.error('Error leyendo la carpeta de origen:', err);
    }
}

// Función principal
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Uso: node compile.js <carpeta-origen> <carpeta-destino>');
        process.exit(1);
    }
    const sourceDir = args[0];
    const destDir = args[1];
    // Verifica si la carpeta de origen existe
    try {
        await fs.access(sourceDir);
    } catch {
        console.error(`La carpeta de origen "${sourceDir}" no existe.`);
        process.exit(1);
    }
    // Crea la carpeta de destino si no existe
    try {
        await fs.mkdir(destDir, { recursive: true });
    } catch (mkdirError) {
        console.error(`Error creando la carpeta de destino "${destDir}":`, mkdirError);
        process.exit(1);
    }
    // Compila los archivos HTML
    await compileHtmlFiles(sourceDir, destDir);
}

// Ejecuta la función principal
main().catch(err => {
    console.error('Error en la ejecución principal:', err);
    process.exit(1);
});
