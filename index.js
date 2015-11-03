
var Path = require('path');
var Lang = require('tealweb/lang');
var IO = require('tealweb/io');

// #region 导出

/**
 * Tpack 解析模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体的配置值为：
 * * @property {Boolean} [resolveComments=true] 是否解析注释内的 #include 等指令。
 * * @property {Boolean} [resolveCommonJsRequires=true] 是否解析 CommonJs require 调用。
 * * @property {Boolean} [resolveAsyncRequires=true] 是否解析 AMD 异步 require 调用。
 * * @property {Boolean} [resolveCommonJsExports=true] 是否解析 CommonJs module/exports 指令。
 * * @property {Boolean} [resolveUrls=true] 是否解析 ?__url 指令。
 * * @property {Boolean} [requestRemoteModules=false] 是否解析远程服务器上的模块。
 * * @property {Boolean} [requestTimeout=60000] 下载远程服务器模块的超时毫秒数。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
module.exports = exports = function (file, options, builder) {
    file.content = packModule(getModule(file, resolveModule, options, builder), options);
};

/**
 * Tpack 解析 HTML 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体可用的选项值见：https://github.com/sass/node-sass。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.html = function (file, options, builder) {
    file.content = packModule(getModule(file, resolveHtmlModule, options, builder), options);
};

/**
 * Tpack 解析 CSS 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体可用的选项值见：https://github.com/sass/node-sass。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.css = function (file, options, builder) {
    file.content = packModule(getModule(file, resolveCssModule, options, builder), options);
};

/**
 * Tpack 解析 JS 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体可用的选项值见：https://github.com/sass/node-sass。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.js = function (file, options, builder) {
    file.content = packModule(getModule(file, resolveJsModule, options, builder), options);
};

/**
 * Tpack 解析文本模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体可用的选项值见：https://github.com/sass/node-sass。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.text = function (file, options, builder) {
    file.content = packModule(getModule(file, resolveTextModule, options, builder), options);
};

/**
 * Tpack 解析资源模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体可用的选项值见：https://github.com/sass/node-sass。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.resource = function (file, options, builder) {
    file.content = packModule(getModule(file, resolveResourceModule, options, builder), options);
};

// #endregion

// #region HTML

/**
 * 分析一个 HTML 模块的依赖项。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function resolveHtmlModule(module, options, builder) {

    module.type = 'html';

    // 解析注释 <!-- #include -->。
    if (options.resolveComments !== false) {
        module.content = module.content.replace(/<!--\s*#include(.*?)\s*-->/g, function (all, args) {
            return parseInclude(removeQuotes(args), module, options, builder) || all;
        });
    }

    // 解析特定标签。
    if (options.resolveHtmlTags !== false) {

        // 解析内联的 <style>, <script>: 分别以 CSS, JS 处理
        module.content = module.content.replace(/(<s(tyle|cript)([^>]*?)>)([\s\S]*?)(<\/s\2[^>]*?>)/gi, function (_, prefix, styleOrScript, tags, content, postfix) {

            var isStyle = styleOrScript.length < 5;

            // content 的意义根据 type 决定。
            var type = getAttr(tags, "type");

            // <style>
            if (isStyle) {
                content = parseInlined(content, type && type !== "text/css" ? getExtByMimeType(options, type) : '.css', module, options, builder);
            } else {
                // <script src>
                var src = getAttr(tags, "src");
                if (src) {
                    var result = parseUrl(src, module, options, builder, true);
                    if (result.inline) {
                        content = result.content;
                        prefix = removeAttr(prefix, "src");
                    } else {
                        prefix = setAttr(prefix, "src", result);
                    }
                    // <script>
                } else {
                    content = parseInlined(content, type && type !== "text/javascript" ? getExtByMimeType(options, type) : '.js', module, options, builder);
                }
            }

            // 解析 <... __dest="">
            if (options.resolveDest !== false) {
                var dest = getAttr(prefix, "__dest");
                if (dest && !isUrl(dest)) {
                    var urlObj = splitUrl(dest);
                    urlObj.path = module.file.resolveName(urlObj.path, options.rootPath);

                    // 获取目标文件原始内容并追加当前文件的内容。
                    var destFile = builder.createFile(urlObj.path);
                    builder.processFile(destFile);
                    destFile.content += content;
                    destFile.save();

                    // 替换为新路径。
                    dest = module.createPathPlaceholder(destFile, urlObj.query, options);
                    prefix = removeAttr(prefix, "__dest");

                    return isStyle ?
                        setAttr(setAttr('<link' + prefix.substr('<style'.length), 'rel', 'stylesheet'), 'href', dest) :
                        setAttr(prefix, 'src', dest);

                }
            }

            return prefix + content + postfix;
        });

        // <link>: 内联或更新地址
        module.content = module.content.replace(/<(link|img|embed|audio|video|link|object|source)[^>]*?>/gi, function (tags, tagName) {

            // <link>
            if (/^link$/i.test(tagName)) {
                var src = getAttr(tags, "href");
                if (src) {
                    var rel = getAttr(tags, "rel");
                    if (!rel || rel === "stylesheet") {
                        var result = parseUrl(src, module, options, builder, true);
                        tags = result.inline ? removeAttr(removeAttr('<style' + tags.substr("<link".length).replace(/\s*\/>$/, ">"), "rel"), "href") + '\r\n' + result.content + '\r\n</style>' : setAttr(tags, "href", result);
                    } else if (rel === "html") {
                        var result = parseUrl(src, module, options, builder, true);
                        tags = result.inline ? result.content : setAttr(tags, "href", result);
                    } else {
                        tags = setAttr(tags, "href", parseUrl(src, module, options, builder));
                    }
                }
            } else {
                // <... src>
                var src = getAttr(tags, 'src');
                if (src) {
                    tags = setAttr(tags, "src", parseUrl(src, module, options, builder));
                }
            }

            return tags;
        });

    }

    // 解析地址。
    resolveUrls(module, options, builder);

}

/**
 * 提取字符串中的引号部分。
 * @param {} value 
 * @returns {} 
 */
function removeQuotes(value) {
    var matched = /'([^']*)'|"([^"]*)"/.exec(value);
    return matched ? matched[1] || matched[2] : value.trim();
}

function getAttr(html, attrName) {
    var re = new RegExp('\\s' + attrName + '\\s*(=\\s*([\'"])([\\s\\S]*?)\\2)?', 'i');
    var match = re.exec(html);
    return match ? match[3] || '' : null;
}

function setAttr(html, attrName, attrValue) {
    var re = new RegExp('(\\s' + attrName + '\\s*)((=\\s*([\'"]))([\\s\\S]*?)\\4)?', 'i');
    var needAppend = true;
    attrValue = encodeHTMLAttribute(attrValue);
    html = html.replace(re, function (all, prefix, attrAll, postfix, quote, value) {
        needAppend = false;
        if (attrAll) {
            return prefix + postfix + attrValue + quote;
        }
        return prefix + '="' + attrValue + '"';
    });
    if (needAppend) {
        html = html.replace(/^<[^ ]+\b/, '$& ' + attrName + '="' + attrValue + '"');
    }
    return html;
}

function removeAttr(html, attrName) {
    return html.replace(new RegExp('\\s' + attrName + '\\s*(=\\s*([\'"])([\\s\\S]*?)\\2)?', 'i'), "");
}

function encodeHTMLAttribute(str) {
    console.assert(typeof str === "string", "encodeHTMLAttribute(str: 必须是字符串)");
    return str.replace(/[\'\"]/g, function (v) {
        return ({
            '\'': '&#39;',
            '\"': '&quot;'
        })[v];
    });
}

// #endregion

// #region JS

/**
 * 解析一个 JS 模块的依赖项。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function resolveJsModule(module, options, builder) {
    
    if(module.path.indexOf("Danger.js") >=0) {
        debugger
    }

    module.type = 'js';

    // 解析注释 #include(...)
    if (options.resolveComments !== false) {
        module.content = module.content.replace(/\/\/\s*#(\w+)\s+(.*)|\/\*\s*#(\w+)\s+(.*?)\s*\*\//g, function (all, macroName, macroArgs, macroName2, macroArgs2) {
            macroName = macroName || macroName2;
            macroArgs = macroArgs || macroArgs2;
            if (macroName === "include") {
                return parseInclude(macroArgs, module, options, builder) || all;
            }
            if (macroName === "exclude") {
                return parseExclude(macroArgs, module, options, builder);
            }
            if (macroName === "moduletype") {
                return parseModuleType(removeQuotes(macroArgs), module, options, builder);
            }
            return all;
        });
    }

    // 为避免注释干扰，首先将注释删除。
    var removedSegments = [];
    module.content = module.content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*?(\r|\n|$)/g, function (all) {
        if (all[0] === '/' && /\b(require)\b/.test(all)) {
            var id = removedSegments.length;
            removedSegments[id] = all;
            return '/*_comment:' + id + '*/';
        }
        return all;
    });

    // 解析 CommonJs：require("xxx")
    if (options.resolveCommonJsRequires !== false) {
        module.content = module.content.replace(/\brequire\s*\(\s*('([^']*?)'|"([^"]*?)")\s*\)/g, function (all, param, url, url2) {
            return 'require(' + JSON.stringify(parseCommonJsRequire(url || url2, module, options, builder)) + ')';
        });
    }

    // 解析 AsyncRequire：require(["xxx"], function(){ ... })
    if (options.resolveAsyncRequires !== false) {
        module.content = module.content.replace(/\brequire\s*\(\s*\[\s*(('[^']*?'|"[^"]*?")(\s*,\s*('[^']*?'|"[^"]*?")?)*)\s*\]\s*\,\s*function\b/g, function (all, content) {
            return all.replace(/'([^']*?)'|"([^"]*?)"/g, function (all, url, url2) {
                return JSON.stringify(parseAsyncRequire(url || url2, module, options, builder));
            });
        });
    }

    // 发现 exports 或 module 时自动指定为 commonJs 模块。
    if (options.resolveCommonJsExports !== false && !module.flags.commonJs && /\b(exports\.|module\.|process\.|global\.|Buffer|setImmediate\(|clearImmediate\()/.test(module.content)) {
        module.flags.commonJs = true;
        module.flags.global = /\bglobal\./.test(module.content);
        module.flags.process = /\bprocess\./.test(module.content) && module.path !== getNodeNativeModule('process');
        module.flags.Buffer = /\bBuffer/.test(module.content) && module.path !== getNodeNativeModule('Buffer');
        module.flags.setImmediate = /\bsetImmediate\(/.test(module.content) && module.path !== getNodeNativeModule('timers');
        module.flags.clearImmediate = /\bclearImmediate\(/.test(module.content) && module.path !== getNodeNativeModule('timers');

    }

    if (module.flags.commonJs) {
        if (module.flags.process) {
            module.flags.process = parseCommonJsRequire('process', module, options, builder);
        }
        if (module.flags.Buffer) {
            module.flags.Buffer = parseCommonJsRequire('Buffer', module, options, builder);
        }
        if (module.flags.setImmediate) {
            module.flags.setImmediate = parseCommonJsRequire('timers', module, options, builder);
        }
        if (module.flags.clearImmediate) {
            module.flags.clearImmediate = parseCommonJsRequire('timers', module, options, builder);
        }
    }
    
    // 恢复注释。
    if (removedSegments.length) {
        module.content = module.content.replace(/\/\*_comment:(\d+)\*\//g, function (_, id) {
            return removedSegments[id];
        });
    }

    // 内部处理。
    resolveUrls(module, options, builder);

}

/**
 * 解析一个模块内的 CommonJs require 指令。
 * @param {String} url 被包含的地址。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回原 require() 占位符。
 */
function parseCommonJsRequire(url, module, options, builder) {

    module.flags.commonJs = true;

    // 解析位置。
    var urlObj = requireResolveUrl(url, module, options, builder, true);
    if (urlObj.isUrl) {
        return url;
    }
    if (urlObj.notFound) {
        builder.warn('{0}: Cannot find module "{1}"', module.path, url);
        return url;
    }

    // 解析目标模块。
    var relatedModule = getModuleFromPath(urlObj.path, options, builder);
    if (!module.require(relatedModule)) {
        builder.warn('{0}: Circular References with {1}', module.path, url);
    }
    return relatedModule.name;
}

/**
 * 解析一个模块内的异步导入指令。
 * @param {String} url 被包含的地址。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回原 require() 占位符。
 */
function parseAsyncRequire(url, module, options, builder) {
    module.flags.hasAsyncRequire = true;

    // 解析位置。
    var urlObj = requireResolveUrl(url, module, options, builder, true);
    if (urlObj.isUrl) {
        return url;
    }
    if (urlObj.notFound) {
        builder.warn('{0}: Cannot find module "{1}"', module.path, url);
        return url;
    }

    return module.createPathPlaceholder(getFileFromPath(urlObj.path, options, builder), urlObj.query);
}

/**
 * 将 JS 模块打包成一个文件。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @returns {String} 返回打包结果。
 */
function packJsModule(module, options) {

    // 如果一个文件打包为全局类型且没有依赖项。则保持全局状态。否则都需要添加 统一运行的头。
    if ((module.buildType === "module" || module.buildType === "global") && !module.flags.commonJs && !module.flags.hasAsyncRequire) {
        return module.content;
    }

    if (module.buildType === "nonmodule") {
        return module.content;
    }

    var result = '';

    // 只要依赖的任一模块存在异步加载，则必须添加异步加载支持。
    var finalFlags = {};

    // 遍历模块及其所有依赖项。
    module.walk(function (currentModule) {
        for (var flag in currentModule.flags) {
            finalFlags[flag] = finalFlags[flag] || currentModule.flags[flag];
        }

        switch (currentModule.type) {
            case 'js':
                result += '\r\n__tpack__.define(' + JSON.stringify(currentModule.name) + ', function(exports, module, require){\r\n' + currentModule.content + '\r\n});\r\n';
                break;
            case 'css':
                result += '\r\n__tpack__.insertStyle(' + JSON.stringify(currentModule.content) + ');\r\n';
                break;
            case "html":
                // HTML 直接以字符串插入。
                result += '\r\n' + JSON.stringify(currentModule.content) + '\r\n';
                break;
        }
    });

    var header = 'var __tpack__ = __tpack__ || {\r\n\tmodules: { __proto__: null },\r\n';

    header += '\tdefine: function (moduleName, factory) {\r\n' +
        '\t\treturn __tpack__.modules[moduleName] = {\r\n' +
        '\t\t\tfactory: factory,\r\n' +
        '\t\t\texports: {}\r\n' +
        '\t\t};\r\n' +
        '\t}';

    if (finalFlags.hasStyleLoader) {

    }

    if (finalFlags.hasAsyncRequire) {

    }

    header += ',\r\n\trequire: function (moduleName, callback) {\r\n' +
        '\t\tvar module = __tpack__.modules[moduleName];\r\n' +
        '\t\tif (!module) {\r\n' +
        '\t\t\tthrow new Error("Can not find module: " + moduleName);\r\n' +
        '\t\t}\r\n' +
        '\t\tif (!module.loaded) {\r\n' +
        '\t\t\tmodule.loaded = true;\r\n' +
        '\t\t\tmodule.factory.call(module.exports, module.exports, module, __tpack__.require, moduleName);\r\n' +
        '\t\t}\r\n' +
        '\t\treturn module.exports;\r\n' +
        '\t}';

    header += '\r\n};\r\n';

    result = header + result;

    if (finalFlags.global) {
        result += '\r\nthis.global = (function(){return this;)();\r\n';
    }
    if (finalFlags.process) {
        result += '\r\nthis.process = __tpack__.require(' + JSON.stringify(finalFlags.process) + ');\r\n';
    }
    if (finalFlags.Buffer) {
        result += '\r\nthis.Buffer = __tpack__.require(' + JSON.stringify(finalFlags.Buffer) + ');\r\n';
    }
    if (finalFlags.setImmediate) {
        result += '\r\nthis.setImmediate = __tpack__.require(' + JSON.stringify(finalFlags.setImmediate) + ').setImmediate;\r\n';
    }
    if (finalFlags.clearImmediate) {
        result += '\r\nthis.clearImmediate = __tpack__.require(' + JSON.stringify(finalFlags.clearImmediate) + ').clearImmediate;\r\n';
    }

    // 添加统一尾。
    switch (module.buildType) {
        case "module":
        case "global":
            return result + '\r\n__tpack__.require(' + JSON.stringify(module.name) + ');';
        case "umd":
            return result + getSourceCode(function () {
                if (typeof define !== "undefined" && define.amd) {
                    define(function () { return __tpack__.require(0); });
                } else if (typeof module !== "undefined") {
                    module.exports = __tpack__.require(0);
                } else {
                    (function (exports, value) {
                        for (var key in value) exports[key] = value[key];
                    })(typeof exports === 'object' ? exports : this, __tpack__.require(0));
                }
            }).replace(/0/g, JSON.stringify(module.name));
        case "amd":
            return getSourceCode(function () {
                BODY;
                define([], function () {
                    return __tpack__.require(0);
                });
            }).replace("BODY;", result).replace('0', JSON.stringify(module.name));
        case "cmd":
            return getSourceCode(function () {
                BODY;
                define(function (exports, module, require) {
                    module.exports = __tpack__.require(0);
                });
            }).replace("BODY;", result).replace('0', JSON.stringify(module.name));
        default:
            return getSourceCode(function () {
                BODY;
                module.exports = __tpack__.require(0);
            }).replace("BODY;", result).replace('0', JSON.stringify(module.name));
    }


}

/**
 * 获取指定路径表示的 node 原生模块。
 * @param {String} url 原生模块名。 
 * @returns {} 
 */
function getNodeNativeModule(url) {
    // Thanks to Webpack.
    var nodeLibsBrowser = require("node-libs-browser");

    if (nodeLibsBrowser[url]) {
        return nodeLibsBrowser[url];
    }

    return null;
}

function getSourceCode(fn) {
    return fn.toString().replace(/^function.*?\{/, "").replace(/\}$/, "");
}

// #endregion

// #region CSS

/**
 * 分析一个 CSS 模块的依赖项。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function resolveCssModule(module, options, builder) {

    module.type = 'css';
    module.flags.hasStyleLoader = true;

    // @import url(): 内联或重定向。
    if (options.resolveCssUrl !== false) {
        module.content = module.content.replace(/((@import\s+)?url\(\s*(['"]?))(.*?)(\3\s*\))/, function (all, prefix, atImport, q, url, postfix) {

            // 内联 CSS。
            if (atImport) {
                var result = parseUrl(url, module, options, builder, true);
                return result.inline ? result.content : prefix + result + postfix;
            }

            // 否则是图片等外部资源。
            return prefix + parseUrl(url, module, options, builder) + postfix;

        });
    }

    resolveUrls(module, options, builder);

}

// #endregion

// #region 其它资源

/**
 * 解析一个模块的依赖项。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function resolveModule(module, options, builder) {
    var ext = module.extension;
    if (/^\.(html?|inc|jsp|asp|php|aspx|ashx)$/i.test(ext)) {
        resolveHtmlModule(module, options, builder);
    } else if (/^\.js$/i.test(ext)) {
        resolveJsModule(module, options, builder);
    } else if (/^\.css$/i.test(ext)) {
        resolveCssModule(module, options, builder);
    } else if (/^\.(txt|text|md)$/i.test(ext)) {
        resolveTextModule(module, options, builder);
    } else {
        resolveResourceModule(module, options, builder);
    }
}

/**
 * 解析一个普通模块。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {} 
 */
function resolveTextModule(module, options, builder) {
    module.type = 'text';
    resolveUrls(module, options, builder);
}

/**
 * 解析一个普通模块。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {} 
 */
function resolveResourceModule(module, options, builder) {
    module.type = 'resource';
}

/**
 * 解析一个普通模块。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function resolveUrls(module, options, builder) {
    if (options.resolveUrls !== false) {
        module.content = module.content.replace(/([^\s'",=\(\[\{\)\]\}]*)[?&]__url\b/g, function (_, url) {
            return parseUrl(url.replace(/[?&]__url/, ''), module, options, builder);
        });
    }
}

/**
 * 打包一个模块并返回最终源码。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @returns {String} 返回打包结果。
 */
function packModule(module, options) {
    switch (module.type) {
        case "js":
            return packJsModule(module, options);
        default:
            return module.content;
    }
}

// #endregion

// #region BuildModule

/**
 * 表示一个生成模块。一个生成模块拥有依赖项。
 * @param {String} content 当前模块的内容。
 * @param {BuildFile} [file] 如果是本地文件，当前模块的源文件。
 */
function BuildModule(file) {
    this.file = file;
    this.included = [];
    this.required = [];
    this.excluded = [];
    this.flags = { __proto__: null };
}

BuildModule.prototype = {
    constructor: BuildModule,

    // #region 路径

    /**
     * 获取当前模块对应的文件。
     */
    file: null,

    /**
     * 获取当前模块的路径。
     */
    get path() {
        return this.file.srcPath;
    },

    /**
     * 获取当前模块的友好名称。
     * @returns {String} 如果是本地模块则返回文件名称，否则返回完整网址。
     */
    get name() {
        return this.file.srcName;
    },

    /**
     * 获取当前模块的扩展名。
     */
    get extension() {
        return this.file.extension;
    },

    /**
     * 创建指定从当前模块访问文件的占位符。
     */
    createPathPlaceholder: function (file, query, options) {
        if (options.urlPostfix) {
            query += (query ? '&' : '?') + (typeof options.urlPostfix === "function" ?
                options.urlPostfix(file.srcName + query, file) : String(options.urlPostfix).replace(/<(.*)>/, function (all, tagName) {
                    switch (tagName) {
                        case "date":
                            return new Date().format("yyyyMMdd");
                        case "hour":
                            return new Date().format("yyyyMMddHH");
                        case "minute":
                            return new Date().format("yyyyMMddHHmm");
                        case "time":
                            return new Date().format("yyyyMMddHHmmss");
                        case "md5":
                            return getMd5(file.buffer);
                        case "md5h":
                            return getMd5(file.buffer).substr(0, 16);
                        case "md5s":
                            return getMd5(file.buffer).substr(0, 6);
                    }
                    return all;
                })
            )
        }
        return this.file.createPathPlaceholder(file) + query;
    },

    /**
     * 解析当前模块内指定地址实际代表的路径。
     * @param {String} url 
     * @returns {String} 
     */
    resolvePath: function (url) {
        return this.file.resolvePath(url);
    },

    // #endregion

    // #region 内容

    /**
     * 获取当前模块的类型。可能的值有空、"html"、"js"、"css"、"text"、"resource"。
     */
    type: "",

    /**
     * 获取当前模块预设的打包类型。当 type=="js" 时可能的值有："global"、"amd"、"umd"、"cmd"、"commonjs"。
     */
    buildType: "module",

    /**
     * 获取当前模块的内容。
     */
    get content() {
        if (this._content !== undefined) {
            return this._content;
        }
        if (this.file) {
            return this._content = this.file.content;
        }
        try {
            return this._content = this.download().toString();
        } catch (e) {
            return this._content = null;
        }
    },

    /**
     * 设置当前模块的内容。
     */
    set content(value) {
        this._content = value;
    },

    /**
     * 以二进制格式获取当前模块的内容。
     */
    get buffer() {
        return this._content !== undefined ? new Buffer(this.content) : this.file.buffer;
    },

    // #endregion

    // #region 引用

    /**
     * 添加当前模块的一个包含路径。
     * @param {} path 
     * @returns {} 
     */
    include: function (module) {
        if (module.hasInclude(this)) {
            return null;
        }
        var id = this.included.length;
        this.included[id] = module;
        return "/*_include:" + id + "*/";
    },

    /**
     * 判断当前模块及包含项是否已包含目标。
     * @param {} module
     * @returns {} 
     */
    hasInclude: function (module) {

        // 被当前模块包含。
        if (this === module) {
            return true;
        }

        for (var i = 0; i < this.included.length; i++) {
            if (this.included[i].hasInclude(module)) {
                return true;
            }
        }

        return false;
    },

    /**
     * 合并当前模块的 #include 占位符。
     * @returns {BuildFile} 返回自身。 
     */
    mergeIncludes: function () {
        if (!this.included.length) return this;
        var module = this;
        this.content = this.content.replace(/\/\*_include:(\d+)\*\//g, function (all, id) {
            var include = module.included[id];
            module.hasAsyncRequire = module.hasAsyncRequire || include.hasAsyncRequire;
            for (var i = 0; i < include.required.length; i++) {
                module.require(include.required[i]);
            }
            for (var i = 0; i < include.excluded.length; i++) {
                module.exclude(include.excluded[i]);
            }
            return include.content;
        });
        return this;
    },

    /**
     * 添加当前模块的一个排除路径。
     * @param {} url 
     * @returns {} 
     */
    exclude: function (module) {
        if (this.excluded.indexOf(module) < 0) {
            this.excluded.push(module);
        }
    },

    /**
     * 标记当前模块的依赖模块。
     * @param {} module 
     * @returns {} 
     */
    require: function (module) {
        if (module.hasRequire(this)) {
            return false;
        }
        if (this.required.indexOf(module) < 0) {
            this.required.push(module);
        }
        return true;
    },

    /**
     * 判断当前模块及包含项是否已包含目标。
     * @param {} module
     * @returns {} 
     */
    hasRequire: function (module) {

        // 被当前模块包含。
        if (this === module) {
            return true;
        }

        for (var i = 0; i < this.required.length; i++) {
            if (this.required[i].hasRequire(module)) {
                return true;
            }
        }

        return false;
    },

    /**
     * 遍历当前模块的所有依赖项。
     * @param {Function} callback 
     */
    walk: function (callback) {

        var bind = this;

        // 计算模块的排除项。
        var excludedList = [];

        // 添加一个排除项，排除项依赖的项同时排除。
        function addExclude(module) {

            // 添加到排除列表，不重复排除。
            if (excludedList.indexOf(module) >= 0) {
                return;
            }
            excludedList.push(module);

            // 排除项的依赖项同样排除。
            for (var i = 0; i < module.required.length; i++) {
                addExclude(module.required[i]);
            }
        }

        // 应用模块指定的排除列表，依赖模块的排除列表同时应用。
        function applyExclude(module) {
            for (var i = 0; i < module.excluded.length; i++) {
                addExclude(module.excluded[i]);
            }
            for (var i = 0; i < module.required.length; i++) {
                applyExclude(module.required[i]);
            }
        }

        function applyInclude(module) {

            // 不重复包含。
            if (excludedList.indexOf(module) >= 0) {
                return;
            }
            excludedList.push(module);

            // 处理依赖项。
            for (var i = 0; i < module.required.length; i++) {
                applyInclude(module.required[i]);
            }

            callback.call(bind, module);

        }

        // 主模块的依赖项直接排除。
        applyExclude(this);

        // 处理依赖。
        applyInclude(this);

    }

    // #endregion

};

/**
 * 获取和一个生成文件关联的模块。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Function} resolver 解析当前模块的解析器。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {BuildModule} 返回对应的模块。
 */
function getModule(file, resolver, options, builder) {
    var module = file.module;
    if (!module) {
        file.module = module = new BuildModule(file);
        resolver(module, options, builder);
        module.mergeIncludes();
    }
    return module;
}

function getMd5(content) {
    if (!content) return "";
    var Crypto = require('crypto');
    var md5sum = Crypto.createHash('md5');
    md5sum.update(content);
    return md5sum.digest('hex');
}

// #endregion

// #region 公用

/**
 * 解析一个模块内的包含指令。返回被包含的模块内容。
 * @param {String} url 被包含的地址。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回被包含文件的内容。
 */
function parseInclude(url, module, options, builder) {

    // 解析位置。
    var urlObj = requireResolveUrl(url, module, options, builder);
    if (urlObj.isUrl) {
        builder.warn("{0}: Cannot Include Remote Path: {1}", module.path, url);
        return;
    }
    if (urlObj.notFound) {
        builder.warn("{0}: Include Not Found: {1}", module.path, url);
        return;
    }

    // 尝试包含，判断是否存在互嵌套。
    var result = module.include(getModuleFromPath(urlObj.path, options, builder));
    if (!result) {
        builder.warn('{0}: Circular Include with {1}', module.path, url);
        return;
    }

    return result;
}

/**
 * 解析一个模块内的排除指令。
 * @param {String} url 被排除的地址。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回原 #exclude 占位符。
 */
function parseExclude(url, module, options, builder) {

    // 解析位置。
    var urlObj = requireResolveUrl(url, module, options, builder, true);
    if (urlObj.isUrl || urlObj.notFound) {
        return "";
    }

    module.exclude(getModuleFromPath(urlObj.path, options, builder));
    return "";
}

/**
 * 解析一个模块内的模块类型指令。
 * @param {String} type 页面设置的类型。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回原 #moduletype 占位符。
 */
function parseModuleType(type, module, options, builder) {
    type = type.toLowerCase();
    if (type === "global" || type === "amd" || type === "cmd" || type === "umd" || type === "commonjs") {
        module.buildType = type;
    } else {
        builder.warn("{0}: #moduletype Can only be one of `global`, `cmd`, `amd`, `umd` and `commonjs`. Currently is set to {1}", module.path, type);
    }
    return "";
}

/**
 * 解析文件内联的其它文件。
 * @param {String} content 内联的内容。
 * @param {String} ext 内联的扩展名。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回处理后的新内联结果。
 */
function parseInlined(content, ext, module, options, builder) {
    // 创建虚拟文件并进行处理。
    var file = builder.createFile(module.name + "#inline" + (module._inlineCounter = (module._inlineCounter + 1) || 0) + ext, content);
    // 按正常逻辑处理文件，然后强制执行当前模块。
    builder.processFile(file) && exports(file, options, builder);
    return file.content;
}

/**
 * 解析文件内的地址。可能为地址内联或追加时间戳。
 * @param {String} url 要处理的相对路径。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @param {Boolean} [returnContentIfInline=false] 如果需要转为内联时，@true 表示返回内容，@false 表示返回 base64 编码。
 * @return {String|Object} 返回文件新地址，或者返回文件信息。
 */
function parseUrl(url, module, options, builder, returnContentIfInline) {

    // 解析位置。
    var urlObj = requireResolveUrl(url, module, options, builder);
    if (urlObj.isUrl) {
        return url;
    }
    if (urlObj.notFound) {
        builder.warn("{0}: Reference Not Found: {1}", module.path, url);
        return url;
    }

    var relatedModule = getModuleFromPath(urlObj.path, options, builder);

    // 处理内联。
    var inlineLimit = options.inline === false ? 0 :
        options.inline === true ? -1 :
        typeof options.inline === "function" ? options.inline(relatedModule.name, module.file) ? -1 : 0 :
        typeof options.inline === "number" ? options.inline :
        /\b__inline\b/.test(url) ? +(/\b__inline\s*=\s*(\d+)/.exec(url) || [0, -1])[1] : 0;

    var cachedBuffer;
    if (inlineLimit !== 0 && (inlineLimit < 0 || (cachedBuffer = relatedModule.buffer).length < inlineLimit)) {
        return returnContentIfInline ? {
            inline: true,
            content: module.include(relatedModule)
        } : getBase64Url(cachedBuffer || relatedModule.buffer, relatedModule.extension, options);
    }

    // 追加时间戳。
    return module.createPathPlaceholder(relatedModule.file, urlObj.query, options);
}

// #endregion

// #region 底层

/**
 * 解析一个文件内指定相对路径实际所表示的路径。
 * @param {String} url 要处理的相对路径。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @param {Boolean} requireMode 如果设置为 @true，则“a/b.js”被作为全局路径处理。
 * @returns {Object} 返回一个对象。包含以下信息：
 * * @property {Boolean} isUrl 指示当前路径是否为网址。
 * * @property {String} url 如果是网址，则返回完整的网址部分。
 * * @property {String} path 如果是文件路径，则返回完整的绝对路径部分。
 * * @property {String} query 查询参数部分。
 * * @property {Boolean} notFound 指示当前路径是否指向不存在的文件。
 */
function requireResolveUrl(url, module, options, builder, requireMode) {

    // 自主导入地址。
    if (options.importer) {
        url = options.importer(url, module.file, options, builder, requireMode) || url;
    }

    // 已经是网络地址。
    if (isUrl(url)) {
        return {
            isUrl: true,
            url: url
        };
    }

    // 搜索路径。
    var paths = [];

    // 拆开 ? 前后
    var urlObj = splitUrl(url);

    // 已经是绝对地址。
    if (/^\./.test(urlObj.path)) {

        // . 开头表示相对路径。
        paths.push(module.resolvePath(urlObj.path));

    } else if (/^\//.test(urlObj.path)) {

        var p;

        // 处理虚拟目录。
        for (var virtualUrl in options.virtualPaths) {
            if (urlObj.path.toLowerCase().startsWith(virtualUrl.toLowerCase())) {
                p = Path.join(builder.srcPath, options.virtualPaths[virtualUrl], urlObj.path.substr(virtualUrl.length));
                break;
            }
        }

        if (!p) {
            p = builder.getPath(urlObj.path.substr(1));
        }

        paths.push(p);
    } else if (Path.isAbsolute(urlObj.path)) {

        // 其它绝对路径 E:/a。
        paths.push(urlObj.path);

    } else {

        // 直接单词开头可以表示相对路径，也可以表示全局搜索路径。
        if (!requireMode) {
            paths.push(module.resolvePath(urlObj.path));
        } else {
            var p = getNodeNativeModule(urlObj.path);
            if (p) {
                urlObj.path = p;
                return urlObj;
            }
        }

        // 全局搜索路径。
        if (options.paths) {
            for (var i = 0; i < options.paths.length; i++) {
                paths.push(Path.resolve(options.paths[i], urlObj.path));
            }
        }

        // node_modules 全局搜索路径。
        if (requireMode && options.searchNodeModules !== false) {
            var dir = module.path, p = null;
            while (p !== dir) {
                p = dir;
                dir = Path.dirname(dir);
                paths.push(Path.join(dir, 'node_modules', urlObj.path));
            }
        }

    }

    // 解析各种扩展名组合结果。
    var extensions = options.extensions;
    for (var i = 0; i < paths.length; i++) {

        // 判断未补充扩展名是否存在。
        if (IO.existsFile(paths[i])) {
            urlObj.path = paths[i];
            return urlObj;
        }

        // 尝试自动填充扩展名。
        if (extensions) {
            for (var j = 0; j < extensions.length; j++) {
                if (IO.existsFile(paths[i] + extensions[j])) {
                    urlObj.path = paths[i] + extensions[j];
                    return urlObj;
                }
            }
        }

    }

    urlObj.notFound = true;
    return urlObj;
}

function isUrl(url) {
    return /^(\w+:)?\/\//.test(url);
}

function splitUrl(url) {
    var urlObj = /^(.*)([\?&].*)$/.exec(url);
    return urlObj ? {
        path: urlObj[1],
        query: urlObj[2]
    } : {
        path: url,
        query: ""
    };
}

function getFileFromPath(path, options, builder) {
    return builder.getFile(builder.getName(path));
}

function getModuleFromPath(path, options, builder) {
    return getModule(getFileFromPath(path, options, builder), resolveModule, options, builder);
}

function getBase64Url(buffer, ext, options) {
    return 'data:' + getMimeTypeByExt(options.mimeTypes, ext) + ';base64,' + buffer.toString('base64');
}

function getExtByMimeType(options, mimeType) {

    for (var ext in options.mimeTypes) {
        if (options.mimeTypes[ext] === mimeType) {
            return ext;
        }
    }

    var serverConfigs = require('aspserver/configs');
    if (serverConfigs.mimeTypes) {
        for (var ext in serverConfigs.mimeTypes) {
            if (serverConfigs.mimeTypes[ext] === mimeType) {
                return ext;
            }
        }
    }

    return '.' + mimeType.replace(/^.*\//, '');
}

function getMimeTypeByExt(mimeTypes, ext) {

    // 从用户定义处获取 mimeType。
    if (mimeTypes && ext in mimeTypes) {
        return mimeTypes[ext];
    }

    var serverConfigs = require('aspserver/configs');
    if (serverConfigs.mimeTypes && ext in serverConfigs.mimeTypes) {
        return serverConfigs.mimeTypes[ext];
    }

    return 'application/x-' + ext.slice(1);
}

// #endregion