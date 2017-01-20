var digo = digo || {
    cache: { __proto__: null },
    define: function (moduleName, factory) {
        digo.cache[moduleName.toLowerCase()] = {
            loaded: false,
            define: factory,
            require: function (module, callback) {
                return digo.require(module, callback, moduleName);
            },
            exports: {}
        };
    },
    require: function (moduleName, callback, baseUrl, data) {
        if (typeof moduleName === "string") {
            var module = digo.cache[digo.resolve(moduleName, baseUrl).toLowerCase()];
            if (typeof callback === "function") {
                if (module) {
                    setTimeout(callback, 0, digo.require(moduleName, undefined, baseUrl), data);
                } else {
                    digo.async((digo.baseUrl || "") + digo.resolve(moduleName, baseUrl), function () {
                        callback(digo.require(moduleName, undefined, baseUrl), data);
                    });
                }
            } else {
                if (!module) {
                    throw "Cannot find module '" + moduleName + "'";
                }
                if (!module.loaded) {
                    module.loaded = true;
                    module.define(module.require, module.exports, module);
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
                    }, baseUrl, i);
                }
            } else {
                callback && callback(this);
            }
        }
    },
    resolve: function (moduleName, baseUrl) {
        var anchor = digo.anchor || (digo.anchor = document.createElement("a"));
        anchor.href = "/";
        var href = anchor.href;
        anchor.href = "/" + (baseUrl || "_") + "/../" + moduleName;
        return anchor.href.substr(href.length);
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

