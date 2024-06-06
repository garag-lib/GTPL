import { IVarOrConst, IFunction, IObjParsed } from '../GGenerator';
import { TplVar } from '../GGenerator';
import { globalObject } from '../global.js';

const palabrasReservadas = [
    "abstract", "await", "boolean", "break", "byte", "case", "catch",
    "char", "class", "const", "continue", "debugger", "default", "delete",
    "do", "double", "else", "enum", "export", "extends", "false", "final",
    "finally", "float", "for", "function", "goto", "if", "implements", "import",
    "in", "instanceof", "int", "interface", "let", "long", "native", "new",
    "null", "package", "private", "protected", "public", "return", "short",
    "static", "super", "switch", "synchronized", "this", "throw", "throws",
    "transient", "true", "try", "typeof", "var", "void", "volatile", "while",
    "with", "yield", "arguments", "await", "async", "eval"
];

export class GParse {

    private s!: string;
    private i!: number;
    private l!: number;
    private r!: (string | IObjParsed)[];
    private arr_acepted!: number[];

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

    checkStart(): boolean {
        return this.s[this.i] == '{' && this.s[this.i + 1] == '{';
    }

    checkEnd(): boolean {
        return this.s[this.i] == '}' && this.s[this.i + 1] == '}';
    }

    next() {
        this.i++;
        if (this.i >= this.l)
            return false;
        return true;
    }

    nop(all: boolean = false, cstop: string | null = null): boolean {
        let cnow = null;
        while (true) {
            cnow = this.s[this.i];
            if (cstop === cnow)
                return true;
            let ok = (cnow == ' ' || cnow == '\t' || cnow == '\r' || cnow == '\n');
            if (!ok && all)
                ok = (cnow != '"' && cnow != "'" && !this.isAN(cnow));
            if (ok) {
                if (!this.next())
                    return false;
                continue;
            }
            return true;
        }
    }

    getVOrC(): null | IVarOrConst {
        let cnow = this.s[this.i];
        if (cnow == '"' || cnow == "'") {
            return { ct: this.getConst() };
        } else if (this.isAN(cnow, false)) {
            return { va: this.getVar() };
        }
        return null;
    }

    getVar(point: boolean = true): null | string[] {
        let str = this.s[this.i], cnow = null, acepted: boolean;
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
            str == '';
            if (!this.next())
                return null;
            return str;
        }
        let cnow = null, clast = null;
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

                    cnow = this.s[this.i];

                    if (cnow == undefined)
                        break;

                    while (true) {

                        if (cnow == ':') {

                            if (!this.next())
                                return false;

                            const fnc = this.getVar();

                            if (fnc === null)
                                return false;

                            if (!obj.functions)
                                obj.functions = [];

                            const func: IFunction = { name: fnc };

                            obj.functions.push(func);

                            cnow = this.s[this.i];

                            if (cnow == undefined)
                                break;

                            if (cnow == '(') {

                                if (!this.next())
                                    return false;

                                cnow = this.s[this.i];

                                if (cnow == ')') {

                                    if (!this.next())
                                        return false;

                                    cnow = this.s[this.i];

                                    continue;
                                }

                                while (true) {

                                    vorc = this.getVOrC();

                                    if (!vorc)
                                        return false;

                                    cnow = this.s[this.i];

                                    if (!func.params)
                                        func.params = [];

                                    func.params.push(vorc);

                                    if (cnow == undefined)
                                        break;

                                    if (cnow == ',') {
                                        if (!this.next())
                                            return false;
                                        cnow = this.s[this.i];
                                        continue;
                                    }

                                    if (cnow == ')') {
                                        if (!this.next())
                                            return false;
                                        cnow = this.s[this.i];
                                        break;
                                    }

                                }

                            }

                        } else if (cnow == '#') {

                            if (!this.next())
                                return false;

                            vorc = this.getVOrC();

                            if (!vorc)
                                return false;

                            if (!obj.params)
                                obj.params = [];

                            obj.params.push(vorc);

                            cnow = this.s[this.i];

                        } else {

                            break;

                        }
                    }

                    if (cnow == ';') {

                        if (!this.next())
                            return false;

                        const index = this.getVar(false);

                        if (index === null)
                            return false;

                        cnow = this.s[this.i];

                        if (cnow == ';') {

                            if (!this.next())
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
        const s = this.s;
        const l = this.l;
        const i = this.i;
        this.s = str;
        this.l = str.length;
        this.i = 0;
        let arr: TplVar[] = [], ret: null | IVarOrConst = null;
        let ignoreall: boolean = false;
        let cstop: string | null = null;
        let ignore: any = [];
        while (true) {
            if (!this.nop(true, cstop))
                break;
            const current = this.s[this.i];
            if (current == '(') {
                ignoreall = true;
                cstop = ')';
                if (!this.nop(true, cstop))
                    break;
            }
            if (current == ')') {
                ignoreall = false;
                cstop = '{';
                if (!this.nop(true, cstop))
                    break;
            }
            if (current == '{') {
                cstop = '}';
                if (!this.nop(true, cstop))
                    break;
            }
            if (current == '}') {
                ignore.pop();
                cstop = null;
                if (!this.nop(true, cstop))
                    break;
            }
            ret = this.getVOrC();
            if (ret && ret.va) {
                const va = ret.va;
                if (palabrasReservadas.indexOf(va[0]) >= 0 ||
                    va[0] in Array.prototype ||
                    va[0] in Object.prototype) {
                    if (ret.va[0] == 'function') {
                        ignore.push([]);
                        cstop = '(';
                    }
                    continue;
                }
                if (globalObject.hasOwnProperty(va[0]))
                    continue;
                if (ignoreall) {
                    ignore[ignore.length - 1].push(va[0]);
                } else {
                    if (ignore.length) {
                        if (ignore.some((list: any) => list.includes(va[0])))
                            continue;
                    }
                    if (!arr.some(list => list[0] == va[0]))
                        arr.push(va);
                }
            } else if (!this.next() /*&& this.isArrowFunction()*/) {
                break;
            }
        }
        this.s = s;
        this.i = i;
        this.l = l;
        return arr;
    }

    isArrowFunction(): boolean {

        console.error(this.s[this.i]);

        return true;
        /*
        // Save current index
        const savedIndex = this.i;
        // Move backwards to check for "=>" indicating an arrow function
        while (this.i > 0 && (this.s[this.i] === ' ' || this.s[this.i] === '\t' || this.s[this.i] === '\n')) {
            this.i--;
        }
        // Check for arrow function "=>"
        if (this.s[this.i] === '>' && this.i > 0 && this.s[this.i - 1] === '=') {
            this.i = savedIndex;
            return true;
        }
        // Restore original index and return false
        this.i = savedIndex;
        return false;
        */
    }

}