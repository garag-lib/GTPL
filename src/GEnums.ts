export const enum TypeEventProxyHandler {
    SET,
    UNSET,
    UKNOW,
    UKNOW3,
    UKNOW4,
    UKNOW5,
    UKNOW6
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