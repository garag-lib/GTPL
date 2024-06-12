//---

let temp = null;

function check(it) {
    return it && it.Math === Math && it;
}

try {
    temp =
        check(typeof globalThis === 'object' && globalThis) ||
        check(typeof window === 'object' && window) ||
        check(typeof self === 'object' && self) ||
        check(typeof global === 'object' && global) ||
        (function () { return this; })() ||
        Function('return this')();
} catch (ex) {

}

export const globalObject = temp;

//---

let ptemp = null;

try {
    const options = {
        get passive() {
            ptemp = true;
            return false;
        },
    };
    globalObject.addEventListener("test", null, options);
    globalObject.removeEventListener("test", null, options);
} catch (err) {
    ptemp = false;
}

export const passiveSupported = ptemp;

//---