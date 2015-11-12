
var Path = require("path");
var tpack = require('tpack');

var input = tpack.options[2];
var output = tpack.options[3];

if(!input || !output) {
	console.log("Usage: node cli.js input.js output.js");
	return;
}

input = tpack.getName(Path.resolve(input));
output = tpack.getName(Path.resolve(output));

tpack.src("*").pipe(require("./index.js"), {
	nodejs: true
}).dest(output);

tpack.buildFile(input);