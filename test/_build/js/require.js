var digo = digo || {
    cache: { __proto__: null },
    define: function (moduleName, factory) {
        digo.cache[moduleName.toLowerCase()] = {
            loaded: false,
            define: factory,
            exports: {}
        };
    },
    require: function (moduleName, callback, data) {
        if (typeof moduleName === "string") {
            var module = digo.cache[moduleName.toLowerCase()];
            if (typeof callback === "function") {
                if (module) {
                    setTimeout(callback, 0, digo.require(moduleName), data);
                } else {
                    digo.async((digo.baseUrl || "") + moduleName + (digo.urlArgs || ""), function () {
                        callback(digo.require(moduleName), data);
                    });
                }
            } else {
                if (!module) {
                    throw "Cannot find module '" + moduleName + "'";
                }
                if (!module.loaded) {
                    module.loaded = true;
                    module.define(digo.require, module.exports, module);
                }
                return module.exports;
            }
        } else {
            var pending = moduleName.length;
            if (pending) {
                var exports = [];
                for (var i = 0; i < pending; i++) {
                    digo.require(moduleName[i], function (moduleExport, i) {
                        exports[i] = moduleExport;
                        --pending < 1 && callback && callback.apply(this, exports);
                    }, i);
                }
            } else {
                callback && callback(this);
            }
        }
    },
    async: function (url, callback) {
        var script = document.createElement("script");
        script.async = true;
        script.onload = callback;
        script.src = url;
        return (document.head || document.getElementsByTagName("head")[0] || document.documentElement).appendChild(script);
    },
    style: function (content) {
        return (document.head || document.getElementsByTagName("head")[0] || document.documentElement).appendChild(document.createElement('style')).innerHTML = content;
    }
};

digo.define("fixtures/js/modules/module-C.css", function (require, exports, module) {
	module.exports = digo.style("body {\r\n    background: yellow;\r\n}");
});

digo.define("fixtures/js/modules/module-B.js", function (require, exports, module) {
	module.exports = "world";
});

digo.define("fixtures/js/modules/module-A.js", function (require, exports, module) {
	require("fixtures/js/modules/module-C.css");
	alert("hello " + require("fixtures/js/modules/module-B.js"));
});

digo.define("fixtures/js/require.js", function (require, exports, module) {
	require("fixtures/js/modules/module-A.js");
});

var exports = digo.require("fixtures/js/require.js");