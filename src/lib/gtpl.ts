
import { GTpl } from "../GTpl";
import { GGenerator, GCompile, GAddToo } from "../GGenerator";
import { STACK, css2obj, style2css } from "../GUtils";
import { GCode } from "../compiler/GCode";
import { globalObject, passiveSupported } from "../global";
import { ISPROXY, PROXYTARGET } from "../GProxy";

export default {
    'GTpl': GTpl,
    'GGenerator': GGenerator,
    'GAddToo': GAddToo,
    'jit': {
        'GCompile': GCompile,
        'GCode': GCode
    },
    'utils': {
        'stack': STACK,
        'css2obj': css2obj,
        'style2css': style2css,
        'globalObject': globalObject,
        'passiveSupported': passiveSupported,
        'PROXYTARGET': PROXYTARGET,
        'ISPROXY': ISPROXY
    }
};
