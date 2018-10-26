
const inherits = require('util').inherits;

const DOMParser = require('xmldom').DOMParser;
var escapeHTML = require('./html-escape.js').escapeHTML;

const ServerResponseTransform = require('dive-httpd').ServerResponseTransform;

module.exports.RenderTheme = RenderTheme;

function createElement(document, name, attr, children){
	var e = document.createElement(name);
	if(typeof attr=='object') for(var k in attr){
		e.setAttribute(k, attr[k]);
	}
	if(Array.isArray(children)) children.forEach(function(f){
		e.appendChild(f);
	});
	return e;
}

inherits(RenderTheme, ServerResponseTransform);
function RenderTheme(){
	if(!(this instanceof RenderTheme)) return new RenderTheme();
	ServerResponseTransform.call(this);
	this.sourceContents = '';
};
RenderTheme.prototype.name = 'RenderTheme';
RenderTheme.prototype._transformHead = function _transformHead(headers){
	headers.setHeader('Content-Type', 'application/xhtml+xml');
	return headers;
};
RenderTheme.prototype._transform = function _transform(data, encoding, callback){
	this.sourceContents += data.toString();
	callback(null);
};
RenderTheme.prototype._flush = function (callback){
	const xml = new DOMParser().parseFromString(this.sourceContents); // xsltString: string of xslt file contents
	const self = this;
	function mapChildren(node, fn){
		return Array.prototype.slice.call(node.childNodes).map(function(nn){
				return fn(nn);
		});
	}
	function mapAttributes(node, fn){
		return Array.prototype.slice.call(node.attributes).map(function(nn){
				return fn(nn);
		});
	}
	function applyTemplate(doc){
		// If node is not an element, return XML representation
		if(!doc.childNodes){
			return doc.toString();
		}
		if(doc.localName=='h' || doc.localName=='h1' || doc.localName=='h2' || doc.localName=='h3' || doc.localName=='h4' || doc.localName=='h5' || doc.localName=='h6'){
			// Keep an index of the headings, for a Table of Contents later on
			tocSections.push({
				level: parseInt(doc.localName[1]),
				labelHTML: mapChildren(doc, applyTemplate).join(''),
				id: doc.hasAttribute('id') && doc.getAttribute('id'),
				element: doc,
			});
			return '<'+doc.localName+mapAttributes(doc, applyTemplate).join('')+'>' + mapChildren(doc, applyTemplate).join('') + '</'+doc.localName+'>';
		}
		if(doc.localName=='main'){
			return mapChildren(doc, applyTemplate).join('');
		}
		if(doc.localName=='a'){
			return '<a'+mapAttributes(doc, function(attr){
				if(attr.name=='href' && attr.value.match(/^[a-zA-Z+-]+:/)==null){
					attr = attr.cloneNode();
					//attr.value = attr.value.replace(/\/index\.(xml|xhtml|html|md)$/, '/').replace(/\.(xml|xhtml|html|md)$/, '');
					attr.value = attr.value.replace(/\.(xml|xhtml|html|md)$/, '');
				}
				return applyTemplate(attr);
			}).join('')+'>' + mapChildren(doc, applyTemplate).join('') + '</'+doc.localName+'>';
		}
		// Else, serialize the element
		if(doc.childNodes.length){
			return '<'+doc.localName+mapAttributes(doc, applyTemplate).join('')+'>' + mapChildren(doc, applyTemplate).join('') + '</'+doc.localName+'>';
		}else{
			return '<'+doc.localName+mapAttributes(doc, applyTemplate).join('')+'/>';
		}
	}
	const editLink = '';
	const eTitle = xml.getElementsByTagName('title')[0].textContent;
	const eMain = xml.getElementsByTagName('main')[0] || xml.getElementsByTagName('body')[0];
//	try {
//		var baseURI = filepath.replace(/^web\//, 'http://fullstack.wiki/');
//		var result = rdfa.RDFaXHTMLParser.parse(baseURI, document);
//		console.log(result.outputGraph.toArray().map(function(t){ return t.toString()+'\n'; }).join(''));
//	}catch(err){
//		console.error(err.stack);
//	}

	const tocSections = [];
	const mainHTML = applyTemplate(eMain);
	const tocHTML = tocSections.concat([{level:0}]).reduce(function(state, item){
		var html = state.html;
		for(var i=state.level; i<item.level; i++) html += '<ol>';
		for(var i=state.level; i>item.level; i--) html += '</ol>';
		if(item.labelHTML) html += '<li>'+(item.id ? '<a href="#'+escapeHTML(item.id)+'">'+item.labelHTML+'</a>' : item.labelHTML)+'</li>';
		return {html:html, level:item.level};
	}, {html:'', level:0}).html;
	const langText = xml.documentElement.getAttribute('xml:lang') || xml.documentElement.getAttribute('lang');
	const langHTML = langText ? escapeHTML(langText) : '';
	// List the default stylesheet first to indicate it's the most important
	const links = [
		createElement(xml, 'link', {rel:'stylesheet', href:'/style/default.css'}),
	].concat([].slice.call(xml.getElementsByTagName('link'))).join('\n\t\t');
	// Ensure the charset meta is first because HTML will be HTML
	const metas = [
		createElement(xml, 'meta', {'charset':'UTF-8'}),
		createElement(xml, 'meta', {'http-equiv':'Content-Type', 'content':'application/xhtml+xml;charset=utf-8'}),
		createElement(xml, 'meta', {'name':'viewport', 'value':'width=device-width, initial-scale=1, maximum-scale=1'}),
	].concat([].slice.call(xml.getElementsByTagName('meta')))
		.filter(function(e){ return e.getAttribute('charset')!=='UTF-8' }).join('\n\t\t');
	if(langText) self.setHeader('Content-Language', langText);
	self.push(`<!-- -->
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${langHTML}" lang="${langHTML}" version="XHTML+RDFa 1.0" dir="ltr">
	<head profile="http://www.w3.org/1999/xhtml/vocab">
		${metas}
		<title>${eTitle.toString()} | Fullstack.wiki</title>
		${links}
		<!-- the search runner will use this id= to get the src attribute -->
		<script id="search-runner-script" type="application/ecmascript" src="/style/search-runner.js"></script>
	</head>
	<body class="pagewidth">
		<div class="site-header">
			<div id="skip-link">
				<a href="#main-content">Skip to main content</a>
			</div>
			<header>
				<ul>
					<li><h1><a href="/">Fullstack.wiki</a></h1></li>
					<li><a href="/recent">Recent changes</a></li>
					<li><a href="/tools/index">Tools</a></li>
					<li><a href="/about/index">About</a></li>
				</ul>
				<form id="searchform" action="/index.xhtml">
					<input type="search" name="q" id="search" placeholder="Search..." title="Search [ctrl-option-f]" accesskey="f" />
				</form>
				<div id="search-results">
					<div class="search-results-header">Search Results</div>
					<table><tbody id="search-results-list"></tbody></table>
				</div>
			</header>
		</div>
		<div class="columns">
			<div class="toc">${tocHTML}</div>
			<main id="main-content">
				${editLink ? `<div id="edit"><a href="${editLink}">Edit</a></div>` : ''}
				${mainHTML}
			</main>
			<footer>
				<a href="https://twitter.com/intent/tweet?screen_name=awwscript&amp;ref_src=twsrc%5Etfw" class="twitter-mention-button" data-show-count="false">Tweet to @awwscript</a>
			</footer>
		</div>
	</body>
</html>
`);
	callback();
};