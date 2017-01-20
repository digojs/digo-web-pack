var digo = require("digo");

exports.default = function () {
    digo.src("fixtures/*").pipe("../", function (list, packer) {
        // list.src("*.js").pipe(packer.js);
        // list.src("*.css").pipe(packer.css);
        list.src("*.html").pipe(packer.html);
    }).pipe(file => console.log(file.content));
};
