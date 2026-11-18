<?xml version="1.0"?>
<!-- RASH (serialized head metadata) -> LaTeX preamble and metadata for the Cambridge Large1 template (class cup-journal; journal= chr, pri, rdi or large), from its sample.tex.
     The escaped body and abstract come from toLaTeX as parameters, so its sanitising stays in one place. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="text"/>
<xsl:param name="abstract"/>
<xsl:param name="body"/>

<xsl:template name="tex">
  <xsl:param name="s"/>
  <xsl:if test="string-length($s) &gt; 0">
    <xsl:variable name="c" select="substring($s, 1, 1)"/>
    <xsl:choose>
      <xsl:when test="$c = ' '"><xsl:text> </xsl:text></xsl:when><!-- the processor drops a bare space from value-of -->
      <xsl:when test="$c = '\'">\textbackslash{}</xsl:when>
      <xsl:when test="$c = '^'">\^{}</xsl:when>
      <xsl:when test="$c = '~'">\~{}</xsl:when>
      <xsl:when test="contains('{}$&amp;#%_', $c)">\<xsl:value-of select="$c"/></xsl:when>
      <xsl:otherwise><xsl:value-of select="$c"/></xsl:otherwise>
    </xsl:choose>
    <xsl:call-template name="tex"><xsl:with-param name="s" select="substring($s, 2)"/></xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template match="/html">
  <xsl:variable name="meta" select="head/meta"/>
  <!-- The journal is one of the class's own codes; anything else falls back to chr, so a head value cannot add class options. -->
  <xsl:variable name="journal-raw" select="$meta[@property = 'writ:cambridge.journal']/@content"/>
  <xsl:variable name="journal"><xsl:choose><xsl:when test="$journal-raw = 'pri' or $journal-raw = 'rdi' or $journal-raw = 'large'"><xsl:value-of select="$journal-raw"/></xsl:when><xsl:otherwise>chr</xsl:otherwise></xsl:choose></xsl:variable>
  <xsl:variable name="manuscript" select="translate($meta[@property = 'writ:cambridge.manuscript']/@content, ',=[]{}\ ', '')"/>
  <xsl:variable name="volume" select="translate($meta[@property = 'writ:cambridge.volume']/@content, ',=[]{}\ ', '')"/>
  <xsl:variable name="year" select="substring($meta[@property = 'dcterms:issued']/@content, 1, 4)"/>
  <xsl:text>\documentclass[journal=</xsl:text><xsl:value-of select="$journal"/>
  <xsl:if test="string-length($manuscript) &gt; 0"><xsl:text>,manuscript=</xsl:text><xsl:call-template name="tex"><xsl:with-param name="s" select="$manuscript"/></xsl:call-template></xsl:if>
  <xsl:if test="string-length($year) = 4 and number($year) = number($year)"><xsl:text>,year=</xsl:text><xsl:value-of select="$year"/></xsl:if>
  <xsl:if test="string-length($volume) &gt; 0"><xsl:text>,volume=</xsl:text><xsl:call-template name="tex"><xsl:with-param name="s" select="$volume"/></xsl:call-template></xsl:if>
  <xsl:text>]{cup-journal}
\usepackage{amsmath}
\usepackage[nopatch]{microtype}
\usepackage{booktabs}
\title{</xsl:text><xsl:call-template name="tex"><xsl:with-param name="s" select="head/title"/></xsl:call-template><xsl:text>}
</xsl:text>
  <xsl:for-each select="$meta[@name = 'dc.creator']">
    <xsl:variable name="who" select="@about"/>
    <xsl:variable name="name" select="@content"/>
    <xsl:text>
\author{</xsl:text><xsl:call-template name="tex"><xsl:with-param name="s" select="$name"/></xsl:call-template><xsl:text>}
</xsl:text>
    <!-- The class reuses an affiliation only on an exact string match, so whitespace is normalised. -->
    <xsl:for-each select="../link[@about = $who][@property = 'schema:affiliation']">
      <xsl:variable name="org" select="@href"/>
      <xsl:text>\affiliation{</xsl:text><xsl:call-template name="tex"><xsl:with-param name="s" select="normalize-space($meta[@about = $org]/@content)"/></xsl:call-template><xsl:text>}
</xsl:text>
    </xsl:for-each>
    <xsl:if test="$meta[@about = $who][@content = 'corresponding author']">
      <xsl:for-each select="$meta[@about = $who][@property = 'schema:email']">
        <xsl:text>\email[</xsl:text><xsl:call-template name="tex"><xsl:with-param name="s" select="$name"/></xsl:call-template><xsl:text>]{</xsl:text>
        <xsl:call-template name="tex"><xsl:with-param name="s" select="@content"/></xsl:call-template><xsl:text>}
</xsl:text>
      </xsl:for-each>
    </xsl:if>
  </xsl:for-each>
  <xsl:if test="$meta[@property = 'prism:keyword']">
    <xsl:text>
\keywords{</xsl:text>
    <xsl:for-each select="$meta[@property = 'prism:keyword']">
      <xsl:if test="position() &gt; 1">, </xsl:if>
      <xsl:call-template name="tex"><xsl:with-param name="s" select="@content"/></xsl:call-template>
    </xsl:for-each>
    <xsl:text>}
</xsl:text>
  </xsl:if>
  <!-- No \maketitle: the class prints the title block itself, and the metadata above must come before \begin{document}. -->
  <xsl:text>
\begin{document}

</xsl:text>
  <xsl:if test="string-length($abstract) &gt; 0">\begin{abstract}
<xsl:value-of select="$abstract"/>
\end{abstract}

</xsl:if>
  <xsl:value-of select="$body"/><xsl:text>\end{document}
</xsl:text>
</xsl:template>
</xsl:stylesheet>
