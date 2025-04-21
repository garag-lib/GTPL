export const enum TypeEventProxyHandler {
    SET,       // 0
    UNSET,     // 1
    CALL,      // 2  ← para trap apply()
    DEFINE,    // 3  ← para trap defineProperty()
    UKNOW4,    // 4
    UKNOW5,    // 5
    UKNOW6,    // 6
    UKNOW7,    // 7
    UKNOW8     // 8
};

export const enum BindTypes {
    TEXT,
    IF,
    NOTIF,
    SWITCH,
    CASE,
    FOR,
    EVENT,
    ATTR,
    STYLE,
    INNER,
    ELE,
    ELES,
    IS,
    REF,
    TPL,
    VAR
};

export const enum NodeTypes {
    ELEMENT_NODE = 1,
    ATTRIBUTE_NODE,
    TEXT_NODE,
    CDATA_SECTION_NODE,
    //ENTITY_REFERENCE_NODE,
    //ENTITY_NODE,
    PROCESSING_INSTRUCTION_NODE,
    COMMENT_NODE,
    DOCUMENT_NODE,
    DOCUMENT_TYPE_NODE,
    DOCUMENT_FRAGMENT_NODE,
    //NOTATION_NODE
};
