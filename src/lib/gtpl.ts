
import { GTpl } from "../GTpl";
import { GGenerator, GCompile, GAddTo, GregisterDirective, GInsertAfterTo, GInsertBeforeTo } from "../GGenerator";
import { STACK, css2obj, log, style2css } from "../GUtils";
import { GCode } from "../compiler/GCode";
import { globalObject, passiveSupported } from "../global";
import { GProxy, isGProxy, ISPROXY, PROXYTARGET, toRaw, unGProxy } from "../GProxy";

export default {
    'GTpl': GTpl,
    'GAddTo': GAddTo,
    'GInsertAfterTo': GInsertAfterTo,
    'GInsertBeforeTo': GInsertBeforeTo,
    'GregisterDirective': GregisterDirective,
    'GGenerator': GGenerator,
    'GProxy': GProxy,
    'unGProxy': unGProxy,
    'jit': {
        'GCompile': GCompile,
        'GCode': GCode
    },
    'utils': {
        'log': log,
        'stack': STACK,
        'css2obj': css2obj,
        'style2css': style2css,
        'globalObject': globalObject,
        'passiveSupported': passiveSupported,
        'isGProxy': isGProxy,
        'toRaw': toRaw,
        'PROXYTARGET': PROXYTARGET,
        'ISPROXY': ISPROXY
    }
};
