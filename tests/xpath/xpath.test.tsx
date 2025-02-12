/* eslint-disable no-script-url */
/* eslint-disable guard-for-in */

// Copyright 2023 Design Liquido
// Copyright 2018 Johannes Wilm
// Copyright 2005, Google Inc.
// All Rights Reserved.
//
// Unit test for the XPath parser and engine.
//
// Author: Steffen Meschkat <mesch@google.com>
//         Junji Takagi <jtakagi@google.com>
//         Johannes Wilm <johannes@fiduswriter.org>
import assert from 'assert';

import { dom } from 'isomorphic-jsx';
import React from 'react';

import { ExprContext, XPath } from '../../src/xpath';
import { XmlParser, xmlValue } from '../../src/dom';
import { BooleanValue } from '../../src/xpath/values/boolean-value';
import { NumberValue } from '../../src/xpath/values/number-value';
import { StringValue } from '../../src/xpath/values/string-value';

// Just touching the `dom`, otherwise Babel prunes the import.
console.log(dom);
const expr = [
    '@*',
    '@*|node()',
    '/descendant-or-self::div',
    '/div',
    '//div',
    '/descendant-or-self::node()/child::para',
    "substring('12345', 0, 3)",
    '//title | //link',
    '$x//title',
    // "$x/title",  // TODO(mesch): parsing of this expression is broken
    "id('a')//title",
    '//*[@about]',
    'count(descendant::*)',
    'count(descendant::*) + count(ancestor::*)',
    "concat(substring-before(@image,'marker'),'icon',substring-after(@image,'marker'))",
    '@*|text()',
    '*|/',
    'source|destination',
    "$page != 'to' and $page != 'from'",
    "substring-after(icon/@image, '/mapfiles/marker')",
    'substring-before($str, $c)',
    "$page = 'from'",
    'segments/@time',
    'child::para',
    'child::*',
    'child::text()',
    'child::node()',
    'attribute::name',
    'attribute::*',
    'descendant::para',
    'ancestor::div',
    'ancestor-or-self::div',
    'descendant-or-self::para',
    'self::para',
    'child::chapter/descendant::para',
    'child::*/child::para',
    '/',
    '/descendant::para',
    '/descendant::olist/child::item',
    'child::para[position()=1]',
    'child::para[position()=last()]',
    'child::para[position()=last()-1]',
    'child::para[position()>1]',
    'following-sibling::chapter[position()=1]',
    'preceding-sibling::chapter[position()=1]',
    '/descendant::figure[position()=42]',
    '/child::doc/child::chapter[position()=5]/child::section[position()=2]',
    "child::para[attribute::type='warning']",
    "child::para[attribute::type='warning'][position()=5]",
    "child::para[position()=5][attribute::type='warning']",
    "child::chapter[child::title='Introduction']",
    'child::chapter[child::title]',
    'child::*[self::chapter or self::appendix]',
    'child::*[self::chapter or self::appendix][position()=last()]',
    "count(//*[id='u1']|//*[id='u2'])",
    "count(//*[id='u1']|//*[class='u'])",
    "count(//*[class='u']|//*[class='u'])",
    "count(//*[class='u']|//*[id='u1'])",

    // Axis expressions
    "count(//*[@id='self']/ancestor-or-self::*)",
    "count(//*[@id='self']/ancestor::*)",
    "count(//*[@id='self']/attribute::*)",
    "count(//*[@id='self']/child::*)",
    "count(//*[@id='self']/descendant-or-self::*)",
    "count(//*[@id='self']/descendant::*)",
    "count(//*[@id='self']/following-sibling::*)",
    "count(//*[@id='self']/following::*)",
    "//*[@id='self']/parent::*/@id",
    "count(//*[@id='self']/preceding-sibling::*)",
    "count(//*[@id='self']/preceding::*)",
    "//*[@id='self']/self::*/@id",

    // (Japanese)
    '/descendant-or-self::\u90e8\u5206',
    '//\u90e8\u5206',
    "substring('\uff11\uff12\uff13\uff14\uff15', 0, 3)",
    '//\u30bf\u30a4\u30c8\u30eb | //\u30ea\u30f3\u30af',
    '$\u8b0e//\u30bf\u30a4\u30c8\u30eb',
    '//*[@\u30c7\u30b9\u30c6\u30a3\u30cd\u30a4\u30b7\u30e7\u30f3]',
    "concat(substring-before(@\u30a4\u30e1\u30fc\u30b8,'\u76ee\u5370'),'\u30a2\u30a4\u30b3\u30f3',substring-after(@\u30a4\u30e1\u30fc\u30b8,'\u76ee\u5370'))",
    '\u30bd\u30fc\u30b9|\u30c7\u30b9\u30c6\u30a3\u30cd\u30a4\u30b7\u30e7\u30f3',
    "$\u30da\u30fc\u30b8 != '\u307e\u3067' and $\u30da\u30fc\u30b8 != '\u304b\u3089'",
    "substring-after(\u30a2\u30a4\u30b3\u30f3/@\u30a4\u30e1\u30fc\u30b8, '/\u5730\u56f3\u30d5\u30a1\u30a4\u30eb/\u76ee\u5370')",
    'substring-before($\u6587\u5b57\u5217, $\u6587\u5b57)',
    "$\u30da\u30fc\u30b8 = '\u304b\u3089'",
    '\u30bb\u30b0\u30e1\u30f3\u30c8/@\u6642\u523b',
    'child::\u6bb5\u843d',
    'attribute::\u540d\u524d',
    'descendant::\u6bb5\u843d',
    'ancestor::\u90e8\u5206',
    'ancestor-or-self::\u90e8\u5206',
    'descendant-or-self::\u6bb5\u843d',
    'self::\u6bb5\u843d',
    'child::\u7ae0/descendant::\u6bb5\u843d',
    'child::*/child::\u6bb5\u843d',
    '/descendant::\u6bb5\u843d',
    '/descendant::\u9806\u5e8f\u30ea\u30b9\u30c8/child::\u9805\u76ee',
    'child::\u6bb5\u843d[position()=1]',
    'child::\u6bb5\u843d[position()=last()]',
    'child::\u6bb5\u843d[position()=last()-1]',
    'child::\u6bb5\u843d[position()>1]',
    'following-sibling::\u7ae0[position()=1]',
    'preceding-sibling::\u7ae0[position()=1]',
    '/descendant::\u56f3\u8868[position()=42]',
    '/child::\u6587\u66f8/child::\u7ae0[position()=5]/child::\u7bc0[position()=2]',
    "child::\u6bb5\u843d[attribute::\u30bf\u30a4\u30d7='\u8b66\u544a']",
    "child::\u6bb5\u843d[attribute::\u30bf\u30a4\u30d7='\u8b66\u544a'][position()=5]",
    "child::\u6bb5\u843d[position()=5][attribute::\u30bf\u30a4\u30d7='\u8b66\u544a']",
    "child::\u7ae0[child::\u30bf\u30a4\u30c8\u30eb='\u306f\u3058\u3081\u306b']",
    'child::\u7ae0[child::\u30bf\u30a4\u30c8\u30eb]',
    'child::*[self::\u7ae0 or self::\u4ed8\u9332]',
    'child::*[self::\u7ae0 or self::\u4ed8\u9332][position()=last()]',

    //Selenium bugs
    "id('nested1')/div[1]//input[2]",
    "id('foo')//div[contains(@id, 'useful')]//input",
    "(//table[@class='stylee'])//th[text()='theHeaderText']/../td",

    // The following are all expressions that used to occur in google
    // maps XSLT templates.
    '$address',
    '$address=string(/page/user/defaultlocation)',
    '$count-of-snippet-of-url = 0',
    '$daddr',
    '$form',
    "$form = 'from'",
    "$form = 'to'",
    "$form='near'",
    '$home',
    '$i',
    '$i > $page and $i < $page + $range',
    '$i < $page and $i >= $page - $range',
    '$i < @max',
    '$i <= $page',
    '$i + 1',
    '$i = $page',
    '$i = 1',
    '$info = position() or (not($info) and position() = 1)',
    '$is-first-order',
    '$is-first-order and $snippets-exist',
    '$more',
    '$more > 0',
    '$near-point',
    '$page',
    "$page != 'from'",
    "$page != 'to'",
    "$page != 'to' and $page != 'from'",
    '$page > 1',
    "$page = 'basics'",
    "$page = 'details'",
    "$page = 'from'",
    "$page = 'to'",
    "$page='from'",
    "$page='to'",
    '$r >= 0.5',
    '$r >= 1',
    '$r - 0',
    '$r - 1',
    '$r - 2',
    '$r - 3',
    '$r - 4',
    '$saddr',
    '$sources',
    '$sources[position() < $details]',
    '$src',
    '$str',
    '"\'"',
    '(//location[string(info/references/reference[1]/url)=string($current-url)]/info/references/reference[1])[1]',
    '(not($count-of-snippet-of-url = 0) and (position() = 1) or not($current-url = //locations/location[position() = $last-pos]//reference[1]/url))',
    '(not($info) and position() = 1) or $info = position()',
    '.',
    '../@arg0',
    '../@filterpng',
    '/page/@filterpng',
    '4',
    '@attribution',
    '@id',
    '@max > @num',
    '@meters > 16093',
    '@name',
    '@start div @num + 1',
    '@url',
    'ad',
    'address/line',
    'adsmessage',
    'attr',
    "boolean(location[@id='near'][icon/@image])",
    'bubble/node()',
    'calltoaction/node()',
    'category',
    'contains($str, $c)',
    'count(//location[string(info/references/reference[1]/url)=string($current-url)]//snippet)',
    'count(//snippet)',
    'count(attr)',
    'count(location)',
    'count(structured/source) > 1',
    'description/node()',
    'destination',
    'destinationAddress',
    'domain',
    'false()',
    "icon/@class != 'noicon'",
    'icon/@image',
    'info',
    'info/address/line',
    'info/distance',
    'info/distance and $near-point',
    'info/distance and info/phone and $near-point',
    'info/distance or info/phone',
    'info/panel/node()',
    'info/phone',
    'info/references/reference[1]',
    'info/references/reference[1]/snippet',
    'info/references/reference[1]/url',
    'info/title',
    'info/title/node()',
    'line',
    'location',
    "location[@id!='near']",
    "location[@id='near'][icon/@image]",
    'location[position() > $numlocations div 2]',
    'location[position() <= $numlocations div 2]',
    'locations',
    'locations/location',
    'near',
    'node()',
    'not($count-of-snippets = 0)',
    "not($form = 'from')",
    "not($form = 'near')",
    "not($form = 'to')",
    'not(../@page)',
    'not(structured/source)',
    'notice',
    'number(../@info)',
    'number(../@items)',
    'number(/page/@linewidth)',
    'page/ads',
    'page/directions',
    'page/error',
    'page/overlay',
    'page/overlay/locations/location',
    'page/refinements',
    'page/request/canonicalnear',
    'page/request/near',
    'page/request/query',
    'page/spelling/suggestion',
    'page/user/defaultlocation',
    'phone',
    'position()',
    'position() != 1',
    'position() != last()',
    'position() > 1',
    'position() < $details',
    'position()-1',
    'query',
    'references/@total',
    'references/reference',
    'references/reference/domain',
    'references/reference/url',
    'reviews/@positive div (reviews/@positive + reviews/@negative) * 5',
    'reviews/@positive div (reviews/@positive + reviews/@negative) * (5)',
    'reviews/@total',
    'reviews/@total > 1',
    'reviews/@total > 5',
    'reviews/@total = 1',
    'segments/@distance',
    'segments/@time',
    'segments/segment',
    'shorttitle/node()',
    'snippet',
    'snippet/node()',
    'source',
    'sourceAddress',
    'sourceAddress and destinationAddress',
    'string(../@daddr)',
    'string(../@form)',
    'string(../@page)',
    'string(../@saddr)',
    'string(info/title)',
    "string(page/request/canonicalnear) != ''",
    "string(page/request/near) != ''",
    'string-length($address) > $linewidth',
    'structured/@total - $details',
    'structured/source',
    'structured/source[@name]',
    'substring($address, 1, $linewidth - 3)',
    'substring-after($str, $c)',
    "substring-after(icon/@image, '/mapfiles/marker')",
    'substring-before($str, $c)',
    'tagline/node()',
    'targetedlocation',
    'title',
    'title/node()',
    'true()',
    'url',
    'visibleurl'
];

const numExpr = [

    /* number expressions */
    ['1+1', 2],
    ['floor( -3.1415 )', -4],
    ['-5 mod -2', -1],
    ['-5 mod 2', -1],
    ['5 mod -2', 1],
    ['5 mod 2', 1],
    ['ceiling( 3.1415 )', 4.0],
    ['floor( 3.1415 )', 3.0],
    ['ceiling( -3.1415 )', -3.0],

    /* string expressions */
    ["substring('12345', -42, 1 div 0)", '12345'],
    ["normalize-space( '  qwerty ' )", 'qwerty'],
    ["contains('1234567890','9')", true],
    ["contains('1234567890','1')", true],
    ["'Hello World!'", 'Hello World!'],
    ["substring('12345', 1.5, 2.6)", '234'],
    ["substring('12345', 0, 3)", '12'],
    ["ends-with('foo', '')", true],
    ["ends-with('', 'foo')", false],
    ["ends-with('foo', 'foo')", true],
    ["ends-with('bar', 'foo')", false],
    ["ends-with('foobar', 'foo')", false],
    ["ends-with('barfoo', 'foo')", true],
    ["ends-with('foo\\$+', '\\$+')", true],
    ["matches('ajaxslt', 'xsl')", true],
    ["matches('ajaxslt', 'lt$')", true],
    ["matches('ajaxslt', '[pqr]')", false],
    ["matches('ajaxslt', '^AJAX')", false],
    ["matches('ajaxslt', '^AJAX', 'i')", true],
    ["matches('ajaxslt', 'a', 'z')", 'Invalid regular expression syntax: z'],
    ["matches('ajaxslt', '?')", 'Invalid matches argument: ?'],

    /* string expressions (Japanese) */
    ["substring('\u3042\u3044\u3046\u3048\u304a', -42, 1 div 0)", '\u3042\u3044\u3046\u3048\u304a'],
    [
        "normalize-space( '  \u3044\u308d\u306f\u306b\u307b\u3078\u3068 ' )",
        '\u3044\u308d\u306f\u306b\u307b\u3078\u3068'
    ],
    ["contains('\u5357\u7121\u5999\u6cd5\u9023\u83ef\u7d4c','\u7d4c')", true],
    ["contains('\u5357\u7121\u5999\u6cd5\u9023\u83ef\u7d4c','\u5357')", true],
    [
        "'\u3053\u3093\u306b\u3061\u306f\u3001\u4e16\u754c\uff01'",
        '\u3053\u3093\u306b\u3061\u306f\u3001\u4e16\u754c\uff01'
    ],
    ["substring('\uff11\uff12\uff13\uff14\uff15', 1.5, 2.6)", '\uff12\uff13\uff14'],
    ["substring('\uff11\uff12\uff13\uff14\uff15', 0, 3)", '\uff11\uff12'],

    /* selenium bug SEL-347, AJAXSLT issue 19 */
    ["count(//a[@href=\"javascript:doFoo('a', 'b')\"])", 1],

    /* variables */
    [
        '$foo',
        'bar',
        {
            foo: 'bar'
        }
    ],
    [
        '$foo',
        100,
        {
            foo: 100
        }
    ],
    [
        '$foo',
        true,
        {
            foo: true
        }
    ],
    [
        '$foo + 1',
        101,
        {
            foo: 100
        }
    ],

    /* variables (Japanese) */
    [
        '$\u307b\u3052',
        '\u307b\u3048',
        {
            ほげ: '\u307b\u3048'
        }
    ],
    [
        '$\u307b\u3052',
        100,
        {
            ほげ: 100
        }
    ],
    [
        '$\u307b\u3052',
        true,
        {
            ほげ: true
        }
    ],
    [
        '$\u307b\u3052 + 1',
        101,
        {
            ほげ: 100
        }
    ],

    /* functions */
    // function id() with string argument
    ["count(id('test1'))", 1],
    // function id() with node-set argument
    ["count(id(//*[@id='testid']))", 1],

    /* union expressions */
    ["count(//*[@id='u1'])", 1],
    ["count(//*[@class='u'])", 3],
    ["count(//*[@id='u1']|//*[@id='u2'])", 2],
    ["count(//*[@id='u1']|//*[@class='u'])", 3],
    ["count(//*[@class='u']|//*[@class='u'])", 3],
    ["count(//*[@class='u']|//*[@id='u1'])", 3],
    ["count(//*[contains(@style, 'visible')])", 1]
];

// eval an xpath expression to a single node
const evalNodeSet = (expr, ctx) => {
    const xPath = new XPath();
    const expr1 = xPath.xPathParse(expr);
    const e = expr1.evaluate(ctx);
    return e.nodeSetValue();
};

const doTestEvalDom = (xml, page, location, lat, latValue, lon, lonValue) => {
    const slashPage = `/${page}`;
    const slashPageLocationAtLat = `/${page}/${location}/@${lat}`;
    const slashPageLocationAtLon = `/${page}/${location}/@${lon}`;

    const xmlParser = new XmlParser();
    const ctx = new ExprContext([xmlParser.xmlParse(xml)], []);
    // DGF if we have access to an official DOMParser, compare output with that also
    let ctx1;
    if (typeof DOMParser != 'undefined') {
        ctx1 = new ExprContext([new DOMParser().parseFromString(xml, 'text/xml') as any], []);
    } else {
        ctx1 = ctx;
    }

    let ns = evalNodeSet(page, ctx);
    assert.equal(ns.length, 1, page);

    ns = evalNodeSet(page, ctx1);
    assert.equal(ns.length, 1, page);

    ns = evalNodeSet(slashPage, ctx);
    assert.equal(ns.length, 1, slashPage);

    ns = evalNodeSet(slashPage, ctx1);
    assert.equal(ns.length, 1, slashPage);

    assert.equal(evalNodeSet('/', ctx).length, 1, '/');
    assert.equal(evalNodeSet('/', ctx1).length, 1, '/');

    assert.equal(evalNodeSet('/', ctx)[0].nodeName, '#document', '/');
    assert.equal(evalNodeSet('/', ctx1)[0].nodeName, '#document', '/');

    assert.equal(evalNodeSet(slashPage, ctx)[0].nodeName, page, slashPage);
    assert.equal(evalNodeSet(slashPage, ctx1)[0].nodeName, page, slashPage);

    let n = evalNodeSet(slashPageLocationAtLat, ctx)[0];
    assert.equal(n.nodeName, lat, slashPageLocationAtLat);
    assert.equal(n.nodeValue, latValue, slashPageLocationAtLat);

    n = evalNodeSet(slashPageLocationAtLat, ctx1)[0];
    assert.equal(n.nodeName, lat, slashPageLocationAtLat);
    assert.equal(n.nodeValue, latValue, slashPageLocationAtLat);

    n = evalNodeSet(slashPageLocationAtLon, ctx)[0];
    assert.equal(n.nodeName, lon, slashPageLocationAtLon);
    assert.equal(n.nodeValue, lonValue, slashPageLocationAtLon);

    n = evalNodeSet(slashPageLocationAtLon, ctx1)[0];
    assert.equal(n.nodeName, lon, slashPageLocationAtLon);
    assert.equal(n.nodeValue, lonValue, slashPageLocationAtLon);
};

describe('xpath', () => {
    let xmlParser = new XmlParser();

    it('can parse the xpaths', () => {
        const xPath = new XPath();
        for (let i = 0; i < expr.length; ++i) {
            assert.ok(xPath.xPathParse(expr[i]), expr[i]);
        }
    });

    it('can evaluate variables on a HTML context', () => {
        const xPath = new XPath();
        const bodyEl = xmlParser.xmlParse(
            <body>
                <div id="test1"></div>
                <div id="testid">test1</div>
                <a id="jshref" href="javascript:doFoo('a', 'b')">
                    javascript href with spaces
                </a>
                <span id="u1" class="u"></span>
                <span id="u2" class="u"></span>
                <span id="u3" class="u"></span>
                <span style="visibility: visible">do not squint!</span>
            </body>
        );

        for (const e of numExpr) {
            let ctx = new ExprContext([bodyEl], []);
            ctx.setCaseInsensitive(true);
            if (e[2]) {
                for (const k in e[2] as any) {
                    const v = e[2][k];
                    if (typeof v == 'number') {
                        ctx.setVariable(k, new NumberValue(v));
                    } else if (typeof v == 'string') {
                        ctx.setVariable(k, new StringValue(v));
                    } else if (typeof v == 'boolean') {
                        ctx.setVariable(k, new BooleanValue(v));
                    }
                }
            }
            // allow exceptions to be caught and asserted upon
            let result;
            try {
                result = xPath.xPathParse(e[0] as any).evaluate(ctx);
            } catch (ex) {
                assert.equal(ex.message, e[1], ex.message);
                continue;
            }
            if (typeof e[1] == 'number') {
                assert.equal(e[1], result.numberValue(), e[0] as any);
            } else if (typeof e[1] == 'string') {
                assert.equal(e[1], result.stringValue(), e[0] as any);
            } else if (typeof e[1] == 'boolean') {
                assert.equal(e[1], result.booleanValue(), e[0] as any);
            }
        }
    });

    it('can evaluate axis on a context', () => {
        // For the following axis expressions, we need full control over the
        // entire document. We verify that they give the
        // right results by counting the nodes in their result node sets. For
        // the axes that contain only one node, we check that we found the
        // right node using the id. For axes that contain elements, we only
        // count the elements, so we don't have to worry about whitespace
        // normalization for the text nodes.
        const xPath = new XPath();

        const axisTests = [
            ["count(//*[@id='self']/ancestor-or-self::*)", 3],
            ["count(//*[@id='self']/ancestor::*)", 2],
            ["count(//*[@id='self']/attribute::node())", 1],
            ["count(//*[@id='self']/child::*)", 1],
            ["count(//*[@id='self']/descendant-or-self::*)", 3],
            ["count(//*[@id='self']/descendant::*)", 2],
            ["count(//*[@id='self']/following-sibling::*)", 3],
            ["count(//*[@id='self']/@*/following-sibling::*)", 0],
            ["count(//*[@id='self']/following::*)", 4],
            ["//*[@id='self']/parent::*/@id", 'parent'],
            ['count(/parent::*)', 0],
            ["count(//*[@id='self']/preceding-sibling::*)", 1],
            ["count(//*[@id='self']/@*/preceding-sibling::*)", 0],
            ["count(//*[@id='self']/preceding::*)", 2],
            ["//*[@id='self']/self::*/@id", 'self']
        ];

        const xml = [
            '<page>',
            ' <p></p>',
            ' <list id="parent">',
            '  <item></item>',
            '  <item id="self"><d><d></d></d></item>',
            '  <item></item>',
            '  <item></item>',
            '  <item></item>',
            ' </list>',
            ' <f></f>',
            '</page>'
        ].join('');
        const context = new ExprContext([xmlParser.xmlParse(xml)], []);

        for (const axisTest of axisTests) {
            const result = xPath.xPathParse(axisTest[0] as any).evaluate(context);
            if (typeof axisTest[1] === 'number') {
                assert.equal(result.numberValue(),axisTest[1], axisTest[0] as string);
            } else if (typeof axisTest[1] === 'string') {
                assert.equal(result.stringValue(), axisTest[1], axisTest[0] as string);
            } else if (typeof axisTest[1] === 'boolean') {
                assert.equal(result.booleanValue(), axisTest[1], axisTest[0] as string);
            }
        }
    });

    it('can handle attribute asterisk', () => {
        const xPath = new XPath();
        const ctx = new ExprContext([xmlParser.xmlParse('<x a="1" b="1"><y><z></z></y></x>')], []);
        const expr = xPath.xPathParse('count(/x/@*)');
        assert.equal(2, expr.evaluate(ctx).numberValue());
    });

    it('can eval dom', () => {
        const xml = [
            '<page>',
            '<request>',
            '<q>new york</q>',
            '</request>',
            '<location lat="100" lon="200"/>',
            '</page>'
        ].join('');

        doTestEvalDom(xml, 'page', 'location', 'lat', '100', 'lon', '200');
    });

    it('can eval Japanese dom', () => {
        const xml = [
            '<\u30da\u30fc\u30b8>',
            '<\u30ea\u30af\u30a8\u30b9\u30c8>',
            '<\u30af\u30a8\u30ea>\u6771\u4eac</\u30af\u30a8\u30ea>',
            '</\u30ea\u30af\u30a8\u30b9\u30c8>',
            '<\u4f4d\u7f6e \u7def\u5ea6="\u4e09\u5341\u4e94" ',
            "\u7d4c\u5ea6='\u767e\u56db\u5341'/>",
            '</\u30da\u30fc\u30b8>'
        ].join('');

        doTestEvalDom(
            xml,
            '\u30da\u30fc\u30b8',
            '\u4f4d\u7f6e',
            '\u7def\u5ea6',
            '\u4e09\u5341\u4e94',
            '\u7d4c\u5ea6',
            '\u767e\u56db\u5341'
        );
    });

    it('can handle whitespace', () => {
        const xmlString =
            '<div><p> Here is some <strong>funky </strong> text' +
            '<ul> <li>that contains</li> <li> spaces and stuff</li> </ul></p></div>';
        const value = xmlValue(xmlParser.xmlParse(xmlString));
        assert.equal(' Here is some funky  text that contains  spaces and stuff ', value);
    });

    it('has positional predicament determination', () => {
        // These XPaths all start with "//", which is equivalent to
        // "/descendant-or-self::node()/", a step unto itself. So we check the second
        // step for the positional predicate, not the first.
        const xPath = new XPath();

        const tests = [
            ['//a', false],
            ['//a[1]', true],
            ['//a[1][@foo]', true],
            ['//a[last()]', true],
            ['//a[position()=1]', true],
            ['//a[@foo]', false],
            ["//a[@foo='1']", false],
            ['//a[@foo and position()=2]', true],
            ['//a[(@foo or position()=2)]', true],
            ['//a[@foo][2]', true],
            ['//a[0+1]', true],
            ['//a[(0+1)]', true],
            ["//a[string-length('bar')]", true],
            ["//a[b[@baz='1'] and position()=2]", true],
            ['//a[b[1]]', false],
            ['//a[b[position()=1][2]]', false]
        ];

        for (const test of tests) {
            const xPathParseResult = xPath.xPathParse(test[0] as string);
            assert.equal(test[1], xPathParseResult.steps[1].hasPositionalPredicate, test[0] as string);
        }
    });

    it('returns on first match', () => {
        const xPath = new XPath();

        const xml = (
            <body>
                <a href="#">top</a>
                <div>
                    <a href="http://code.google.com/p/ajaxslt">ajaxslt</a>
                    <p>
                        <a href="http://sourceforge.net/projects/goog-ajaxslt/">old site</a>
                    </p>
                </div>
            </body>
        );
        const tests = [
            ['//a', 3],
            ["//a[contains(@href, 'ajaxslt')]", 2],
            ['//div/descendant::a', 2],
            ['(//div | //p)/a', 2],
            ['(//a)[2]', 1]
        ];

        const parsedXML = xmlParser.xmlParse(xml);
        const ctx = new ExprContext([parsedXML], []);

        for (const test of tests) {
            const expr = xPath.xPathParse(test[0] as any);

            ctx.setReturnOnFirstMatch(false);
            const normalResults = expr.evaluate(ctx);
            assert.equal(normalResults.value.length, test[1], `normal results count: ${test[0]}`);

            ctx.setReturnOnFirstMatch(true);
            const firstMatchResults = expr.evaluate(ctx);
            assert.equal(firstMatchResults.value.length, 1, `first match results count: ${test[0]}`);

            assert.equal(
                normalResults.value[0],
                firstMatchResults.value[0],
                `firstMatchResults[0] corresponds to normalResults[0]: ${test[0]}`
            );
        }
    });
});
