// Copyright 2023 Design Liquido
// Copyright 2018 Johannes Wilm
// Copyright 2005 Google Inc.
// All Rights Reserved
//
// An XPath parser and evaluator written in JavaScript. The
// implementation is complete except for functions handling
// namespaces.
//
// Reference: [XPATH] XPath Specification
// <http://www.w3.org/TR/1999/REC-xpath-19991116>.
//
//
// The API of the parser has several parts:
//
// 1. The parser function xpathParse() that takes a string and returns
// an expession object.
//
// 2. The expression object that has an evaluate() method to evaluate the
// XPath expression it represents. (It is actually a hierarchy of
// objects that resembles the parse tree, but an application will call
// evaluate() only on the top node of this hierarchy.)
//
// 3. The context object that is passed as an argument to the evaluate()
// method, which represents the DOM context in which the expression is
// evaluated.
//
// 4. The value object that is returned from evaluate() and represents
// values of the different types that are defined by XPath (number,
// string, boolean, and node-set), and allows to convert between them.
//
// These parts are near the top of the file, the functions and data
// that are used internally follow after them.
//
//
// Original author: Steffen Meschkat <mesch@google.com>

import { mapExec, mapExpr, reverseInPlace } from '../dom/util';
import { copyArray } from './common-function';
import { ExprContext } from './expr-context';
import {
    BinaryExpr,
    FilterExpr,
    FunctionCallExpr,
    LiteralExpr,
    LocationExpr,
    NumberExpr,
    PathExpr,
    PredicateExpr,
    StepExpr,
    TokenExpr,
    UnaryMinusExpr,
    UnionExpr,
    VariableExpr
} from './expressions';
import { Expression } from './expressions/expression';

import {
    Q_MM,
    Q_01,
    Q_1M,
    xPathTokenRules,
    TOK_DIV,
    TOK_MOD,
    TOK_AND,
    TOK_OR,
    TOK_AT,
    TOK_DSLASH,
    TOK_SLASH,
    TOK_AXIS,
    TOK_DOLLAR,
    TOK_QNAME,
    TOK_DOT,
    TOK_DDOT,
    TOK_AXISNAME,
    TOK_ASTERISK,
    TOK_NCNAME,
    TOK_COLON,
    TOK_NODEO,
    TOK_PARENC,
    TOK_BRACKC,
    TOK_BRACKO,
    TOK_PARENO,
    TOK_COMMA,
    TOK_PIPE,
    TOK_MINUS,
    TOK_EQ,
    TOK_NEQ,
    TOK_LT,
    TOK_LE,
    TOK_GT,
    TOK_GE,
    TOK_PLUS,
    ASSOC_LEFT,
    TOK_LITERALQ,
    TOK_LITERALQQ,
    TOK_NUMBER,
    xPathAxis
} from './tokens';
import {
    XPathLocationPath,
    XPathRelativeLocationPath,
    XPathAbsoluteLocationPath,
    XPathStep,
    XPathNodeTest,
    XPathPredicate,
    XPathLiteral,
    XPathExpr,
    XPathPrimaryExpr,
    XPathVariableReference,
    XPathNumber,
    XPathFunctionCall,
    XPathArgumentRemainder,
    XPathPathExpr,
    XPathUnionExpr,
    XPathFilterExpr,
    XPathDigits
} from './xpath-grammar-rules';

import { GrammarRuleCandidate } from './grammar-rule-candidate';
import { XPathTokenRule } from './xpath-token-rule';
import { XNode } from '../dom';
import { NodeTestAny, NodeTestElementOrAttribute, NodeTestNC, NodeTestName, NodeTestText, NodeTestComment, NodeTestPI, NodeTest } from './node-tests';
import { DOM_ATTRIBUTE_NODE } from '../constants';
import { NodeValue } from './values';

export class XPath {
    xPathParseCache: any;
    xPathRules: any[];
    xPathLog: (message: string) => void;

    lexerCount: number;
    parseCount: number;
    reduceCount: number;

    // The productions of the grammar. Columns of the table:
    //
    // - target nonterminal,
    // - pattern,
    // - precedence,
    // - semantic value factory
    //
    // The semantic value factory is a function that receives parse tree
    // nodes from the stack frames of the matched symbols as arguments and
    // returns an a node of the parse tree. The node is stored in the top
    // stack frame along with the target object of the rule. The node in
    // the parse tree is an expression object that has an evaluate() method
    // and thus evaluates XPath expressions.
    //
    // The precedence is used to decide between reducing and shifting by
    // comparing the precendence of the rule that is candidate for
    // reducing with the precedence of the look ahead token. Precedence of
    // -1 means that the precedence of the tokens in the pattern is used
    // instead. TODO: It shouldn't be necessary to explicitly assign
    // precedences to rules.

    // DGF As it stands, these precedences are purely empirical; we're
    // not sure they can be made to be consistent at all.
    xPathGrammarRules = [
        [XPathLocationPath, [XPathRelativeLocationPath], 18, this.passExpr],
        [XPathLocationPath, [XPathAbsoluteLocationPath], 18, this.passExpr],

        [XPathAbsoluteLocationPath, [TOK_SLASH, XPathRelativeLocationPath], 18, this.makeLocationExpr1],
        [XPathAbsoluteLocationPath, [TOK_DSLASH, XPathRelativeLocationPath], 18, this.makeLocationExpr2],

        [XPathAbsoluteLocationPath, [TOK_SLASH], 0, this.makeLocationExpr3],
        [XPathAbsoluteLocationPath, [TOK_DSLASH], 0, this.makeLocationExpr4],

        [XPathRelativeLocationPath, [XPathStep], 31, this.makeLocationExpr5],
        [XPathRelativeLocationPath, [XPathRelativeLocationPath, TOK_SLASH, XPathStep], 31, this.makeLocationExpr6],
        [XPathRelativeLocationPath, [XPathRelativeLocationPath, TOK_DSLASH, XPathStep], 31, this.makeLocationExpr7],

        [XPathStep, [TOK_DOT], 33, this.makeStepExpr1],
        [XPathStep, [TOK_DDOT], 33, this.makeStepExpr2],
        [XPathStep, [TOK_AXISNAME, TOK_AXIS, XPathNodeTest], 33, this.makeStepExpr3],
        [XPathStep, [TOK_AT, XPathNodeTest], 33, this.makeStepExpr4],
        [XPathStep, [XPathNodeTest], 33, this.makeStepExpr5],
        [XPathStep, [XPathStep, XPathPredicate], 33, this.makeStepExpr6],

        [XPathNodeTest, [TOK_ASTERISK], 33, this.makeNodeTestExpr1],
        [XPathNodeTest, [TOK_NCNAME, TOK_COLON, TOK_ASTERISK], 33, this.makeNodeTestExpr2],
        [XPathNodeTest, [TOK_QNAME], 33, this.makeNodeTestExpr3],
        [XPathNodeTest, [TOK_NODEO, TOK_PARENC], 33, this.makeNodeTestExpr4],
        [XPathNodeTest, [TOK_NODEO, XPathLiteral, TOK_PARENC], 33, this.makeNodeTestExpr5],

        [XPathPredicate, [TOK_BRACKO, XPathExpr, TOK_BRACKC], 33, this.makePredicateExpr],

        [XPathPrimaryExpr, [XPathVariableReference], 33, this.passExpr],
        [XPathPrimaryExpr, [TOK_PARENO, XPathExpr, TOK_PARENC], 33, this.makePrimaryExpr],
        [XPathPrimaryExpr, [XPathLiteral], 30, this.passExpr],
        [XPathPrimaryExpr, [XPathNumber], 30, this.passExpr],
        [XPathPrimaryExpr, [XPathFunctionCall], 31, this.passExpr],

        [XPathFunctionCall, [TOK_QNAME, TOK_PARENO, TOK_PARENC], -1, this.makeFunctionCallExpr1],
        [
            XPathFunctionCall,
            [TOK_QNAME, TOK_PARENO, XPathExpr, XPathArgumentRemainder, Q_MM, TOK_PARENC],
            -1,
            this.makeFunctionCallExpr2
        ],
        [XPathArgumentRemainder, [TOK_COMMA, XPathExpr], -1, this.makeArgumentExpr],

        [XPathUnionExpr, [XPathPathExpr], 20, this.passExpr],
        [XPathUnionExpr, [XPathUnionExpr, TOK_PIPE, XPathPathExpr], 20, this.makeUnionExpr],

        [XPathPathExpr, [XPathLocationPath], 20, this.passExpr],
        [XPathPathExpr, [XPathFilterExpr], 19, this.passExpr],
        [XPathPathExpr, [XPathFilterExpr, TOK_SLASH, XPathRelativeLocationPath], 19, this.makePathExpr1],
        [XPathPathExpr, [XPathFilterExpr, TOK_DSLASH, XPathRelativeLocationPath], 19, this.makePathExpr2],

        [XPathFilterExpr, [XPathPrimaryExpr, XPathPredicate, Q_MM], 31, this.makeFilterExpr],

        [XPathExpr, [XPathPrimaryExpr], 16, this.passExpr],
        [XPathExpr, [XPathUnionExpr], 16, this.passExpr],

        [XPathExpr, [TOK_MINUS, XPathExpr], -1, this.makeUnaryMinusExpr],

        [XPathExpr, [XPathExpr, TOK_OR, XPathExpr], -1, this.makeBinaryExpr],
        [XPathExpr, [XPathExpr, TOK_AND, XPathExpr], -1, this.makeBinaryExpr],

        [XPathExpr, [XPathExpr, TOK_EQ, XPathExpr], -1, this.makeBinaryExpr],
        [XPathExpr, [XPathExpr, TOK_NEQ, XPathExpr], -1, this.makeBinaryExpr],

        [XPathExpr, [XPathExpr, TOK_LT, XPathExpr], -1, this.makeBinaryExpr],
        [XPathExpr, [XPathExpr, TOK_LE, XPathExpr], -1, this.makeBinaryExpr],
        [XPathExpr, [XPathExpr, TOK_GT, XPathExpr], -1, this.makeBinaryExpr],
        [XPathExpr, [XPathExpr, TOK_GE, XPathExpr], -1, this.makeBinaryExpr],

        [XPathExpr, [XPathExpr, TOK_PLUS, XPathExpr], -1, this.makeBinaryExpr, ASSOC_LEFT],
        [XPathExpr, [XPathExpr, TOK_MINUS, XPathExpr], -1, this.makeBinaryExpr, ASSOC_LEFT],

        [XPathExpr, [XPathExpr, TOK_ASTERISK, XPathExpr], -1, this.makeBinaryExpr, ASSOC_LEFT],
        [XPathExpr, [XPathExpr, TOK_DIV, XPathExpr], -1, this.makeBinaryExpr, ASSOC_LEFT],
        [XPathExpr, [XPathExpr, TOK_MOD, XPathExpr], -1, this.makeBinaryExpr, ASSOC_LEFT],

        [XPathLiteral, [TOK_LITERALQ], -1, this.makeLiteralExpr],
        [XPathLiteral, [TOK_LITERALQQ], -1, this.makeLiteralExpr],

        [XPathNumber, [TOK_NUMBER], -1, this.makeNumberExpr],

        [XPathVariableReference, [TOK_DOLLAR, TOK_QNAME], 200, this.makeVariableReference]
    ];

    constructor() {
        this.xPathParseCache = {};
        this.xPathRules = [];
        this.xPathLog = () => {};

        this.lexerCount = 0;
        this.parseCount = 0;
        this.reduceCount = 0;
    }

    // Factory functions for semantic values (i.e. Expressions) of the
    // productions in the grammar. When a production is matched to reduce
    // the current parse state stack, the export function is called with the
    // semantic values of the matched elements as arguments, and returns
    // another semantic value. The semantic value is a node of the parse
    // tree, an expression object with an evaluate() method that evaluates the
    // expression in an actual context. These factory functions are used
    // in the specification of the grammar rules, below.

    makeTokenExpr(m: any) {
        return new TokenExpr(m);
    }

    passExpr(e: any) {
        return e;
    }

    makeLocationExpr1(slash: any, rel: any) {
        rel.absolute = true;
        return rel;
    }

    makeLocationExpr2(dslash: any, rel: any) {
        rel.absolute = true;
        rel.prependStep(this.makeAbbrevStep(dslash.value));
        return rel;
    }

    makeLocationExpr3() {
        const ret = new LocationExpr(this);
        ret.appendStep(this.makeAbbrevStep('.'));
        ret.absolute = true;
        return ret;
    }

    makeLocationExpr4(dslash: any) {
        const ret = new LocationExpr(this);
        ret.absolute = true;
        ret.appendStep(this.makeAbbrevStep(dslash.value));
        return ret;
    }

    makeLocationExpr5(step: any) {
        const ret = new LocationExpr(this);
        ret.appendStep(step);
        return ret;
    }

    makeLocationExpr6(rel: any, slash: any, step: any) {
        rel.appendStep(step);
        return rel;
    }

    makeLocationExpr7(rel: any, dslash: any, step: any) {
        rel.appendStep(this.makeAbbrevStep(dslash.value));
        rel.appendStep(step);
        return rel;
    }

    makeStepExpr1(dot: any) {
        return this.makeAbbrevStep(dot.value);
    }

    makeStepExpr2(ddot: any) {
        return this.makeAbbrevStep(ddot.value);
    }

    makeStepExpr3(axisname: any, axis: any, nodeTest: any) {
        return new StepExpr(axisname.value, nodeTest, this);
    }

    makeStepExpr4(at: any, nodeTest: any) {
        return new StepExpr('attribute', nodeTest, this);
    }

    makeStepExpr5(nodeTest: any, axis?: string) {
        return new StepExpr(axis || 'child', nodeTest, this);
    }

    makeStepExpr6(step: any, predicate: any) {
        step.appendPredicate(predicate);
        return step;
    }

    makeAbbrevStep(abbrev: any) {
        switch (abbrev) {
            case '//':
                return new StepExpr('descendant-or-self', new NodeTestAny(), this);

            case '.':
                return new StepExpr('self', new NodeTestAny(), this);

            case '..':
                return new StepExpr('parent', new NodeTestAny(), this);
        }
    }

    makeNodeTestExpr1() {
        return new NodeTestElementOrAttribute();
    }

    makeNodeTestExpr2(ncname: any) {
        return new NodeTestNC(ncname.value);
    }

    makeNodeTestExpr3(qname: any) {
        return new NodeTestName(qname.value);
    }

    makeNodeTestExpr4(typeo: any) {
        const type = typeo.value.replace(/\s*\($/, '');
        switch (type) {
            case 'node':
                return new NodeTestAny();

            case 'text':
                return new NodeTestText();

            case 'comment':
                return new NodeTestComment();

            case 'processing-instruction':
                return new NodeTestPI('');
        }
    }

    makeNodeTestExpr5(typeo: any, target: any) {
        const type = typeo.replace(/\s*\($/, '');
        if (type != 'processing-instruction') {
            throw type;
        }
        return new NodeTestPI(target.value);
    }

    makePredicateExpr(pareno: any, expr: any) {
        return new PredicateExpr(expr);
    }

    makePrimaryExpr(pareno: any, expr: any) {
        return expr;
    }

    makeFunctionCallExpr1(name: any) {
        return new FunctionCallExpr(name);
    }

    makeFunctionCallExpr2(name: any, pareno: any, arg1: any, args: any) {
        const ret = new FunctionCallExpr(name);
        ret.appendArg(arg1);
        for (let i = 0; i < args.length; ++i) {
            ret.appendArg(args[i]);
        }
        return ret;
    }

    makeArgumentExpr(comma: any, expr: any) {
        return expr;
    }

    makeUnionExpr(expr1: any, pipe: any, expr2: any) {
        return new UnionExpr(expr1, expr2);
    }

    makePathExpr1(filter: any, slash: any, rel: any) {
        return new PathExpr(filter, rel);
    }

    makePathExpr2(filter: any, dslash: any, rel: any) {
        rel.prependStep(this.makeAbbrevStep(dslash.value));
        return new PathExpr(filter, rel);
    }

    makeFilterExpr(expr: any, predicates: any) {
        if (predicates.length > 0) {
            return new FilterExpr(expr, predicates);
        }

        return expr;
    }

    makeUnaryMinusExpr(minus: any, expr: any) {
        return new UnaryMinusExpr(expr);
    }

    makeBinaryExpr(expr1: any, op: any, expr2: any) {
        return new BinaryExpr(expr1, op, expr2);
    }

    makeLiteralExpr(token: any) {
        // remove quotes from the parsed value:
        const value = token.value.substring(1, token.value.length - 1);
        return new LiteralExpr(value);
    }

    makeNumberExpr(token: any) {
        return new NumberExpr(token.value);
    }

    makeVariableReference(dollar: any, name: any) {
        return new VariableExpr(name.value);
    }

    /**
     * Used before parsing for optimization of common simple cases. See
     * the begin of xPathParse() for which they are.
     * @param expression The XPath expression.
     * @param axis The axis, if required. Default is 'child'.
     * @returns An `Expression` object.
     */
    makeSimpleExpr(expression: string, axis?: string): Expression {
        if (expression.charAt(0) == '$') {
            return new VariableExpr(expression.substr(1));
        }

        if (expression.charAt(0) == '@') {
            let a = new NodeTestName(expression.substr(1));
            let b = new StepExpr('attribute', a, this);
            let c = new LocationExpr(this);
            c.appendStep(b);
            return c;
        }

        if (expression.match(/^[0-9]+$/)) {
            return new NumberExpr(expression);
        }

        let a = new NodeTestName(expression);
        let b = new StepExpr(axis || xPathAxis.CHILD, a, this);
        let c = new LocationExpr(this);
        c.appendStep(b);
        return c;
    }

    makeSimpleExpr2(expr: any) {
        const steps = expr.split('/');
        const c = new LocationExpr(this);
        for (let i = 0; i < steps.length; ++i) {
            const a = new NodeTestName(steps[i]);
            const b = new StepExpr(xPathAxis.CHILD, a, this);
            c.appendStep(b);
        }
        return c;
    }

    stackToString(stack: any[]) {
        let ret = '';
        for (let i = 0; i < stack.length; ++i) {
            if (ret) {
                ret += '\n';
            }
            ret += stack[i].tag.label;
        }
        return ret;
    }

    xPathCacheLookup(expr: any) {
        return this.xPathParseCache[expr];
    }

    xPathCollectDescendants(nodeList: XNode[], node: XNode, opt_tagName?: string) {
        if (opt_tagName && node.getElementsByTagName) {
            copyArray(nodeList, node.getElementsByTagName(opt_tagName));
            return;
        }

        for (let n = node.firstChild; n; n = n.nextSibling) {
            if (n.nodeType !== DOM_ATTRIBUTE_NODE) {
                nodeList.push(n);
            }

            this.xPathCollectDescendants(nodeList, n);
        }
    }

    xPathCollectDescendantsReverse(nodeList: any, node: any) {
        for (let n = node.lastChild; n; n = n.previousSibling) {
            nodeList.push(n);
            this.xPathCollectDescendantsReverse(nodeList, n);
        }
    }

    /**
     * Parses and then evaluates the given XPath expression in the given
     * input context.
     * @param select The xPath string.
     * @param context The Expression Context.
     * @returns A Node Value.
     */
    xPathEval(select: string, context: ExprContext): NodeValue {
        const expression = this.xPathParse(select);
        const response = expression.evaluate(context);
        return response;
    }

    /**
     * DGF - extract a tag name suitable for getElementsByTagName
     *
     * @param nodeTest                     the node test
     * @param ignoreNonElementNodesForNTA  if true, the node list returned when
     *                                     evaluating "node()" will not contain
     *                                     non-element nodes. This can boost
     *                                     performance. This is false by default.
     */
    xPathExtractTagNameFromNodeTest(nodeTest: NodeTest, ignoreNonElementNodesForNTA: any): string {
        if (nodeTest instanceof NodeTestName) {
            return nodeTest.name;
        }

        if (
            (ignoreNonElementNodesForNTA && nodeTest instanceof NodeTestAny) ||
            nodeTest instanceof NodeTestElementOrAttribute
        ) {
            return '*';
        }
    }

    xPathMatchStack(stack: any, pattern: any) {
        // NOTE(mesch): The stack matches for variable cardinality are
        // greedy but don't do backtracking. This would be an issue only
        // with rules of the form A* A, i.e. with an element with variable
        // cardinality followed by the same element. Since that doesn't
        // occur in the grammar at hand, all matches on the stack are
        // unambiguous.

        const S = stack.length;
        const P = pattern.length;
        let p;
        let s;
        const match: any = [];
        match.matchlength = 0;
        let ds = 0;
        for (p = P - 1, s = S - 1; p >= 0 && s >= 0; --p, s -= ds) {
            ds = 0;
            const qmatch: any = [];
            if (pattern[p] == Q_MM) {
                p -= 1;
                match.push(qmatch);
                while (s - ds >= 0 && stack[s - ds].tag == pattern[p]) {
                    qmatch.push(stack[s - ds]);
                    ds += 1;
                    match.matchlength += 1;
                }
            } else if (pattern[p] == Q_01) {
                p -= 1;
                match.push(qmatch);
                while (s - ds >= 0 && ds < 2 && stack[s - ds].tag == pattern[p]) {
                    qmatch.push(stack[s - ds]);
                    ds += 1;
                    match.matchlength += 1;
                }
            } else if (pattern[p] == Q_1M) {
                p -= 1;
                match.push(qmatch);
                if (stack[s].tag == pattern[p]) {
                    while (s - ds >= 0 && stack[s - ds].tag == pattern[p]) {
                        qmatch.push(stack[s - ds]);
                        ds += 1;
                        match.matchlength += 1;
                    }
                } else {
                    return [];
                }
            } else if (stack[s].tag == pattern[p]) {
                match.push(stack[s]);
                ds += 1;
                match.matchlength += 1;
            } else {
                return [];
            }

            reverseInPlace(qmatch);
            qmatch.expr = mapExpr(qmatch, (m) => m.expr);
        }

        reverseInPlace(match);

        if (p === -1) {
            return match;
        }

        return [];
    }

    /**
     * Finds the best rule for the XPath expression provided.
     * @param expression The XPath string expression.
     * @param previous The previous matched XPath rule.
     * @returns The found rule and the corresponding match.
     */
    private findXPathRuleForExpression(
        expression: string,
        previous: GrammarRuleCandidate
    ): { rule: XPathTokenRule | null, match: string } {

        let rule: XPathTokenRule = null;
        let match: string = '';
        for (let i = 0; i < xPathTokenRules.length; ++i) {
            let result: RegExpExecArray = xPathTokenRules[i].re.exec(expression);
            this.lexerCount++;
            if (result !== null && result.length > 0 && result[0].length > 0) {
                rule = xPathTokenRules[i];
                match = result[0];
                break;
            }
        }

        // Special case: allow operator keywords to be element and
        // variable names.

        // NOTE(mesch): The parser resolves conflicts by looking ahead,
        // and this is the only case where we look back to
        // disambiguate. So this is indeed something different, and
        // looking back is usually done in the lexer (via states in the
        // general case, called "start conditions" in flex(1)). Also, the
        // conflict resolution in the parser is not as robust as it could
        // be, so I'd like to keep as much off the parser as possible (all
        // these precedence values should be computed from the grammar
        // rules and possibly associativity declarations, as in bison(1),
        // and not explicitly set.

        if (
            rule &&
            (rule == TOK_DIV || rule == TOK_MOD || rule == TOK_AND || rule == TOK_OR) &&
            (!previous ||
                previous.tag == TOK_AT ||
                previous.tag == TOK_DSLASH ||
                previous.tag == TOK_SLASH ||
                previous.tag == TOK_AXIS ||
                previous.tag == TOK_DOLLAR)
        ) {
            rule = TOK_QNAME;
        }

        return { rule, match };
    }

    /**
     * Initialization for `xPathParse`.
     * @see xPathParse
     */
    private xPathParseInit() {
        if (this.xPathRules.length) {
            return;
        }

        let xPathNonTerminals = [
            XPathLocationPath,
            XPathRelativeLocationPath,
            XPathAbsoluteLocationPath,
            XPathStep,
            XPathNodeTest,
            XPathPredicate,
            XPathLiteral,
            XPathExpr,
            XPathPrimaryExpr,
            XPathVariableReference,
            XPathNumber,
            XPathFunctionCall,
            XPathArgumentRemainder,
            XPathPathExpr,
            XPathUnionExpr,
            XPathFilterExpr,
            XPathDigits
        ];

        // Some simple optimizations for the xpath expression parser: sort
        // grammar rules descending by length, so that the longest match is
        // first found.

        this.xPathGrammarRules.sort((a: any, b: any) => {
            const la = a[1].length;
            const lb = b[1].length;
            if (la < lb) {
                return 1;
            } else if (la > lb) {
                return -1;
            }

            return 0;
        });

        let k = 1;
        for (let i = 0; i < xPathNonTerminals.length; ++i) {
            xPathNonTerminals[i].key = k++;
        }

        for (let i = 0; i < xPathTokenRules.length; ++i) {
            xPathTokenRules[i].key = k++;
        }

        this.xPathLog(`XPath parse INIT: ${k} rules`);

        // Another slight optimization: sort the rules into bins according
        // to the last element (observing quantifiers), so we can restrict
        // the match against the stack to the subest of rules that match the
        // top of the stack.
        //
        // TODO(mesch): What we actually want is to compute states as in
        // bison, so that we don't have to do any explicit and iterated
        // match against the stack.

        function push_(array: any, position: any, element: any) {
            if (!array[position]) {
                array[position] = [];
            }
            array[position].push(element);
        }

        for (let i = 0; i < this.xPathGrammarRules.length; ++i) {
            const rule = this.xPathGrammarRules[i];
            const pattern: any = rule[1];

            for (let j = pattern.length - 1; j >= 0; --j) {
                if (pattern[j] == Q_1M) {
                    push_(this.xPathRules, pattern[j - 1].key, rule);
                    break;
                } else if (pattern[j] == Q_MM || pattern[j] == Q_01) {
                    push_(this.xPathRules, pattern[j - 1].key, rule);
                    --j;
                } else {
                    push_(this.xPathRules, pattern[j].key, rule);
                    break;
                }
            }
        }

        this.xPathLog(`XPath parse INIT: ${this.xPathRules.length} rule bins`);

        let sum = 0;
        mapExec(this.xPathRules, (i: any) => {
            if (i) {
                sum += i.length;
            }
        });

        this.xPathLog(`XPath parse INIT: ${sum / this.xPathRules.length} average bin size`);
    }

    /**
     * The entry point for the parser.
     * @param expression a string that contains an XPath expression.
     * @param axis The XPath axis. Used when the match does not start with the parent.
     * @returns an expression object that can be evaluated with an
     * expression context.
     */
    xPathParse(
        expression: string,
        axis?: string
    ) {
        const originalExpression = `${expression}`;
        this.xPathLog(`parse ${expression}`);
        this.xPathParseInit();

        // TODO: Removing the cache for now.
        // The cache became a real problem when having to deal with `self-and-siblings`
        // axis.
        /* const cached = this.xPathCacheLookup(expression);
        if (cached && axis === undefined) {
            this.xPathLog(' ... cached');
            return cached;
        } */

        // Optimize for a few common cases: simple attribute node tests
        // (@id), simple element node tests (page), variable references
        // ($address), numbers (4), multi-step path expressions where each
        // step is a plain element node test
        // (page/overlay/locations/location).

        if (expression.match(/^(\$|@)?\w+$/i)) {
            let ret = this.makeSimpleExpr(expression, axis);
            this.xPathParseCache[expression] = ret;
            this.xPathLog(' ... simple');
            return ret;
        }

        if (expression.match(/^\w+(\/\w+)*$/i)) {
            let ret = this.makeSimpleExpr2(expression);
            this.xPathParseCache[expression] = ret;
            this.xPathLog(' ... simple 2');
            return ret;
        }

        const cachekey = expression; // expression is modified during parse

        const stack: GrammarRuleCandidate[] = [];
        let ahead: GrammarRuleCandidate = null;
        let previous: GrammarRuleCandidate = null;
        let done: boolean = false;

        let parseCount = 0;
        this.lexerCount = 0;
        let reduceCount = 0;

        while (!done) {
            parseCount++;
            expression = expression.replace(/^\s*/, '');
            previous = ahead;
            ahead = null;

            let { rule, match } = this.findXPathRuleForExpression(expression, previous);

            if (rule) {
                expression = expression.substr(match.length);
                this.xPathLog(`token: ${match} -- ${rule.label}`);
                ahead = {
                    tag: rule,
                    match,
                    prec: rule.prec ? rule.prec : 0, // || 0 is removed by the compiler
                    expr: this.makeTokenExpr(match)
                };
            } else {
                this.xPathLog('DONE');
                done = true;
            }

            while (this.xPathReduce(stack, ahead)) {
                reduceCount++;
                this.xPathLog(`stack: ${this.stackToString(stack)}`);
            }
        }

        this.xPathLog(`stack: ${this.stackToString(stack)}`);

        // DGF any valid XPath should "reduce" to a single Expr token
        if (stack.length !== 1) {
            throw `XPath parse error ${cachekey}:\n${this.stackToString(stack)}`;
        }

        let result = stack[0].expr;
        // TODO: Remove this `if` after getting to rewrite `xPathReduce`.
        if (axis !== undefined &&
            !result.absolute &&
            !originalExpression.startsWith('*') &&
            result.steps &&
            Array.isArray(result.steps)
        ) {
            result.steps[0].axis = axis;
        }

        this.xPathParseCache[cachekey] = result;

        this.xPathLog(`XPath parse: ${parseCount} / ${this.lexerCount} / ${reduceCount}`);
        return result;
    }

    private findGrammarRuleCandidate(ruleset: any, stack: any[]): GrammarRuleCandidate {
        for (let i = 0; i < ruleset.length; ++i) {
            const rule = ruleset[i];
            const match = this.xPathMatchStack(stack, rule[1]);
            if (match.length) {
                const candidate = {
                    tag: rule[0],
                    rule,
                    match,
                    prec: undefined
                };
                candidate.prec = this.xPathGrammarPrecedence(candidate);
                return candidate;
            }
        }

        return null;
    }

    /**
     * DGF xPathReduce is where the magic happens in this parser.
     * Check `src\xpath\xpath-grammar-rules.ts` to find the table of
     * grammatical rules and precedence numbers, "The productions of the grammar".
     *
     * The idea here is that we want to take a stack of tokens and apply
     * grammatical rules to them, "reducing" them to higher-level
     * tokens. Ultimately, any valid XPath should reduce to exactly one
     * "Expr" token.

     * Reduce too early or too late and you'll have two tokens that can't reduce
     * to single Expr. For example, you may hastily reduce a qname that
     * should name a function, incorrectly treating it as a tag name.
     * Or you may reduce too late, accidentally reducing the last part of the
     * XPath into a top-level "Expr" that won't reduce with earlier parts of
     * the XPath.
     *
     * A "candidate" is a grammatical rule candidate, with a given precedence
     * number. "ahead" is the upcoming token, which also has a precedence
     * number. If the token has a higher precedence number than
     * the rule candidate, we'll "shift" the token onto the token stack,
     * instead of immediately applying the rule candidate.
     *
     * Some tokens have left associativity, in which case we shift when they
     * have LOWER precedence than the candidate.
     */
    private xPathReduce(
        stack: GrammarRuleCandidate[],
        ahead: GrammarRuleCandidate
    ) {
        let candidate: GrammarRuleCandidate = null;

        if (stack.length > 0) {
            const top = stack[stack.length - 1];
            const ruleset = this.xPathRules[top.tag.key];

            if (ruleset) {
                candidate = this.findGrammarRuleCandidate(ruleset, stack);
            }
        }

        let ret;
        if (candidate && (!ahead || candidate.prec > ahead.prec || (ahead.tag.left && candidate.prec >= ahead.prec))) {
            for (let i = 0; i < candidate.match.matchlength; ++i) {
                stack.pop();
            }

            this.xPathLog(
                `reduce ${candidate.tag.label} ${candidate.prec} ahead ${
                    ahead ? ahead.tag.label + ' ' + ahead.prec + (ahead.tag.left ? ' left' : '') : ' none '
                }`
            );

            const matchExpression = mapExpr(candidate.match, (m) => m.expr);
            this.xPathLog(`going to apply ${candidate.rule[3]}`);
            candidate.expr = candidate.rule[3].apply(this, matchExpression);

            stack.push(candidate);
            ret = true;
        } else {
            if (ahead) {
                this.xPathLog(
                    `shift ${ahead.tag.label} ${ahead.prec}${ahead.tag.left ? ' left' : ''} over ${
                        candidate ? candidate.tag.label + ' ' + candidate.prec : ' none'
                    }`
                );
                stack.push(ahead);
            }
            ret = false;
        }
        return ret;
    }

    /**
     * Utility function to sort a list of nodes. Used by xsltSort().
     * @param context The Expression Context.
     * @param sort TODO
     */
    xPathSort(context: ExprContext, sort: any[]) {
        if (sort.length === 0) {
            return;
        }

        const sortList = [];

        for (let i = 0; i < context.contextSize(); ++i) {
            const node = context.nodeList[i];
            const sortItem = {
                node,
                key: []
            };
            const clonedContext = context.clone([node], undefined, 0, undefined);

            for (const s of sort) {
                const value = s.expr.evaluate(clonedContext);

                let evalue: any;
                if (s.type === 'text') {
                    evalue = value.stringValue();
                } else if (s.type === 'number') {
                    evalue = value.numberValue();
                }
                sortItem.key.push({
                    value: evalue,
                    order: s.order
                });
            }

            // Make the sort stable by adding a lowest priority sort by
            // id. This is very convenient and furthermore required by the
            // spec ([XSLT] - Section 10 Sorting).
            sortItem.key.push({
                value: i,
                order: 'ascending'
            });

            sortList.push(sortItem);
        }

        sortList.sort(this.xPathSortByKey);

        const nodes = [];
        for (let i = 0; i < sortList.length; ++i) {
            const node = sortList[i].node;
            node.siblingPosition = i;
            nodes.push(node);
        }

        context.nodeList = nodes;
        context.setNode(0);
    }

    // Sorts by all order criteria defined. According to the JavaScript
    // spec ([ECMA] Section 11.8.5), the compare operators compare strings
    // as strings and numbers as numbers.
    //
    // NOTE: In browsers which do not follow the spec, this breaks only in
    // the case that numbers should be sorted as strings, which is very
    // uncommon.
    xPathSortByKey(v1: any, v2: any) {
        // NOTE: Sort key vectors of different length never occur in
        // xsltSort.

        for (let i = 0; i < v1.key.length; ++i) {
            const o = v1.key[i].order == 'descending' ? -1 : 1;
            if (v1.key[i].value > v2.key[i].value) {
                return +1 * o;
            }

            if (v1.key[i].value < v2.key[i].value) {
                return -1 * o;
            }
        }

        return 0;
    }

    xPathStep(nodes: any[], steps: any[], step: any, input: XNode, context: ExprContext) {
        const s = steps[step];
        const ctx2 = context.clone([input], undefined, 0, undefined);

        if (context.returnOnFirstMatch && !s.hasPositionalPredicate) {
            let nodeList = s.evaluate(ctx2).nodeSetValue();
            // the predicates were not processed in the last evaluate(), so that we can
            // process them here with the returnOnFirstMatch optimization. We do a
            // depth-first grab at any nodes that pass the predicate tests. There is no
            // way to optimize when predicates contain positional selectors, including
            // indexes or uses of the last() or position() functions, because they
            // typically require the entire nodeList for context. Process without
            // optimization if we encounter such selectors.
            const nLength = nodeList.length;
            const pLength = s.predicate.length;
            nodeListLoop: for (let i = 0; i < nLength; ++i) {
                for (let j = 0; j < pLength; ++j) {
                    if (!s.predicate[j].evaluate(context.clone(nodeList, undefined, i, undefined)).booleanValue()) {
                        continue nodeListLoop;
                    }
                }
                // n survived the predicate tests!
                if (step == steps.length - 1) {
                    nodes.push(nodeList[i]);
                } else {
                    this.xPathStep(nodes, steps, step + 1, nodeList[i], context);
                }
                if (nodes.length > 0) {
                    break;
                }
            }
        } else {
            // set returnOnFirstMatch to false for the cloned ExprContext, because
            // behavior in StepExpr.prototype.evaluate is driven off its value. Note
            // that the original context may still have true for this value.
            ctx2.returnOnFirstMatch = false;
            let nodeList = s.evaluate(ctx2).nodeSetValue();
            for (let i = 0; i < nodeList.length; ++i) {
                if (step == steps.length - 1) {
                    nodes.push(nodeList[i]);
                } else {
                    this.xPathStep(nodes, steps, step + 1, nodeList[i], context);
                }
            }
        }
    }

    xPathGrammarPrecedence(frame: any) {
        let ret = 0;

        if (frame.rule) {
            /* normal reduce */
            if (frame.rule.length >= 3 && frame.rule[2] >= 0) {
                ret = frame.rule[2];
            } else {
                for (let i = 0; i < frame.rule[1].length; ++i) {
                    let p = this.xPathTokenPrecedence(frame.rule[1][i]);
                    ret = Math.max(ret, p);
                }
            }
        } else if (frame.tag) {
            /* TOKEN match */
            ret = this.xPathTokenPrecedence(frame.tag);
        } else if (frame.length) {
            /* Q_ match */
            for (let j = 0; j < frame.length; ++j) {
                let p = this.xPathGrammarPrecedence(frame[j]);
                ret = Math.max(ret, p);
            }
        }

        return ret;
    }

    xPathTokenPrecedence(tag: any) {
        return tag.prec || 2;
    }
}
