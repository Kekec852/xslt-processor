// Copyright 2023 Design Liquido
// Copyright 2018 Johannes Wilm
// Copyright 2005 Google Inc.
// All Rights Reserved
//
// Original author: Steffen Meschkat <mesch@google.com>
//
// An XML parse and a minimal DOM implementation that just supports
// the subset of the W3C DOM that is used in the XSLT implementation.
import he from 'he';

import {
    namespaceMapAt
} from './util';
import { XDocument } from "./xdocument";
import {
    XML10_VERSION_INFO,
    XML10_NAME,
    XML10_ATTRIBUTE,
    XML11_VERSION_INFO,
    XML11_NAME,
    XML11_ATTRIBUTE
} from './xmltoken';
import { XNode } from './xnode';

const XML10_TAGNAME_REGEXP = new RegExp(`^(${XML10_NAME})`);
const XML10_ATTRIBUTE_REGEXP = new RegExp(XML10_ATTRIBUTE, 'g');

const XML11_TAGNAME_REGEXP = new RegExp(`^(${XML11_NAME})`);
const XML11_ATTRIBUTE_REGEXP = new RegExp(XML11_ATTRIBUTE, 'g');

// Wrapper around DOM methods so we can condense their invocations.
export function domGetAttributeValue(node: any, name: string) {
    return node.getAttributeValue(name);
}

export function domSetAttribute(node: XNode, name: string, value: any) {
    return node.setAttribute(name, value);
}

export function domSetTransformedAttribute(node: XNode, name: string, value: any) {
    return node.setTransformedAttribute(name, value);
}

export function domAppendChild(node: XNode, child: any) {
    return node.appendChild(child);
}

export function domAppendTransformedChild(node: XNode, child: any) {
    return node.appendTransformedChild(child);
}

export function domCreateTextNode(node: XDocument, text: string) {
    return node.createTextNode(text);
}

export function domCreateTransformedTextNode(node: XDocument, text: string) {
    return node.createTransformedTextNode(text);
}

export function domCreateElement(doc: XDocument, name: string) {
    return doc.createElement(name);
}

export function domCreateCDATASection(doc: XDocument, data: any) {
    return doc.createCDATASection(data);
}

export function domCreateComment(doc: any, text: any) {
    return doc.createComment(text);
}

export function domCreateDocumentFragment(doc: XDocument): XNode {
    return doc.createDocumentFragment();
}

export function domCreateDTDSection(doc: XDocument, data: any) {
    return doc.createDTDSection(data);
}

/**
 * Parses the given XML string with our custom, JavaScript XML parser
 * @param xml The XML String.
 * @returns A XDocument.
 * @author Steffen Meschkat <mesch@google.com>
 */
export function xmlParse(xml: string): XDocument {
    const regexEmpty = /\/$/;

    let regexTagname;
    let regexAttribute;
    if (xml.match(/^<\?xml/)) {
        // When an XML document begins with an XML declaration
        // VersionInfo must appear.
        if (xml.search(new RegExp(XML10_VERSION_INFO)) == 5) {
            regexTagname = XML10_TAGNAME_REGEXP;
            regexAttribute = XML10_ATTRIBUTE_REGEXP;
        } else if (xml.search(new RegExp(XML11_VERSION_INFO)) == 5) {
            regexTagname = XML11_TAGNAME_REGEXP;
            regexAttribute = XML11_ATTRIBUTE_REGEXP;
        } else {
            // VersionInfo is missing, or unknown version number.
            // TODO : Fallback to XML 1.0 or XML 1.1, or just return null?
            throw new Error('VersionInfo is missing, or unknown version number.');
        }
    } else {
        // When an XML declaration is missing it's an XML 1.0 document.
        regexTagname = XML10_TAGNAME_REGEXP;
        regexAttribute = XML10_ATTRIBUTE_REGEXP;
    }

    const xmldoc = new XDocument();
    const root = xmldoc;
    const stack = [];

    let parent: XNode = root;
    stack.push(parent);

    let tag = false,
        quotes = false,
        doublequotes = false,
        start = 0;
    for (let i = 0; i < xml.length; ++i) {
        let char = xml.charAt(i);
        if (tag && !doublequotes && char === "'") {
            quotes = !quotes;
        } else if (tag && !quotes && char === '"') {
            doublequotes = !doublequotes;
        } else if (tag && char === '>' && !quotes && !doublequotes) {
            let text = xml.slice(start, i);
            if (text.charAt(0) == '/') {
                stack.pop();
                parent = stack[stack.length - 1];
            } else if (text.charAt(0) === '?') {
                // Ignore XML declaration and processing instructions
            } else if (text.charAt(0) === '!') {
                // Ignore comments
                // console.log(`Ignored ${text}`);
            } else {
                const empty = text.match(regexEmpty);
                const tagname = regexTagname.exec(text)[1];
                let node = domCreateElement(xmldoc, tagname);

                let attribute;
                while ((attribute = regexAttribute.exec(text))) {
                    const val = he.decode(attribute[5] || attribute[7] || '');
                    domSetAttribute(node, attribute[1], val);
                }

                node.siblingPosition = parent.childNodes.length;
                domAppendChild(parent, node);
                if (!empty) {
                    parent = node;
                    stack.push(node);
                }

                const namespaceMap = namespaceMapAt(node);
                if (node.prefix !== null) {
                    if (node.prefix in namespaceMap) node.namespaceUri = namespaceMap[node.prefix];
                    // else, prefix is undefined. do anything?
                } else {
                    if ('' in namespaceMap) node.namespaceUri = namespaceMap[''];
                }
                for (let i = 0; i < node.attributes.length; ++i) {
                    if (node.attributes[i].prefix !== null) {
                        if (node.attributes[i].prefix in namespaceMap) {
                            node.attributes[i].namespaceUri = namespaceMap[node.attributes[i].prefix];
                        }
                        // else, prefix undefined.
                    }
                    // elements with no prefix always have no namespace, so do nothing here.
                }
            }
            start = i + 1;
            tag = false;
            quotes = false;
            doublequotes = false;
        } else if (!tag && char === '<') {
            let text = xml.slice(start, i);
            if (text && parent !== root) {
                domAppendChild(parent, domCreateTextNode(xmldoc, text));
            }
            if (xml.slice(i + 1, i + 4) === '!--') {
                let endTagIndex = xml.slice(i + 4).indexOf('-->');
                if (endTagIndex) {
                    let node = domCreateComment(xmldoc, xml.slice(i + 4, i + endTagIndex + 4));
                    domAppendChild(parent, node);
                    i += endTagIndex + 6;
                }
            } else if (xml.slice(i + 1, i + 9) === '![CDATA[') {
                let endTagIndex = xml.slice(i + 9).indexOf(']]>');
                if (endTagIndex) {
                    let node = domCreateCDATASection(xmldoc, xml.slice(i + 9, i + endTagIndex + 9));
                    domAppendChild(parent, node);
                    i += endTagIndex + 11;
                }
            } else if (xml.slice(i + 1, i + 9) === '!DOCTYPE') {
                let endTagIndex = xml.slice(i + 9).indexOf('>');
                if (endTagIndex) {
                    const dtdValue = xml.slice(i + 9, i + endTagIndex + 9).trimStart();
                    // TODO: Not sure if this is a good solution.
                    // Trying to implement this: https://github.com/DesignLiquido/xslt-processor/issues/30
                    let node;
                    if (parent.nodeName === 'xsl:text') {
                        node = domCreateTextNode(xmldoc, `<!DOCTYPE ${dtdValue}>`);
                    } else {
                        node = domCreateDTDSection(xmldoc, dtdValue);
                    }

                    domAppendChild(parent, node);
                    i += endTagIndex + dtdValue.length + 5;
                }
            } else {
                tag = true;
            }
            start = i + 1;
        }
    }

    return root;
}

//XDocument.prototype = new XNode(DOM_DOCUMENT_NODE, '#document');
