var digo = require("digo");
var assert = require("assert");

describe("html", function () {

    it("basic", function () {
        assert.equal(buildHtml('<img/>'), '<img/>');
        assert.equal(buildHtml('<img src="ref.jpg" />'), '<img src="ref.jpg" />');
    });

    it("url-ignore", function () {
        assert.equal(buildHtml('<img src="404.jpg?__ignore" />'), '<img src="404.jpg" />');
    });

    it("url-inline", function () {
        assert.equal(buildHtml('<img src="ref.jpg?__inline" />'), '<img src="data:image/jpeg;base64,cmVmLmpwZw==" />');
        assert.equal(buildHtml('<img src="ref.jpg?__inline=10000" />'), '<img src="data:image/jpeg;base64,cmVmLmpwZw==" />');
        assert.equal(buildHtml('<img src="ref.jpg?__inline=1" />'), '<img src="ref.jpg" />');
        assert.equal(buildHtml('<img src="ref.jpg?__inline=false" />'), '<img src="ref.jpg" />');

        assert.equal(buildHtml('<link rel="stylesheet" href="body.css?__inline">'), '<style>body { color: red }</style>');
        assert.equal(buildHtml('<link rel="stylesheet" href="body.css?__inline"/>'), '<style>body { color: red }</style>');
        assert.equal(buildHtml('<link rel="stylesheet" href="body.css?__inline" />'), '<style>body { color: red }</style>');
        assert.equal(buildHtml('<link rel="stylesheet" href="body.css?__inline" id="style" />'), '<style id="style">body { color: red }</style>');
        assert.equal(buildHtml('<link rel="favicon" href="ref.jpg?__inline">'), '<link rel="favicon" href="data:image/jpeg;base64,cmVmLmpwZw==">');
        assert.equal(buildHtml('<link rel="favicon" href=ref.jpg?__inline>'), '<link rel="favicon" href="data:image/jpeg;base64,cmVmLmpwZw==">');
        assert.equal(buildHtml('<link rel="favicon" href=\'ref.jpg?__inline\'>'), '<link rel="favicon" href=\'data:image/jpeg;base64,cmVmLmpwZw==\'>');
        assert.equal(buildHtml('<style src="body.css?__inline"></style>'), '<style>body { color: red }</style>');

        assert.equal(buildHtml('<script src="body.js?__inline"></script>'), '<script>alert("hello")</script>');
        assert.equal(buildHtml('<script src="body.js?__inline" type="text/javascript"></script>'), '<script type="text/javascript">alert("hello")</script>');
        assert.equal(buildHtml('<script src="body.css?__inline" type="text/template"></script>'), '<script type="text/template">body { color: red }</script>');
        assert.equal(buildHtml('<script src="body.js?__inline" type="text/typescript"></script>'), '<script>alert("hello")</script>');

        assert.equal(buildHtml('<img srcset="ref.jpg?__inline 1x" />'), '<img srcset="data:image/jpeg;base64,cmVmLmpwZw== 1x" />');
        assert.equal(buildHtml('<img srcset="ref.jpg?__inline 1x, ref.jpg?__inline 2x" />'), '<img srcset="data:image/jpeg;base64,cmVmLmpwZw== 1x, data:image/jpeg;base64,cmVmLmpwZw== 2x" />');
    });

    it("url-append", function () {
        assert.equal(buildHtml('<img src="ref.jpg?_=__hash" />'), '<img src="ref.jpg?_=d31e28" />');
        assert.equal(buildHtml('<img src="ref.jpg?_=__md5" />'), '<img src="ref.jpg?_=6f31d3a30af9c12475cc901d8083be7e" />');
        assert.equal(buildHtml('<img src="ref.jpg?_=__md5:6" />'), '<img src="ref.jpg?_=6f31d3" />');
    });

});

describe("css", function () {

    it("basic", function () {
        assert.equal(buildCss('.sel { line-height: 10px; }'), '.sel { line-height: 10px; }');
    });

    it("url-inline", function () {
        assert.equal(buildCss('.sel { background-image: url(ref.jpg?__inline); }'), '.sel { background-image: url(data:image/jpeg;base64,cmVmLmpwZw==); }');
    });

    it("url-import", function () {
        assert.equal(buildCss('@import url("body.css"); .sel { line-height: 10px; }'), 'body { color: red }\n\n .sel { line-height: 10px; }');
        assert.equal(buildCss('@import url("body.css?__inline=false"); .sel { line-height: 10px; }'), '@import url("body.css"); .sel { line-height: 10px; }');
        assert.equal(buildCss('@import url("body.css?__inline=1"); .sel { line-height: 10px; }'), '@import url("body.css"); .sel { line-height: 10px; }');
        assert.equal(buildCss('@import url("body.css?__inline=100000"); .sel { line-height: 10px; }'), 'body { color: red }\n\n .sel { line-height: 10px; }');
    });

});

describe("js", function () {

    it("basic", function () {
        assert.equal(buildJs('alert("hi")'), 'alert("hi")');
    });

    it("require", function () {
        assert.equal(buildJs('require("./body.js");'), `digo.define("body.js", function (require, exports, module) {
\talert('hello')
});

digo.define("main.js", function (require, exports, module) {
\trequire("./body.js");
});`);
        assert.equal(buildJs('require("./body.css");'), `digo.define("body.css", function (require, exports, module) {
\tmodule.exports = digo.style("body { color: red }");
});

digo.define("main.js", function (require, exports, module) {
\trequire("./body.css");
});`);
    });

});

function buildHtml(input) {
    return build({
        "main.html": input,
        "body.css": 'body { color: red }',
        "body.js": 'alert("hello")',
        "ref.jpg": 'ref.jpg',
    });
}

function buildCss(input) {
    return build({
        "main.css": input,
        "body.css": "body { color: red }",
        "body.js": "alert('hello')",
        "ref.jpg": "ref.jpg",
    });
}

function buildJs(input) {
    return build({
        "main.js": input,
        "body.css": "body { color: red }",
        "body.js": "alert('hello')",
        "ref.jpg": "ref.jpg",
    });
}

function build(files) {
    var firstFile;
    var list = new digo.FileList();
    list.pipe(require("../"), function (list, packer) {
        list.src("*.js").pipe(packer.js, {
            require: {
                loader: false,
                libraryTarget: "lib"
            }
        });
        list.src("*.css").pipe(packer.css);
        list.src("*.html").pipe(packer.html);
    });

    for (const path in files) {
        var file = new digo.File(path);
        firstFile = firstFile || file;
        file.content = files[path];
        list.add(file);
    }
    list.end();

    return firstFile.content;
}