
import { GTpl } from "../GTpl";
import { GGenerator, GCompile, GAddToo } from "../GGenerator";
import { STACK, activateMemoryLeakObserver, css2obj, style2css } from "../GUtils";
import { GCode } from "../compiler/GCode";
import { globalObject, passiveSupported } from "../global";
import { enableScheduledHandlers, flushHandlers, isGProxy, ISPROXY, PROXYTARGET, runInBatch, unGProxy } from "../GProxy";

export default {
    'GTpl': GTpl,
    'GGenerator': GGenerator,
    'GAddToo': GAddToo,
    'GEnableScheduled': enableScheduledHandlers,
    'GScheduledBatch': runInBatch,
    'GFlush': flushHandlers,
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
        'isGProxy': isGProxy,
        'unGProxy': unGProxy,
        'PROXYTARGET': PROXYTARGET,
        'ISPROXY': ISPROXY,
        'activateMemoryLeakObserver': activateMemoryLeakObserver
    }
};
