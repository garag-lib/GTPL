import { GTpl } from "../GTpl";
import { STACK, css2obj, style2css } from "../GUtils";
import { GCode } from "../compiler/GCode";
declare const _default: {
    GTpl: typeof GTpl;
    GGenerator: (nodeName: string, attributes: import("../GGenerator").AttrType[], fncChilds: Function, objRoot: import("../GGenerator").IGtplObject) => any;
    GAddToo: (ele: any[] | Node, childs: Function | any[] | Node, objRoot: import("../GGenerator").IGtplObject) => void;
    jit: {
        GCompile: (gcode: string, ggenerator?: any) => any;
        GCode: typeof GCode;
    };
    utils: {
        stack: typeof STACK;
        css2obj: typeof css2obj;
        style2css: typeof style2css;
        globalObject: any;
        passiveSupported: boolean | null;
        PROXYTARGET: symbol;
        ISPROXY: symbol;
    };
};
export default _default;
