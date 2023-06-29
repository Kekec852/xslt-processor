/* eslint-disable no-undef */
import assert from 'assert';

import React from 'react';
import { dom } from 'isomorphic-jsx';

import { Xslt } from '../src/xslt';
import { xmlParse } from '../src/dom/functions';

// Just touching the `dom`, otherwise Babel prunes the import.
console.log(dom);
describe('local-name', () => {

  it('local-name() without namespace test', () => {
    const xmlString = <root>
      <test name="test1" />
      <test name="test2" />
      <test name="test3" />
      <test name="test4" />
    </root>;

    const xsltString = '<?xml version="1.0"?>' +
      <xsl:stylesheet version="1.0">
        <xsl:template match="test">
          <span> <xsl:value-of select="@name" /> </span>
        </xsl:template>
        <xsl:template match="root">
          <xsl:element name="{local-name()}">
            <xsl:apply-templates select="test"/>
          </xsl:element>
        </xsl:template>
        <xsl:template match="/">
          <xsl:apply-templates select="root"/>
        </xsl:template>
      </xsl:stylesheet>;

    const expectedOutString = <root>
      <span>test1</span>
      <span>test2</span>
      <span>test3</span>
      <span>test4</span>
    </root>;

    const xsltClass = new Xslt();
    const xml = xmlParse(xmlString);
    const xslt = xmlParse(xsltString);

    const outXmlString = xsltClass.xsltProcess(
      xml,
      xslt
    );

    assert.equal(
      outXmlString,
      expectedOutString
    );
  })

  it('local-name() with namespace test', () => {
    const xmlString = <xhtml:root xmlns:xhtml="http://www.w3.org/1999/xhtml">
      <test name="test1" />
      <test name="test2" />
      <test name="test3" />
      <test name="test4" />
    </xhtml:root>;

    const xsltString = '<?xml version="1.0"?>' +
      <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:xhtml="http://www.w3.org/1999/xhtml">
        <xsl:template match="test">
          <span> <xsl:value-of select="@name" /> </span>
        </xsl:template>
        <xsl:template match="xhtml:root">
          <xsl:element name="{local-name()}">
            <xsl:apply-templates select="test"/>
          </xsl:element>
        </xsl:template>
        <xsl:template match="/">
          <xsl:apply-templates select="xhtml:root"/>
        </xsl:template>
      </xsl:stylesheet>;

    const expectedOutString = <root>
      <span>test1</span>
      <span>test2</span>
      <span>test3</span>
      <span>test4</span>
    </root>;

    const xsltClass = new Xslt();
    const xml = xmlParse(xmlString);
    const xslt = xmlParse(xsltString);

    const outXmlString = xsltClass.xsltProcess(
      xml,
      xslt
    );

    assert.equal(
      outXmlString,
      expectedOutString
    );
  })

})
