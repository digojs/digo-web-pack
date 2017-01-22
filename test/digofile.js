var digo = require("digo");

exports.default = function () {
    digo.src("fixtures/*/*").pipe("../").dest("_build");
};
