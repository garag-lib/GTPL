import runtime from './runtime';
import { GCompile } from '../GGenerator';
import { GCode, GCodeOptimized } from '../compiler/GCode';

export default {
    ...runtime,
    jit: { GCompile, GCode, GCodeOptimized }
};
