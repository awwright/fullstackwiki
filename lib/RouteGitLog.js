
"use strict";

var fs = require('fs');
var inherits = require('util').inherits;
var TemplateRouter = require('uri-template-router');
var git = require('isomorphic-git');
var escapeHTML = require('./html-escape.js').escapeHTML;


var Route = require('dive-httpd').Route;
var Resource = require('dive-httpd').Resource;
var PassThrough = require('http-transform').PassThrough;

inherits(RouteGitLog, Route);
module.exports.RouteGitLog = RouteGitLog;
function RouteGitLog(options, pipe){
	if(!(this instanceof RouteGitLog)) return new RouteGitLog(options, pipe);
	if(typeof options!=='object') throw new Error('Expected object `options`');
	if(typeof pipe!=='function') throw new Error('Expected function `ct`');
	this.options = options;
	this.pipe = pipe;
	Route.call(this);
}
RouteGitLog.prototype.ResourceGitLog = ResourceGitLog;
RouteGitLog.prototype.prepare = function prepare(match, euri, queryMap){
	// this.target might have a URI Template expression. Substutite route.variables into this.
	var self = this;
	return Promise.resolve(new self.ResourceGitLog(self, euri, match, self.options));
};
RouteGitLog.prototype.index = function index(routes){
	// iterate through all files that match the pattern and return them
	var self = this;
	var files = [];
	function ls(dir){
		fs.readdirSync(self.base+'/'+dir).forEach(function(filename){
			var result = self.pathResolve.resolveURI(dir+'/'+filename);
			if(result && result.data) files.push(result.data);
			if(fs.statSync(self.base+'/'+dir+'/'+filename).isDirectory()) ls(dir+'/'+filename);
		});
	}
	ls('');
	return files;
};

inherits(ResourceGitLog, Route);
module.exports.ResourceGitLog = ResourceGitLog;
function ResourceGitLog(route, euri, match, options){
	if(!(this instanceof ResourceGitLog)) return new ResourceGitLog(route, euri, match);
	this.route = route;
	this.euri = euri;
	this.match = match;
	this.options = options;
}
ResourceGitLog.prototype.render = function render(req, res, route, euri, queryMap){
	// this.target might have a URI Template expression. Substutite route.variables into this.
	var self = this;
	var out = new PassThrough;
	out.setHeader('Content-Type', 'application/xhtml+xml');
	console.log(self.options);
	git.log(self.options).then(function(commits){
		console.log(commits);
		out.end(`<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:w="http://fullstack.wiki/ns/" lang="en" dir="ltr">
	<head>
		<meta charset="UTF-8" />
		<title>JSON Schema</title>
	</head>
	<body>
		<main><ol class="commits-listing">${commits.map(function(c){
			return `<li class="commit">
<p>${escapeHTML(c.message)}</p>
<div>${escapeHTML(c.author.name)} on <date>${new Date(c.author.timestamp*1000).toISOString()}</date></div>
<pre type="application/json">${escapeHTML(JSON.stringify(c,null,"\t"))}</pre>
</li>`;
		}).join('\n')}</ol></main>
	</body>
</html>
`);

	});
	return self.route.pipe(out);
};