// Keep dynamic compilation outside the AOT runtime dependency graph.
import { GGenerator } from './GGeneratorRuntime';
export { GGenerator, GAddTo, GInsertAfterTo, GInsertBeforeTo, GregisterDirective, GAddArributes } from './GGeneratorRuntime';

export function GCompile(gcode: string, generator?: any): any {
    return new Function('g', `return ${gcode};`)(generator || GGenerator);
}
