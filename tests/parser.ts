// extensiveTestParserWithExpected.ts
import { GParse } from '../src/compiler/GParse';

interface TestCase {
    description: string;
    input: string;
    // Si se espera que la prueba se ejecute correctamente, se define "expected"
    // Si se espera error, se marca "expectError" y se puede definir "errorMessage" (substring a buscar)
    expected?: any;
    expectError?: boolean;
    errorMessage?: string;
}

/**
 * Compara dos valores de forma profunda usando JSON.stringify.
 * NOTA: Esto asume que el orden de las propiedades es consistente.
 */
function deepEqual(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Ejecuta todos los casos de prueba comparando el resultado del parser con el esperado.
 */
function runTests() {
    const testCases: TestCase[] = [
        // Texto sin bloques dinámicos
        {
            description: "Texto sin bloques",
            input: "Este es un texto simple sin ningún bloque dinámico.",
            expected: ["Este es un texto simple sin ningún bloque dinámico."]
        },
        // Bloque simple de variable
        {
            description: "Bloque simple con variable",
            input: "Variable: {{myVariable}}",
            expected: ["Variable: ", { vorc: { va: ["myVariable"] } }]
        },
        // Bloque simple de constante (comillas simples)
        {
            description: "Bloque simple con constante (comillas simples)",
            input: "Constante: {{'Hello World'}}",
            expected: ["Constante: ", { vorc: { ct: "Hello World" } }]
        },
        // Bloque simple de constante (comillas dobles)
        {
            description: "Bloque simple con constante (comillas dobles)",
            input: "Constante: {{\"Hello World\"}}",
            expected: ["Constante: ", { vorc: { ct: "Hello World" } }]
        },
        // Bloque con función sin parámetros
        {
            description: "Bloque con función sin parámetros",
            input: "Función sin parámetros: {{myVar: myFunction()}}",
            expected: [
                "Función sin parámetros: ", {
                    vorc: {
                        va: ["myVar"]
                    },
                    functions: [
                        { name: ["myFunction"] }
                    ]
                }
            ]
        },
        // Bloque con función y múltiples parámetros
        {
            description: "Bloque con función y parámetros múltiples",
            input: "Función con parámetros: {{user: formatName(firstName, lastName, 'Mr.', 42)}}",
            expected: [
                "Función con parámetros: ",
                {
                    vorc: { va: ["user"] },
                    functions: [
                        {
                            name: ["formatName"],
                            params: [
                                { va: ["firstName"] },
                                { va: ["lastName"] },
                                { ct: "Mr." },
                                { ct: "42" }
                            ]
                        }
                    ]
                }
            ]
        },
        // Bloque con índice mediante doble punto y coma
        {
            description: "Bloque con índice (dos ';')",
            input: "Índice: {{data; indexValue; targetValue}}",
            expected: [
                "Índice: ",
                {
                    vorc: { va: ["data"] },
                    index: {
                        index: "indexValue",
                        target: "targetValue"
                    }
                }
            ]
        },
        // Varios bloques en un mismo texto
        {
            description: "Múltiples bloques en un texto",
            input: "Inicio {{var1}} medio {{'constant'}} final {{obj: func(param)}}",
            expected: [
                "Inicio ",
                { vorc: { va: ["var1"] } },
                " medio ",
                { vorc: { ct: "constant" } },
                " final ",
                {
                    vorc: { va: ["obj"] },
                    functions: [
                        {
                            name: ["func"],
                            params: [
                                { va: ["param"] }
                            ]
                        }
                    ]
                }
            ]
        },
        // Bloque con comillas escapadas
        {
            description: "Bloque con comillas escapadas",
            input: `Escapado: {{"He said \\"Hello\\" and left"}}`,
            expected: [
                "Escapado: ",
                { vorc: { ct: "He said \"Hello\" and left" } }
            ]
        },
        // Bloque con fórmula aritmética simple
        {
            description: "Bloque con fórmula aritmética simple",
            input: "Fórmula: {{a + b * (c - d)}}",
            expected: [
                "Fórmula: ",
                {
                    formula: {
                        code: "a + b * (c - d)",
                        vars: [["a"], ["b"], ["c"], ["d"]]
                    }
                }
            ]
        },
        // Bloque con número entero
        {
            description: "Bloque con número entero",
            input: "Número entero: {{123456}}",
            expected: [
                "Número entero: ",
                { vorc: { ct: "123456" } }
            ]
        },
        // Bloque con número decimal
        {
            description: "Bloque con número decimal",
            input: "Número decimal: {{3.14159}}",
            expected: [
                "Número decimal: ",
                { vorc: { ct: "3.14159" } }
            ]
        },
        // Bloque con arrow function
        {
            description: "Bloque con arrow function",
            input: "Arrow function: {{ (x) => x * 2 }}",
            expected: [
                "Arrow function: ",
                {
                    formula:
                    {
                        code: " (x) => x * 2 ",
                        vars: [["x"]]
                    }
                }
            ]
        },
        // Bloque con espacios y saltos de línea extra
        {
            description: "Bloque con espacios y saltos de línea",
            input: "Espacios: {{   varConEspacios   :   myFunc(  arg1 , 'arg 2'  )   }}",
            expected: [
                "Espacios: ",
                {
                    vorc: { va: ["varConEspacios"] },
                    functions: [
                        {
                            name: ["myFunc"],
                            params: [
                                { va: ["arg1"] },
                                { ct: "arg 2" }
                            ]
                        }
                    ]
                }
            ]
        },
        // Bloque con fórmula que involucra paréntesis anidados
        {
            description: "Bloque con fórmula con paréntesis anidados",
            input: "Anidado: {{(a + (b - c)) * d}}",
            expected: [
                "Anidado: ",
                {
                    formula:
                    {
                        code: "(a + (b - c)) * d",
                        vars: [["a"], ["b"], ["c"], ["d"]]
                    }
                }
            ]
        },
        // Bloque que usa palabras reservadas (estas deberían ignorarse si están en contexto)
        {
            description: "Bloque con palabra reservada como variable",
            input: "Reservada: {{function}}",
            expected: [
                "Reservada: ",
                { vorc: { va: ["function"] } }
            ]
        },
        // Bloque con variable seguida de punto (acceso a propiedad)
        {
            description: "Bloque con acceso a propiedad",
            input: "Acceso: {{user.name}}",
            expected: [
                "Acceso: ",
                { vorc: { va: ["user", "name"] } }
            ]
        },
        // Bloque con contenido mixto de texto y bloques (prueba de continuidad)
        {
            description: "Texto mixto con bloques intercalados",
            input: "Inicio {{var1}} medio texto {{'constante'}} y más texto {{obj:func(param1,param2)}} fin.",
            expected: [
                "Inicio ",
                { vorc: { va: ["var1"] } },
                " medio texto ",
                { vorc: { ct: "constante" } },
                " y más texto ",
                {
                    vorc: { va: ["obj"] },
                    functions: [
                        {
                            name: ["func"],
                            params: [
                                { va: ["param1"] },
                                { va: ["param2"] }
                            ]
                        }
                    ]
                },
                " fin."
            ]
        },
        {
            description: "Bloque con función y parámetros entre llaves",
            input: "Funcion con llaves: {{ campo : function { params1, params2, \"ct1\", 'ct2' } }}",
            expected: [
                "Funcion con llaves: ",
                {
                    vorc: {
                        va: ["campo"]
                    },
                    functions: [
                        { name: ["function"] }
                    ],
                    params: [
                        { va: ["params1"] },
                        { va: ["params2"] },
                        { ct: "ct1" },
                        { ct: "ct2" }
                    ]
                }
            ]
        },
        {
            description: "Fórmula completa con código JavaScript avanzado (extenso)",
            input: `Complejo Extenso: {{(a, b) => {
                          // Declaración de variables locales
                          const c = a + b;
                          let d = c * 2;
                          "1,2,3,4,5,6".split(',');
                          function pepe(uno, dos, tres) {  console.log(tres); }
                          // Objeto literal con función arrow y objeto anidado
                          const obj = {
                            x: d,
                            y: (e) => e + c,
                            z: { p: d, q: Math.min(a, b) }
                          };
                          // Bloque try/catch para manejar errores
                          try {
                            const result = obj.y(d);
                            // Uso de template literal para formar el string de retorno
                            return \`Result: \${result} and extra: \${external3} and \${b}\`;
                          } catch(err) {
                            return err.message;
                          }
                        }
                        (external1, external2);}}`,
            expected: [
                "Complejo Extenso: ",
                {
                    formula: {
                        code: `(a, b) => {
                          // Declaración de variables locales
                          const c = a + b;
                          let d = c * 2;
                          "1,2,3,4,5,6".split(',');
                          function pepe(uno, dos, tres) {  console.log(tres); }
                          // Objeto literal con función arrow y objeto anidado
                          const obj = {
                            x: d,
                            y: (e) => e + c,
                            z: { p: d, q: Math.min(a, b) }
                          };
                          // Bloque try/catch para manejar errores
                          try {
                            const result = obj.y(d);
                            // Uso de template literal para formar el string de retorno
                            return \`Result: \${result} and extra: \${external3} and \${b}\`;
                          } catch(err) {
                            return err.message;
                          }
                        }
                        (external1, external2);`,
                        vars: [["external3"], ["external1"], ["external2"]]
                    }
                }
            ]
        }


    ];

    let passed = 0;
    let failed = 0;
    const solo_este = 20;

    testCases.forEach((test, index) => {
        if (solo_este !== null && (index + 1) != solo_este)
            return;
        console.log(`\nTest #${index + 1}: ${test.description}`);
        console.log(`Input: ${test.input}`);
        const parser = new GParse();
        parser.setString(test.input);
        parser.check();
        const actual = parser.getResult();
        if (deepEqual(actual, test.expected)) {
            console.log("✅ OK - Resultado correcto.");
            passed++;
        } else {
            console.error("❌ ERROR - Resultado incorrecto.");
            console.error("Esperado:\n", JSON.stringify(test.expected));
            console.error("Obtenido:\n", JSON.stringify(actual));
            failed++;
        }
    });
    console.log(`\nResumen de pruebas: ${passed} OK, ${failed} fallidas.`);
}

runTests();
