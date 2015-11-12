
var tpack = require('tpack');

var input = tpack.options[2];
var output = tpack.options[3];

if(!input || !output) {
	console.log("Usage: node cli.js input.js output.js");
	return;
}

input = tpack.getName(input);
output = tpack.getName(output);

tpack.src("*").pipe(require("./index.js"), {
	nodejs: true
}).dest(output);

tpack.buildFile(input);