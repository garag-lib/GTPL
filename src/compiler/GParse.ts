import { IVarOrConst, IFunction, IObjParsed, TplVar } from '../GEnums';
import { globalObject } from '../global';

const palabrasReservadas = [
    "abstract", "await", "boolean", "break", "byte", "case", "catch",
    "char", "class", "const", "continue", "debugger", "default", "delete",
    "do", "double", "else", "enum", "export", "extends", "false", "final",
    "finally", "float", "for", "function", "goto", "if", "implements", "import",
    "in", "instanceof", "int", "interface", "let", "long", "native", "new",
    "null", "package", "private", "protected", "public", "return", "short",
    "static", "super", "switch", "synchronized", "this", "throw", "throws",
    "transient", "true", "try", "typeof", "var", "void", "volatile", "while",
    "with", "yield", "arguments", "async", "eval", "undefined"
];

export class GParse {

    private s!: string;
    private i!: number;
    private l!: number;
    private r!: (string | IObjParsed)[];
    private arr_acepted!: number[];
    private ln!: string | null;

    constructor() {
        this.setAceptedAN();
    }

    getResult(): (string | IObjParsed)[] {
        return this.r;
    }

    getSingleResult(): IObjParsed {
        let result: any = null;
        if (this.r && this.r.length == 1)
            result = this.r[0];
        return result;
    }

    setString(str: string) {
        this.s = str;
        this.l = str.length;
        this.i = 0;
        this.r = [];
    }

    setAceptedAN(acepted: string = '_') {
        this.arr_acepted = Array.from(acepted).map((c: string) => c.charCodeAt(0));
    }

    checkStart(): boolean {
        return (this.i + 1 < this.l) && (this.s[this.i] === '{' && this.s[this.i + 1] === '{');
    }

    checkEnd(): boolean {
        return (this.i + 1 < this.l) && (this.s[this.i] === '}' && this.s[this.i + 1] === '}');
    }

    next() {
        this.i++;
        if (this.i >= this.l)
            return false;
        return true;
    }

    nop(all: boolean = false, cstop: string[] | null = null): boolean {
        let cnow: null | string = null;
        this.ln = null;
        while (true) {
            cnow = this.s[this.i];
            if (cstop && cstop.includes(cnow))
                return true;
            let ok = (cnow == ' ' || cnow == '\t' || cnow == '\r' || cnow == '\n');
            if (!ok && all) {
                ok = (cnow != '"' && cnow != "'" && !this.isAN(cnow));
                if (ok) {
                    this.ln = cnow;
                }
            }
            if (ok) {
                if (!this.next())
                    return false;
                continue;
            }
            return true;
        }
    }

    isAN(str: string, firstCanNumber: boolean = true) {
        if (str == undefined)
            return false;
        let ok: boolean;
        for (let i = 0, n = str.length, code = 0; i < n; i++) {
            code = str.charCodeAt(i);
            ok = (code > 64 && code < 91) || (code > 96 && code < 123) || this.arr_acepted.indexOf(code) >= 0;
            if (firstCanNumber)
                ok = ok || (code > 47 && code < 58);
            if (ok)
                continue;
            return false
        }
        return true;
    }

    getVOrC(): null | IVarOrConst {
        let cnow = this.s[this.i];
        if (cnow == '"' || cnow == "'") {
            return { ct: this.getConst() };
        } else if (this.isAN(cnow, false)) {
            return { va: this.getVar() };
        } else if (this.isNumber(cnow)) {
            const temp = this.i;
            const num = this.getNumber();
            if (num !== null)
                return { ct: num };
            this.i = temp;
        }
        return null;
    }

    getVar(point: boolean = true): null | string[] {
        let str = this.s[this.i], cnow: null | string = null, acepted: boolean;
        while (true) {
            if (!this.next())
                return str != '' ? str.split('.') : null;
            cnow = this.s[this.i];
            acepted = this.isAN(cnow);
            if (point && !acepted)
                acepted = cnow == '.';
            if (acepted) {
                str += cnow;
                continue;
            } else {
                return str.split('.');
            }
        };
    }

    getConst(): null | string {
        const into = this.s[this.i];
        if (!this.next())
            return null;
        let str = this.s[this.i];
        if (str == into) {
            str = '';
            if (!this.next())
                return null;
            return str;
        }
        let cnow: null | string = null, clast: null | string = null;
        while (true) {
            if (!this.next())
                return null;
            cnow = this.s[this.i];
            if (cnow == into && clast != '\\') {
                if (!this.next())
                    return null;
                return str;
            }
            str += cnow;
            clast = cnow;
        }
    }

    isNumber(char: string): boolean {
        const code = char.charCodeAt(0);
        return code >= 48 && code <= 57;
    }

    getNumber(): null | string {
        let str = this.s[this.i];
        let cnow: null | string = null;
        let hasDecimalPoint = false;
        while (true) {
            if (!this.next())
                break;
            cnow = this.s[this.i];
            if (cnow == '.') {
                if (hasDecimalPoint)
                    return null;
                hasDecimalPoint = true;
            } else if (!this.isNumber(cnow)) {
                break;
            }
            str += cnow;
        }
        return str;
    }

    check(): boolean {

        let i = 0;
        let temp = '';
        let obj: IObjParsed;
        let vorc: null | IVarOrConst;
        let cnow: string;
        let thereare: boolean = false;

        while (true) {

            if (this.checkStart()) {

                thereare = true;

                if (temp != '') {
                    this.r.push(temp);
                    temp = '';
                }

                obj = {};

                this.i += 2;

                i = this.i;

                if (!this.nop())
                    return false;

                vorc = this.getVOrC();

                if (vorc) {

                    obj.vorc = vorc;

                    while (true) {

                        if (!this.nop())
                            return false;

                        cnow = this.s[this.i];

                        if (cnow == ':') {

                            if (!this.next())
                                return false;

                            if (!this.nop())
                                return false;

                            const fnc = this.getVar();

                            if (fnc === null)
                                return false;

                            if (!obj.functions)
                                obj.functions = [];

                            const func: IFunction = { name: fnc };

                            obj.functions.push(func);

                            if (!this.nop())
                                return false;

                            cnow = this.s[this.i];

                            if (cnow == '(') {

                                if (!this.next())
                                    return false;

                                if (!this.nop())
                                    return false;

                                cnow = this.s[this.i];

                                if (cnow == undefined)
                                    break;

                                if (cnow == ')') {
                                    if (!this.next())
                                        return false;
                                    continue;
                                }

                                while (true) {

                                    vorc = this.getVOrC();

                                    if (!vorc)
                                        return false;

                                    if (!func.params)
                                        func.params = [];

                                    func.params.push(vorc);

                                    if (!this.nop())
                                        return false;

                                    cnow = this.s[this.i];

                                    if (cnow == undefined)
                                        break;

                                    if (cnow == ',') {
                                        if (!this.next())
                                            return false;
                                        if (!this.nop())
                                            return false;
                                        continue;
                                    }

                                    if (cnow == ')') {
                                        if (!this.next())
                                            return false;
                                        if (!this.nop())
                                            return false;
                                        break;
                                    }

                                }

                            }

                            continue;

                        }

                        break;

                    }

                    cnow = this.s[this.i];

                    if (cnow == '{') {

                        if (!this.next())
                            return false;

                        while (true) {

                            if (!this.nop())
                                return false;

                            cnow = this.s[this.i];

                            if (cnow == undefined)
                                break;

                            if (cnow == '}') {
                                if (!this.next())
                                    return false;
                                if (!this.nop())
                                    return false;
                                break;
                            }

                            // Si se encuentra una coma, se omite y se continúa
                            if (cnow == ',') {
                                if (!this.next())
                                    return false;
                                continue;
                            }

                            vorc = this.getVOrC();

                            if (!vorc)
                                return false;

                            if (!obj.params)
                                obj.params = [];

                            obj.params.push(vorc);
                        }
                    }

                    cnow = this.s[this.i];

                    if (cnow == ';') {

                        if (!this.next())
                            return false;

                        if (!this.nop())
                            return false;

                        const index = this.getVar(false);

                        if (index === null)
                            return false;

                        if (!this.nop())
                            return false;

                        cnow = this.s[this.i];

                        if (cnow == ';') {

                            if (!this.next())
                                return false;

                            if (!this.nop())
                                return false;

                            const target = this.getVar(false);

                            if (target === null)
                                return false;

                            obj.index = { index: index.join(''), target: target.join('') };

                        } else {

                            return false;

                        }

                    }

                    if (!this.nop())
                        return false;

                    if (this.checkEnd()) {

                        this.i++;

                        this.r.push(obj);

                    } else {

                        if (!this.searchFormula(i))
                            return false;

                    }

                } else {

                    if (!this.searchFormula(i))
                        return false;

                }

            } else {

                temp += this.s[this.i];

            }

            if (!this.next())
                break;

        }

        if (temp != '')
            this.r.push(temp);

        return thereare;

    }

    searchFormula(i: number): boolean {

        let temp = this.s.substring(i, this.i);

        while (true) {

            if (this.checkEnd()) {

                this.i++;

                this.r.push({ formula: { code: temp, vars: this.findVars(temp) } });

                temp = '';

                break;

            } else {

                temp += this.s[this.i];

                if (!this.next())
                    return false;

            }

        }

        return true;
    }

    findVars(str: string): TplVar[] {

        let codeToParse = str.trim();

        // Guardar estado original
        const originalS = this.s;
        const originalI = this.i;
        const originalL = this.l;

        // Inicializar con el código a analizar
        this.s = codeToParse;
        this.l = codeToParse.length;
        this.i = 0;
        let freeVars: TplVar[] = [];
        // Pila de ámbitos para registrar variables declaradas localmente
        let ignoreStack: string[][] = [[]];

        const addToIgnore = (name: string) => {
            ignoreStack[ignoreStack.length - 1].push(name);
        };

        const isIgnored = (name: string) => {
            return ignoreStack.some(ctx => ctx.indexOf(name) >= 0);
        };

        const skipWhitespace = () => {
            while (this.i < this.l && /\s/.test(this.s[this.i])) {
                this.i++;
            }
        };

        const skipStringLiteral = (quote: string) => {
            this.i++; // saltar la apertura
            while (this.i < this.l) {
                if (this.s[this.i] === '\\') {
                    this.i += 2;
                } else if (this.s[this.i] === quote) {
                    this.i++;
                    break;
                } else {
                    this.i++;
                }
            }
        };

        const skipTemplateLiteral = () => {
            this.i++; // saltar el backtick de apertura
            while (this.i < this.l) {
                if (this.s[this.i] === '\\') {
                    this.i += 2;
                } else if (this.s[this.i] === '$' && this.s[this.i + 1] === '{') {
                    this.i += 2; // saltar "${"
                    let braceCount = 1;
                    const exprStart = this.i;
                    while (this.i < this.l && braceCount > 0) {
                        if (this.s[this.i] === '{') {
                            braceCount++;
                        } else if (this.s[this.i] === '}') {
                            braceCount--;
                        }
                        this.i++;
                    }
                    // Procesar la expresión incrustada de forma recursiva
                    const expr = this.s.substring(exprStart, this.i - 1);
                    const subVars = this.findVars(expr);
                    subVars.forEach(token => {
                        if (!isIgnored(token[0]) && !freeVars.some(v => v[0] === token[0])) {
                            freeVars.push(token);
                        }
                    });
                } else if (this.s[this.i] === '`') {
                    this.i++; // saltar el backtick de cierre
                    break;
                } else {
                    this.i++;
                }
            }
        };

        // Utiliza el método getVOrC() existente para extraer tokens (variables o literales)
        const extractToken = (): TplVar | null => {
            // Capturamos la posición de inicio del token
            const tokenStart = this.i;
            const tokenObj = this.getVOrC();
            if (tokenObj && tokenObj.va) {
                // Retrocedemos ignorando espacios en blanco
                let j = tokenStart - 1;
                while (j >= 0 && /\s/.test(this.s[j])) {
                    j--;
                }
                // Si encontramos un punto antes, descartamos el token
                if (j >= 0 && this.s[j] === '.') {
                    return null;
                }
                return tokenObj.va;
            }
            return null;
        };

        // Intenta procesar parámetros de arrow function: (a, b) =>
        const tryParseArrowParams = () => {
            if (this.s[this.i] !== '(') return false;
            const startParen = this.i;
            let parenCount = 0;
            while (this.i < this.l) {
                const ch = this.s[this.i];
                if (ch === '(') {
                    parenCount++;
                } else if (ch === ')') {
                    parenCount--;
                    if (parenCount === 0) break;
                }
                this.i++;
            }
            const paramsStr = this.s.substring(startParen + 1, this.i);
            this.i++; // saltar el cierre ')'
            skipWhitespace();
            if (this.s.substr(this.i, 2) === '=>') {
                paramsStr.split(',').forEach(param => {
                    const trimmed = param.trim();
                    if (trimmed) addToIgnore(trimmed);
                });
                this.i += 2; // saltar "=>"
                return true;
            }
            return false;
        };

        // Detección especial para la cláusula catch: catch(error)
        const tryParseCatchClause = () => {
            if (this.s.substr(this.i, 5) === "catch") {
                this.i += 5; // saltar "catch"
                skipWhitespace();
                if (this.s[this.i] === '(') {
                    this.i++; // saltar "("
                    skipWhitespace();
                    const errorToken = extractToken();
                    if (errorToken) {
                        addToIgnore(errorToken[0]);
                    }
                    // Saltar hasta el cierre ")"
                    while (this.i < this.l && this.s[this.i] !== ')') {
                        this.i++;
                    }
                    if (this.s[this.i] === ')') {
                        this.i++;
                    }
                }
                return true;
            }
            return false;
        };

        // Manejo especial para declaraciones de funciones
        const tryParseFunctionDeclaration = () => {
            // Si se detecta la palabra "function"
            if (this.s.substr(this.i, 8) === "function") {
                this.i += 8;
                // Opcionalmente, se puede extraer el nombre de la función
                skipWhitespace();
                const maybeName = extractToken();
                if (maybeName) {
                    addToIgnore(maybeName[0]);
                }
                skipWhitespace();
                // Procesar los parámetros que vienen entre paréntesis
                if (this.s[this.i] === '(') {
                    this.i++; // saltar '('
                    let params = "";
                    while (this.i < this.l && this.s[this.i] !== ')') {
                        params += this.s[this.i];
                        this.i++;
                    }
                    if (this.s[this.i] === ')') {
                        this.i++; // saltar ')'
                    }
                    params.split(',').forEach(param => {
                        const trimmed = param.trim();
                        if (trimmed) addToIgnore(trimmed);
                    });
                }
                return true;
            }
            return false;
        };

        // Palabras clave para declaraciones (además de las reservadas)
        const declares = ['const', 'var', 'let', 'function'];

        // Bucle principal de análisis
        while (this.i < this.l) {
            skipWhitespace();
            if (this.i >= this.l) break;
            const ch = this.s[this.i];

            // Procesar cláusula catch para declarar su variable
            if (this.s.substr(this.i, 5) === "catch") {
                tryParseCatchClause();
                continue;
            }

            // Procesar declaraciones de función
            if (this.s.substr(this.i, 8) === "function") {
                tryParseFunctionDeclaration();
                continue;
            }

            // Saltar comentarios de línea y bloque
            if (ch === '/' && this.s[this.i + 1] === '/') {
                this.i += 2;
                while (this.i < this.l && this.s[this.i] !== '\n') this.i++;
                continue;
            }
            if (ch === '/' && this.s[this.i + 1] === '*') {
                this.i += 2;
                while (this.i < this.l && !(this.s[this.i] === '*' && this.s[this.i + 1] === '/')) this.i++;
                this.i += 2;
                continue;
            }
            // Saltar literales de cadena
            if (ch === '"' || ch === "'") {
                skipStringLiteral(ch);
                continue;
            }
            // Procesar template literal
            if (ch === '`') {
                skipTemplateLiteral();
                continue;
            }
            // Control de ámbito: cuando se abre un bloque, se agrega un nuevo contexto; se elimina al cerrar
            if (ch === '{') {
                ignoreStack.push([]);
                this.i++;
                continue;
            }
            if (ch === '}') {
                ignoreStack.pop();
                this.i++;
                continue;
            }
            // Detectar parámetros de arrow function
            if (ch === '(') {
                const prevI = this.i;
                if (tryParseArrowParams()) continue;
                else this.i = prevI;
            }

            // Intentar extraer un token (variable o literal numérico)
            const token = extractToken();
            if (token) {
                // Si el token es palabra clave de declaración, se espera el siguiente token (la variable a declarar)
                if (declares.indexOf(token[0]) >= 0) {
                    skipWhitespace();
                    const declared = extractToken();
                    if (declared) {
                        addToIgnore(declared[0]);
                    }
                    continue;
                }
                // Filtrar variables globales (por ejemplo, Math, etc.) y palabras reservadas
                if (globalObject[token[0]] !== undefined) {
                    continue;
                }
                if (palabrasReservadas.indexOf(token[0]) >= 0) {
                    continue;
                }
                // Evitar tokens que formen parte de la sintaxis de un objeto (si le sigue ":")
                let j = this.i;
                while (j < this.l && /\s/.test(this.s[j])) { j++; }
                if (this.s[j] === ':') {
                    continue;
                }
                // Si ya se declaró en algún ámbito, se ignora
                if (isIgnored(token[0])) continue;
                // Se agrega a freeVars solo si aún no está incluido
                if (!freeVars.some(v => v[0] === token[0])) {
                    freeVars.push(token);
                }
                continue;
            }
            // Avanzar un carácter para evitar bucles infinitos
            this.i++;
        }

        // Restaurar estado original
        this.s = originalS;
        this.i = originalI;
        this.l = originalL;
        return freeVars;
    }


}