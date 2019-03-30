
var fs = require('fs');

const {
	HTTPServer,
	RouteStaticFile,
	RouteError,
	RouteNotFound,
	RouteLocalReference,
	RoutePipeline,
	First,
	Negotiate,
} = require('dive-httpd');

var Markdown = require( "./lib/Markdown.js" ).Markdown;
var RenderTemplate = require( "./lib/RenderTemplate.js" ).RenderTemplate;
var RenderBindings = require( "./lib/RenderBindings.js" ).RenderBindings;
var RenderTheme = require( "./lib/RenderTheme.js" ).RenderTheme;
var RenderEditLink = require( "./lib/RenderEditLink.js" ).RenderEditLink;
var RouteGitLog = require( "./lib/RouteGitLog.js" ).RouteGitLog;
var RouteLunrIndex = require( "./lib/RouteLunrIndex.js" ).RouteLunrIndex;
var RouteTTL = require( "./lib/RouteTTL.js" ).RouteTTL;
var RouteNT = require( "./lib/RouteNT.js" ).RouteNT;
var RouteNQ = require( "./lib/RouteNQ.js" ).RouteNQ;
var IndexRDFa = require( "./lib/IndexRDFa.js" ).IndexRDFa;

const docroot = __dirname + '/web';

var options = new HTTPServer;
options.fixedScheme = 'http';
options.fixedAuthority = 'localhost';
options.RouteNotFound = RouteNotFound;
options.RouteError = RouteError;
var routes = options.routes;

// Alias / to /index.xml
var routeIndex = RouteLocalReference(routes, "http://localhost{/path*}/index");
routeIndex.routerURITemplate = 'http://localhost{/path*}/';
options.addRoute(routeIndex);

function gRenderEditLink(res){
	return new RenderEditLink(__dirname, {
		'edit-form': 'https://github.com/awwright/fullstackwiki/blob/master',
		'version-history': 'https://github.com/awwright/fullstackwiki/commits/master',
	});
}

const HTMLSource = RoutePipeline(RouteStaticFile({
	uriTemplate: 'http://localhost{/path*}.xml',
	contentType: 'application/xml',
	fileroot: docroot,
	pathTemplate: "{/path*}.xml",
	filepathLink: true,
	filepathAuthority: 'fullstack.wiki',
	filepathRel: 'tag:fullstack.wiki,2018:ns/source',
}), gRenderEditLink);
HTMLSource.name = 'RenderEditLink';
options.addRoute(HTMLSource);

const MarkdownSource = RoutePipeline(RouteStaticFile({
	uriTemplate: 'http://localhost{/path*}.md',
	contentType: 'text/markdown',
	fileroot: docroot,
	pathTemplate: "{/path*}.md",
	filepathLink: true,
	filepathAuthority: 'fullstack.wiki',
	filepathRel: 'tag:fullstack.wiki,2018:ns/source',
}), gRenderEditLink);
MarkdownSource.name = 'RenderEditLink';
options.addRoute(MarkdownSource);

// Source code
var routeSourceHTML = First([
	HTMLSource,
	RoutePipeline(MarkdownSource, Markdown),
]);
routeSourceHTML.routerURITemplate = 'http://localhost{/path*}.src.xml';
options.addRoute(routeSourceHTML);

// Rendering happens in three stages:
// 1. Template: substitute in template calls and other manipulations that will make it into the RDF index
// 2. Bindings: use the RDF index to fill out data bindings for fulltext index
// 3. Theme: generate themed page for Web browsers

// // Rendered HTML but plain (no) theme
var routeTemplate = RoutePipeline({
	routerURITemplate: 'http://localhost{/path*}.tpl.xml',
	contentType: 'application/x.wiki.fullstack.template+xml',
	outboundTransform: RenderTemplate,
	innerRoute: routeSourceHTML,
});
options.addRoute(routeTemplate);

// Rendered HTML but plain (no) theme
function gRenderBindings(res){
	return new RenderBindings(indexRDFa.graph, res);
}
var routePlain = RoutePipeline({
	routerURITemplate: 'http://localhost{/path*}.plain.xml',
	contentType: 'application/x.wiki.fullstack.plain+xml',
	outboundTransform: gRenderBindings,
	innerRoute: routeTemplate,
});
options.addRoute(routePlain);

// Fully rendered theme
// Later, put this on <http://localhost{/path*}.xhtml> and
// make <http://localhost{/path*}> a Content-Type negotiation version
function gRenderTheme(res){
	return new RenderTheme(indexRDFa.graph, res);
}
var routeThemed = RoutePipeline({
	routerURITemplate: 'http://localhost{/path*}.html',
	contentType: 'application/xhtml+xml',
	outboundTransform: gRenderTheme,
	innerRoute: routePlain,
});
options.addRoute(routeThemed);

var routeBest = Negotiate('http://localhost{/path*}', [
	routeThemed,
	routePlain,
	routeTemplate,
	routeSourceHTML,
]);
options.addRoute(routeBest);

// The Recent Changes page, which is a Git log
var routeRecent = RoutePipeline(RouteGitLog({
	uriTemplate: 'http://localhost/recent',
	title: 'Recent Changes',
	fs: fs,
	dir: __dirname,
	ref: 'HEAD'
}), [gRenderTheme]);
options.addRoute(routeRecent);

// Codemirror dependencies
// routes.addTemplate('http://localhost/style/codemirror{/path*}.css', {}, RouteStaticFile(__dirname+'/codemirror', "{/path*}.css", 'text/css') );
// routes.addTemplate('http://localhost/style/codemirror{/path*}.js', {}, RouteStaticFile(__dirname+'/codemirror', "{/path*}.js", 'application/ecmascript') );
// routes.addTemplate('http://localhost/style/highlight.js/{path}.css', {}, RouteStaticFile(__dirname+'/node_modules/highlight.js/styles/', "/{path}.css", 'text/css') );

// Render files
// routes.addTemplate('http://localhost/style/app.js', {}, RouteBrowserify(docroot+'/style/main.js', "App", 'application/ecmascript') );
var routeScript = RouteStaticFile(docroot+'/style', "{/path*}.js", 'application/ecmascript');
routeScript.routerURITemplate = 'http://localhost/style{/path*}.js';
options.addRoute(routeScript);

var routeStyle = RouteStaticFile(docroot+'/style', "{/path*}.css", 'text/css');
routeStyle.routerURITemplate = 'http://localhost/style{/path*}.css';
options.addRoute(routeStyle);

var indexRDFaRoutes = routes.routes.filter(function(v){
	return [
		'http://localhost{/path*}',
	].indexOf(v.template)>=0;
});

var indexRDFa = new IndexRDFa(options);
indexRDFaRoutes.forEach(function(route){
	indexRDFa.import(route);
});

var routeLunrIndex = RouteLunrIndex({
	uriTemplate: 'http://localhost/search-index.js',
	exportName: 'searchIndex',
	routes: indexRDFaRoutes,
});
options.addRoute(routeLunrIndex);

var RouteGraphTTL = RouteTTL({
	uriTemplate: 'http://localhost/graph.ttl',
	index: indexRDFa,
});
options.addRoute(RouteGraphTTL);

var routeGraphNT = RouteNT({
	uriTemplate: 'http://localhost/graph.nt',
	index: indexRDFa,
});
options.addRoute(routeGraphNT);

var routeGraphNT = RouteNQ({
	uriTemplate: 'http://localhost/graph.nq',
	index: indexRDFa,
});
options.addRoute(routeGraphNT);

module.exports = options;
