import { GCode } from '../src/compiler/GCode';
import { GParse } from '../src/compiler/GParse'; // Added GParse for GCode's internal workings
import { globalObject } from '../src/global'; // Added for DOMParser mock

// Mocking DOMParser and fetch if they are used by GCode and not available in Node.js
if (typeof DOMParser === 'undefined') {
    globalObject.DOMParser = class DOMParser {
        parseFromString(html: string, type: string): Document {
            // A very basic mock. For more complex scenarios, a more robust jsdom-like environment might be needed.
            // This mock currently doesn't fully replicate browser DOM structure or full API.
            const doc = {
                body: {
                    childNodes: [] as any[], // Simulate childNodes
                    // Add other properties/methods if GCode relies on them
                },
                // Add other document properties/methods if GCode relies on them
                createDocumentFragment: function() { // Example: mock createDocumentFragment
                    return { appendChild: function() {}, childNodes: [] };
                },
                getElementById: function(id: string) { // Example: mock getElementById
                    return null; 
                }
            };
            // Super simple way to represent elements and text nodes for basic tests
            // This will need to be more sophisticated for real testing.
            // More sophisticated parsing for attributes and content
            const elementMatch = html.match(/<([a-zA-Z0-9]+)([^>]*)>(.*?)<\/\1>/);
            if (elementMatch) {
                const tagName = elementMatch[1].toUpperCase();
                const attributesStr = elementMatch[2];
                const innerHTML = elementMatch[3];

                const attributes: { name: string; value: string }[] = [];
                // Enhanced regex to support attributes like g-on:click
                const attrRegex = /([a-zA-Z0-9\-_:]+)=["'](.*?)["']/g; 
                let attrMatch;
                while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
                    attributes.push({ name: attrMatch[1], value: attrMatch[2] });
                }

                const childNodes: any[] = [];
                if (innerHTML) {
                    // Basic nested parsing for one level, specific for <ul><li...></ul>
                    if (tagName === 'UL' && innerHTML.startsWith("<li")) {
                        const liMatch = innerHTML.match(/<li([^>]*)>(.*?)<\/li>/);
                        if (liMatch) {
                            const liTagName = 'LI';
                            const liAttributesStr = liMatch[1];
                            const liInnerHTML = liMatch[2];
                            const liAttributes: { name: string; value: string }[] = [];
                            const liAttrRegex = /([a-zA-Z0-9\-_:]+)=["'](.*?)["']/g;
                            let liAttrMatch;
                            while((liAttrMatch = liAttrRegex.exec(liAttributesStr)) !== null) {
                                liAttributes.push({ name: liAttrMatch[1], value: liAttrMatch[2] });
                            }
                            const liChildNodes: any[] = [];
                            if (liInnerHTML) { // Should be {{ item.name }}
                                liChildNodes.push({ nodeType: 3, nodeName: '#text', nodeValue: liInnerHTML });
                            }
                            childNodes.push({
                                nodeType: 1,
                                nodeName: liTagName,
                                attributes: liAttributes,
                                childNodes: liChildNodes,
                                textContent: liInnerHTML
                            });
                        }
                    } else {
                         // Fallback for non-nested or simple text content
                        childNodes.push({ nodeType: 3, nodeName: '#text', nodeValue: innerHTML });
                    }
                }
                
                const element = {
                    nodeType: 1,
                    nodeName: tagName,
                    attributes: attributes,
                    childNodes: childNodes,
                    textContent: innerHTML // Keep textContent for potential convenience
                };
                doc.body.childNodes.push(element);

            } else if (html.startsWith("<div>") && html.endsWith("</div>")) { // Basic check for a div (fallback for previous test)
                const textContent = html.substring(5, html.length - 6); // Extract content between <div> and </div>
                const textNode = { nodeType: 3, nodeName: '#text', nodeValue: textContent };
                const divElement = { 
                    nodeType: 1, 
                    nodeName: 'DIV', 
                    attributes: [] as any[], 
                    childNodes: [textNode] as any[],
                    textContent: textContent
                };
                doc.body.childNodes.push(divElement);
            } else if (html) { // Fallback for other simple HTML strings as a single text node
                const textNode = { nodeType: 3, nodeName: '#text', nodeValue: html };
                doc.body.childNodes.push(textNode);
            }
            return doc as unknown as Document;
        }
    };
}

if (typeof fetch === 'undefined') {
    globalObject.fetch = async (url: string): Promise<any> => {
        console.warn(`fetch mock called for: ${url}. Returning empty template.`);
        return {
            ok: true,
            text: async () => Promise.resolve('<template></template>') // Return an empty template string
        };
    };
}


interface GCodeTestCase {
    description: string;
    inputHtml: string;
    // For GCode, we're checking the generated function string.
    // We might check for substrings or use regex for more flexible assertions.
    expectedOutputPattern?: RegExp; // To check parts of the generated string
    expectedOutputSubstring?: string; // Simpler check for a substring
    expectError?: boolean;
    errorMessage?: string;
    setup?: () => void; // Optional setup for a test case, e.g., mocking parts of GParse
    cleanup?: () => void; // Optional cleanup
}

async function runGCodeTests() {
    const testCases: GCodeTestCase[] = [
        {
            description: "Test with simple static HTML",
            inputHtml: "<div>Hello World</div>",
            // Note: The exact regex might need tuning based on GCode's output specifics (e.g. spacing, quoting of nulls)
            expectedOutputPattern: /^\(o\)=>\[g\('div',\s*null\s*,\s*\[g\('#text',\s*"Hello World"\s*,\s*null\s*,\s*o\)\]\s*,\s*o\)\]$/,
        },
        {
            description: "Test with simple text interpolation", // Updated
            inputHtml: "<div>{{myVar}}</div>", // Updated
            expectedOutputPattern: /^\(o\)=>\[g\('div',\s*null\s*,\s*\[g\('#text',\s*'\[{"type":7,"prop":"textContent","link":{"vorc":{"va":\["myVar"\]}}}\]'\s*,\s*null\s*,\s*o\)\]\s*,\s*o\)\]$/, // New pattern
        },
        {
            description: "Test with static attributes and content",
            inputHtml: "<div id=\"foo\" class=\"bar\">Content</div>",
            expectedOutputPattern: /^\(o\)=>\[g\('div',\s*'\[\["id","foo"\],\["class","bar"\]\]'\s*,\s*\[g\('#text',\s*"Content"\s*,\s*null\s*,\s*o\)\]\s*,\s*o\)\]$/,
        },
        {
            description: "Test with a dynamic attribute",
            inputHtml: "<div class='{{ data.className }}'></div>",
            expectedOutputPattern: /^\(o\)=>\[g\('div',\s*'\[{"type":0,"prop":"class","link":{"vorc":{"va":\["data","className"\]}}}\]'\s*,\s*null\s*,\s*o\)\]$/,
        },
        {
            description: "Test with event handling g-on:click",
            inputHtml: "<button g-on:click='handleClick'>Click Me</button>",
            expectedOutputPattern: /^\(o\)=>\[g\('button',\s*'\[{"type":1,"prop":"click","link":{"vorc":{"va":\["handleClick"\]}}}\]'\s*,\s*\[g\('#text',\s*"Click Me"\s*,\s*null\s*,\s*o\)\]\s*,\s*o\)\]$/,
        },
        {
            description: "Test with conditional rendering g-if",
            inputHtml: "<div g-if=\"isVisible\">Conditional Content</div>", // Content updated
            expectedOutputPattern: new RegExp(
                `^\\(o\\)=>{` +
                `const ([a-z]\\d{5})=\\(\\(o\\)=>g\\('div',\\s*null\\s*,\\[g\\('#text',\\s*"Conditional Content",\\s*null\\s*,\\s*o\\)\\]\\s*,\\s*o\\)\\)\\((o|null)\\);` + // ID in group 1
                `return \\[` +
                `g\\('#comment',\\s*'\["\1",` + // Uses captured group 1 (ID)
                `{"type":2,"link":{"vorc":{"va":\\["isVisible"\\]}},"uid":"\1","gen":"\1"}` + // Uses captured group 1 (ID)
                `}\]',` +
                `\\s*null\\s*,\\s*o\\)` +
                `\\];?` + 
                `}$`
            ),
        },
        {
            description: "Test with looping g-for",
            inputHtml: "<ul><li g-for='item in items'>{{ item.name }}</li></ul>",
            expectedOutputPattern: new RegExp(
                `^\\(o\\)=>{` +
                `const ([a-z]\\d{5})=\\(\\(o\\)=>g\\('li',\\s*null\\s*,\\[g\\('#text',\\s*'\[{"type":7,"prop":"textContent","link":{"vorc":{"va":\\["item","name"\\]}}}\]',\\s*null,\\s*o\\)\\]\\s*,\\s*o\\)\\)\\((o|null)\\);` + // Captures li_content_id in group 1
                `return \\[` +
                `g\\('ul',\\s*null\\s*,\\[` +
                `g\\('#comment',\\s*'\["([a-z]\\d{5})",` + // Captures for_comment_id in group 2
                `{"type":3,"link":{"vorc":{"va":\\["items"\\]},"loop":{"item":"item"}},"uid":"\\2","gen":"\\1"}` + // Uses group 2 and group 1
                `}\]',` +
                `\\s*null,\\s*o\\)` +
                `\\]\\s*,\\s*o\\)` +
                `\\];?` +
                `}$`
            ),
        },
        {
            description: "Test with template inclusion g-tpl (mocked fetch)",
            inputHtml: "<div g-tpl=\"'myTemplate.html'\"></div>",
            expectedOutputPattern: /^\(o\)=>\[g\('div',\s*'\[{"type":6,"link":{"vorc":{"ct":"'myTemplate.html'"}}}\]'\s*,\s*null\s*,\s*o\)\]$/,
        },
        {
            description: "Test with invalid template syntax (e.g., unclosed brackets)",
            inputHtml: "<div>{{ data.name }", // Unclosed brackets
            expectError: true,
            // Depending on the parser's error reporting, the message might vary.
            // This is a placeholder and might need adjustment.
            errorMessage: "parsing template", 
        }
    ];

    let passed = 0;
    let failed = 0;

    console.log('\n--- Running GCode Tests ---');

    for (const [index, test] of testCases.entries()) {
        console.log(`\nTest #${index + 1}: ${test.description}`);
        console.log(`Input HTML: ${test.inputHtml}`);

        if (test.setup) {
            test.setup();
        }

        try {
            const actualGeneratedCode = await GCode(test.inputHtml);

            if (test.expectError) {
                console.error(`❌ ERROR: Expected an error, but GCode executed successfully.`);
                console.error(`Generated Code: ${actualGeneratedCode}`);
                failed++;
            } else {
                let testPassed = false;
                if (test.expectedOutputPattern) {
                    if (test.expectedOutputPattern.test(actualGeneratedCode)) {
                        testPassed = true;
                    } else {
                        console.error(`❌ ERROR: Generated code does not match expected pattern.`);
                        console.error(`Expected Pattern: ${test.expectedOutputPattern}`);
                        console.error(`Generated Code: ${actualGeneratedCode}`);
                    }
                } else if (test.expectedOutputSubstring) {
                    if (actualGeneratedCode.includes(test.expectedOutputSubstring)) {
                        testPassed = true;
                    } else {
                        console.error(`❌ ERROR: Generated code does not contain expected substring.`);
                        console.error(`Expected Substring: ${test.expectedOutputSubstring}`);
                        console.error(`Generated Code: ${actualGeneratedCode}`);
                    }
                } else {
                    console.warn("No output assertion defined for this test case.");
                    // Consider if this should be a fail or just a warning
                }

                if (testPassed) {
                    console.log("✅ OK - Test passed.");
                    passed++;
                } else {
                    failed++;
                }
            }
        } catch (e: any) {
            if (test.expectError) {
                if (test.errorMessage) {
                    if (e.message.includes(test.errorMessage)) {
                        console.log(`✅ OK - Test threw expected error: ${e.message}`);
                        passed++;
                    } else {
                        console.error(`❌ ERROR: Test threw an error, but message mismatch.`);
                        console.error(`Expected error message containing: ${test.errorMessage}`);
                        console.error(`Actual error message: ${e.message}`);
                        failed++;
                    }
                } else {
                    console.log(`✅ OK - Test threw expected error.`);
                    passed++;
                }
            } else {
                console.error(`❌ ERROR: Test threw an unexpected error: ${e.message}`);
                console.error(e.stack);
                failed++;
            }
        }

        if (test.cleanup) {
            test.cleanup();
        }
    }

    console.log(`\n--- GCode Test Summary ---`);
    console.log(`Total tests: ${testCases.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`--------------------------\n`);

    // If running in a CI environment or similar, might want to exit with an error code
    if (failed > 0) {
        // process.exit(1); // Be cautious with this in different execution environments
    }
}

// Initialize GParse instance for GCode (if needed at global scope, or manage within tests)
// GCode internally creates a GParse instance if gparse is null.
// new GParse(); // This might not be necessary depending on GCode's internal gparse handling.

runGCodeTests();
