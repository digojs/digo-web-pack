
var Path = require('path');
var Lang = require('tealweb/lang');
var IO = require('tealweb/io');

// #region 公用

/**
 * TPack 解析文件依赖的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体的配置值为：
 * * @property {Boolean} [resolveComments=true] 是否解析注释内的 #include 等指令。
 * * @property {Boolean} [resolveCommonJsRequires=true] 是否解析 CommonJs require 调用。
 * * @property {Boolean} [resolveAsyncRequires=true] 是否解析 AMD 异步 require 调用。
 * * @property {Boolean} [resolveCommonJsExports=true] 是否解析 CommonJs file/exports 指令。
 * * @property {Boolean} [resolveUrls=true] 是否解析 ?__url 指令。
 * * @property {Function} [importer] 自定义导入路径的函数。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
module.exports = exports = function (file, options, builder) {
    var ext = file.extension;
    if (/^\.(html?|inc|jsp|asp|php|aspx|ashx|tpl)$/i.test(ext)) {
        exports.html(file, options, builder);
    } else if (/^\.js$/i.test(ext)) {
        exports.js(file, options, builder);
    } else if (/^\.css$/i.test(ext)) {
        exports.css(file, options, builder);
    } else if (/^\.(txt|text|md|log|xml)$/i.test(ext)) {
        exports.text(file, options, builder);
    } else if (/^\.json$/i.test(ext)) {
        exports.json(file, options, builder);
    } else {
        exports.resource(file, options, builder);
    }
};

/**
 * 根据绝对路径获取已解析过的文件。
 * @param {String} path 文件的物理绝对路径。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {BuildFile} 返回已解析过的文件对象。
 */
exports.getFile = function (path, options, builder) {
    var file = builder.getFile(builder.getName(path));
    exports(file, options, builder);
    return file;
};

/**
 * 解析文件内的 __url。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
exports.url = function (file, options, builder) {
    if (options.resolveUrl !== false) {
        file.content = file.content.replace(/([^\s'",=\(\[\{\)\]\}]*)[?&]__url\b/g, function (_, url) {
            return parseUrl(url.replace(/[?&]__url/, ''), file, options, builder);
        });
    }
};

/**
 * 解析一个文件内指定相对路径实际所表示的路径。
 * @param {String} url 要处理的相对地址。
 * @param {BuildFile} file 当前正在处理的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @param {Boolean} requireMode 如果设置为 @true，则“a/b.js”被作为全局路径处理。
 * @param {Boolean} reportErrorIfNotFound 如果不存在是否主动报错。
 * @returns {Object} 返回一个对象。包含以下信息：
 * * @property {Boolean} isUrl 指示当前路径是否为网址。
 * * @property {String} url 如果是网址，则返回完整的网址部分。
 * * @property {String} path 如果是文件路径，则返回完整的绝对路径部分。
 * * @property {String} query 查询参数部分。
 * * @property {Boolean} notFound 指示当前路径是否指向不存在的文件。
 */
exports.resolveUrl = function (url, file, options, builder, requireMode, reportErrorIfNotFound) {

    // 自主导入地址。
    if (options.importer) {
        url = options.importer(url, file, options, builder, requireMode) || url;
    }

    // 不处理网络地址。
    if (isUrl(url)) {
        return {
            url: url
        };
    }

    // 拆开 ? 前后
    var urlObj = splitUrl(url);

    // 解析各种扩展名组合结果。
    var extensions = options.extensions || [".node", ".json", ".js"];

    // 相对路径或绝对路径可直接解析。
    if (/^[\.\/]/.test(urlObj.path)) {
        urlObj.path = findModulePath(file.resolvePath(urlObj.path), extensions);
    } else if (Path.isAbsolute(urlObj.path)) {
        urlObj.path = findModulePath(urlObj.path, extensions);
    } else {

        var path = null;

        // 直接单词开头可以表示相对路径，也可以表示全局搜索路径。
        if (!requireMode) {
            path = findModulePath(file.resolvePath(urlObj.path), extensions);
        } else if (options.searchNodeModules !== false || options.nodejs) {
            var dir = file.srcPath;
            while (true) {
                var prev = dir;
                dir = Path.dirname(dir);
                if (prev === dir) {
                    break;
                }

                if ((path = findModulePath(Path.join(dir, 'node_modules', urlObj.path), extensions))) {
                    break;
                }
            }
        }

        // 全局搜索路径。
        if (!path && options.paths) {
            for (var i = 0; i < options.paths.length; i++) {
                if ((path = findModulePath(Path.resolve(options.paths[i], urlObj.path), extensions))) {
                    break;
                }
            }
        }

        urlObj.path = path;

    }

    if (reportErrorIfNotFound && !urlObj.path) {
        builder.warn(requireMode ? "{0}: Cannot find module '{1}'" : "{0}: Cannot find reference '{1}'", file.srcName, url);
    }

    return urlObj;
};

/**
 * 通过追加后缀的方式尝试搜索模块。
 */
function findModulePath(path, extensions) {

    // 文件已存在，不需要继续搜索。
    if (IO.existsFile(path)) {
        return path;
    }

    // 尝试追加扩展名。
    for (var i = 0; i < extensions.length; i++) {
        var p = path + extensions[i];
        if (IO.existsFile(p)) {
            return p;
        }
    }

    // 尝试读取 package.json
    var p = Path.join(path, "package.json");
    if (IO.existsFile(p)) {
        try {
            if (IO.existsFile(p = Path.join(path, require(p).main))) {
                return p;
            }
        } catch (e) { }
    }

    // 尝试追加首页。
    for (var i = 0; i < extensions.length; i++) {
        var p = Path.join(path, "index" + extensions[i]);
        if (IO.existsFile(p)) {
            return p;
        }
    }

    return null;
}

// #endregion

// #region HTML

/**
 * TPack 解析 HTML 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.html = function (file, options, builder) {

    if (!initModuleInfo(file, "html")) {
        return;
    }

    // 解析地址。
    exports.url(file, options, builder);

    // 解析 HTML
    file.content = file.content.replace(/(<script\b(?:'[^']*'|"[^"]*"|[^>])*>)([\s\S]*?)(<\/script(?:'[^']*'|"[^"]*"|[^>])*>|$)|(<style\b(?:'[^']*'|"[^"]*"|[^>])*>)([\s\S]*?)(<\/style(?:'[^']*'|"[^"]*"|[^>])*>|$)|<(img|embed|audio|video|link|object|source)\b(?:'[^']*'|"[^"]*"|[^>])*>|<!--([\s\S]*?)(?:-->|$)/ig, function (all, scriptStart, script, scriptEnd, styleStart, style, styleEnd, tag, comment) {

        // <script>
        if (scriptStart) {
            var src = getAttr(scriptStart, "src");
            if (src) {
                // 禁止解析地址。
                if (options.resolveUrl === false) {
                    return all;
                }
                var result = parseUrl(src, file, options, builder, true);
                if (result.inline) {
                    script = result.content;
                    scriptStart = removeAttr(scriptStart, "src");
                } else {
                    scriptStart = setAttr(scriptStart, "src", result);
                }
            } else {
                var type = getAttr(scriptStart, "type");
                script = parseInlined(script, type && type !== "text/javascript" ? builder.getExtByMimeType(type) : '.js', file, options, builder);
            }

            // 导出。
            var dest = parseDest(scriptStart, script, file, options, builder);
            if (dest) {
                return removeAttr(setAttr(scriptStart, "src", dest), "__dest") + scriptEnd;
            }

            return scriptStart + script + scriptEnd;
        }

        // <style>
        if (styleStart) {
            var type = getAttr(styleStart, "type");
            style = parseInlined(style, type && type !== "text/css" ? builder.getExtByMimeType(type) : '.css', file, options, builder);

            // 导出。
            var dest = parseDest(styleStart, style, file, options, builder);
            if (dest) {
                return removeAttr(setAttr(setAttr('<link' + styleStart.substr('<style'.length), 'rel', 'stylesheet'), 'href', dest), "__dest");
            }

            return styleStart + style + styleEnd;
        }

        // <link>: 内联或更新地址
        if (tag) {

            // 禁止解析地址。
            if (options.resolveUrl === false) {
                return all;
            }

            // <link>
            if (/^link$/i.test(tag)) {
                var src = getAttr(all, "href");
                if (!src) {
                    return all;
                }
                // <link rel="stylesheet">
                var rel = getAttr(all, "rel");
                if (!rel || rel === "stylesheet") {
                    var result = parseUrl(src, file, options, builder, true);
                    return result.inline ? removeAttr(removeAttr('<style' + all.substr("<link".length).replace(/\s*\/>$/, ">"), "rel"), "href") + '\r\n' + result.content + '\r\n</style>' : setAttr(all, "href", result);
                }
                return setAttr(all, "href", parseUrl(src, file, options, builder));
            }

            // <object$>
            if (/^object$/i.test(tag)) {
                var src = getAttr(all, "data");
                if (!src) {
                    return all;
                }
                return setAttr(all, "data", parseUrl(src, file, options, builder));
            }

            // <... src>
            var src = getAttr(all, 'src');
            if (src) {
                all = setAttr(all, "src", parseUrl(src, file, options, builder));
            }

            // <... data-src>
            if ((src = getAttr(all, 'data-src'))) {
                all = setAttr(all, "data-src", parseUrl(src, file, options, builder));
            }

            // <img srcset>
            if (/^img$/i.test(tag)) {
                // http://www.webkit.org/demos/srcset/
                // <img src="image-src.png" srcset="image-1x.png 1x, image-2x.png 2x, image-3x.png 3x, image-4x.png 4x">
                var srcset = getAttr(all, "srcset");
                if (srcset) {
                    srcset = srcset.replace(/(?:^|,)\s*(.*)\s+\dx\s*(?:,|$)/g, function (src) {
                        return parseUrl(src, file, options, builder);
                    });
                    all = setAttr("srcset", srcset);
                }
            }

            return all;
        }

        // <!-- -->
        if (comment) {
            return parseComments(all, file, options, builder);
        }

        return all;
    });

};

/**
 * 解析文件内联的其它文件。
 * @param {String} content 内联的内容。
 * @param {String} ext 内联的扩展名。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回处理后的新内联结果。
 */
function parseInlined(content, ext, file, options, builder) {
    var file = builder.createFile(file.name + "#inline" + (file._inlineCounter = (file._inlineCounter + 1) || 0) + ext, content);
    builder.processFile(file);
    return file.content;
}

/**
 * 处理 __dest 指令。
 * @param {String} startTag 标签内容。
 * @param {String} content 内联的内容。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回新的地址。
 */
function parseDest(startTag, content, file, options, builder) {
    if (options.resolveUrl === false) {
        return;
    }

    var dest = getAttr(startTag, "__dest");
    if (!dest || isUrl(dest)) {
        return;
    }

    var urlObj = splitUrl(dest);
    var relatedFile = builder.getFile(builder.getName(file.resolvePath(urlObj.path)));
    relatedFile.content = content;
    relatedFile.save();
    return buildUrl(relatedFile, urlObj.query, dest, file, options);
}

function getAttr(html, attrName) {
    var re = new RegExp('\\s' + attrName + '\\s*(=\\s*([\'"])([\\s\\S]*?)\\2)?', 'i');
    var match = re.exec(html);
    return match ? match[3] || '' : null;
}

function setAttr(html, attrName, attrValue) {
    var re = new RegExp('(\\s' + attrName + '\\s*)((=\\s*([\'"]))([\\s\\S]*?)\\4)?', 'i');
    var needAppend = true;
    attrValue = attrValue.replace(/[\'\"]/g, function (v) {
        return ({
            '\'': '&#39;',
            '\"': '&quot;'
        })[v];
    });
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

// #endregion

// #region JS

/**
 * TPack 解析 JS 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.js = function (file, options, builder) {

    if (!initModuleInfo(file, "js")) {
        return;
    }

    // 解析地址。
    exports.url(file, options, builder);

    // 解析 JS 代码。
    file.content = file.content.replace(/'(?:[^\\'\n\r\f]|\\[\s\S])*'|"(?:[^\\"\r\n\f]|\\[\s\S])*"|\/(\/[^\r\n\f]+|\*[\s\S]*?(?:\*\/|$))|\brequire\s*\(\s*('(?:[^\\'\n\r\f]|\\[\s\S])*'\s*\)|"(?:[^\\"\r\n\f]|\\[\s\S])*"\s*\)|\[(?:(?:'(?:[^\\'\n\r\f]|\\[\s\S])*'|"(?:[^\\"\r\n\f]|\\[\s\S])*"),?\s*)+\]\s*(?:,|function\b))|\b(exports\.|module\.|process\.|global\.|Buffer\b|setImmediate\b|clearImmediate\b)/g, function (all, comment, require, symbol) {

        // 处理注释。//  或 /*...*/
        if (comment) {
            return parseComments(all, file, options, builder);
        }

        // 不处理 require 和其它标识。
        if (options.commonJs === false) {
            return all;
        }

        // 处理 require。// '...' 或 "..." 或 [...]
        if (require) {
            // 异步 require, require([...], 
            if (require.startsWith("[")) {
                return all.replace(/'((?:[^\\'\n\r\f]|\\[\s\S])*)'|"((?:[^\\"\r\n\f]|\\[\s\S])*)"/g, function (all, url1, url2) {
                    return JSON.stringify(parseAsyncRequire(url1 || url2, file, options, builder));
                });
            }

            // 同步 require, require('...')
            return all.replace(/'((?:[^\\'\n\r\f]|\\[\s\S])*)'|"((?:[^\\"\r\n\f]|\\[\s\S])*)"/, function (all, url1, url2) {
                return JSON.stringify(parseCommonJsRequire(url1 || url2, file, options, builder));
            });
        }

        // 全局标识符。
        if (symbol) {
            parseSymbol(symbol, file, options, builder);
        }

        return all;
    });

    // 打包 JS 模块。

    // 如果当前文件无依赖项且不不需要 commonJs 支持则不需合并。
    if (file.moduleBuildType === "global" || (!file.moduleRequired.length && !file.moduleFlags.commonJs)) {
        return;
    }

    // 设置模块源码，以便其它模块依赖此模块时能获取到不含模块头的源码。
    file.moduleContent = file.content;

    // 自动排除文件。
    if (options.externs) {
        var externList;

        // 找到适合当前文件的排除列表。
        if (Array.isArray(options.externs)) {
            externList = options.externs;
        } else {
            for (var key in options.externs) {
                if (file.test(key)) {
                    externList = options.externs[key];
                    break;
                }
            }
        }

        if (externList) {
            for (var i = 0; i < externList.length; i++) {
                var relatedFile = exports.getFile(externList[i]);
                if (file !== relatedFile) {
                    externModule(file, relatedFile);
                }
            }
        }

    }

    var mergeResult = mergeModuleInfos(file);

    // 处理结果和导出。
    var result = "";
    var exportedResults = { __proto__: null };
    for (var key in options.exports) {
        if (key !== "js" && key !== "resource") {
            exportedResults[key] = '';
        }
    }

    // 添加公共头。
    if (mergeResult.externd.length === 0) {

        result += 'var __tpack__ = __tpack__ || {\r\n' +
            '\tmodules: { __proto__: null },\r\n' +
            '\tdefine: function (moduleName, factory) {\r\n' +
            '\t\treturn __tpack__.modules[moduleName] = {\r\n' +
            '\t\t\tfactory: factory,\r\n' +
            '\t\t\texports: {}\r\n' +
            '\t\t};\r\n' +
            '\t}';

        // 追加 insertStyle 函数。
        if (!('css' in exportedResults) && mergeResult.required.some(function (file) {
            return file.moduleType === "css";
        })) {
            // TODO
            result += ',\r\n\tinsertStyle: function (style) {\r\n' +
                'throw "Not Supported yet."' +
                '\t}';
        }

        // 带异步加载和不带的版本
        if (mergeResult.flags.hasAsyncRequire) {
            // TODO
            result += ',\r\n\trequire: function (moduleName, callback) {\r\n' +
                'if(callback) throw "Not Supported yet."' +
                '\t\tvar module = __tpack__.modules[moduleName];\r\n' +
                '\t\tif (!module) {\r\n' +
                '\t\t\tthrow new Error("Cannot find module \'" + moduleName + "\'");\r\n' +
                '\t\t}\r\n' +
                '\t\tif (!module.loaded) {\r\n' +
                '\t\t\tmodule.loaded = true;\r\n' +
                '\t\t\tmodule.factory.call(module.exports, module.exports, module, __tpack__.require, moduleName);\r\n' +
                '\t\t}\r\n' +
                '\t\treturn module.exports;\r\n' +
                '\t}';
        } else {
            result += ',\r\n\trequire: function (moduleName, callback) {\r\n' +
                '\t\tvar module = __tpack__.modules[moduleName];\r\n' +
                '\t\tif (!module) {\r\n' +
                '\t\t\tthrow new Error("Cannot find module \'" + moduleName + "\'");\r\n' +
                '\t\t}\r\n' +
                '\t\tif (!module.loaded) {\r\n' +
                '\t\t\tmodule.loaded = true;\r\n' +
                '\t\t\tmodule.factory.call(module.exports, module.exports, module, __tpack__.require, moduleName);\r\n' +
                '\t\t}\r\n' +
                '\t\treturn module.exports;\r\n' +
                '\t}';
        }

        result += '\r\n};\r\n';

    }

    // 遍历模块及其所有依赖项。
    for (var i = 0; i < mergeResult.required.length; i++) {
        var relatedFile = mergeResult.required[i];

        // 支持导出代码。
        if (relatedFile.moduleType in exportedResults) {
            var content = relatedFile.moduleContent || relatedFile.content;
            exportedResults[relatedFile.moduleType] += '\r\n' + content + '\r\n';
            continue;
        }

        result += '\r\n__tpack__.define(' + JSON.stringify(relatedFile.moduleName || relatedFile.srcName) + ', function(exports, module, require){\r\n';

        var content = relatedFile.moduleType !== "resource" ? relatedFile.moduleContent || relatedFile.content : null;

        switch (relatedFile.moduleType) {
            case 'js':

                // 插入全局变量。
                if (relatedFile.moduleFlags.global) {
                    result += 'var global = (function(){return this;})();\r\n';
                }
                if (relatedFile.moduleFlags.process) {
                    result += 'var process = __tpack__.require("process");\r\n';
                }
                if (relatedFile.moduleFlags.Buffer) {
                    result += 'var Buffer = __tpack__.require("buffer");\r\n';
                }
                if (relatedFile.moduleFlags.setImmediate) {
                    result += 'var setImmediate = __tpack__.require("timer").setImmediate;\r\n';
                }
                if (relatedFile.moduleFlags.clearImmediate) {
                    result += 'var clearImmediate = __tpack__.require("timer").clearImmediate;\r\n';
                }

                result += content;
                break;
            case 'css':
                result += 'module.exports = __tpack__.insertStyle(' + JSON.stringify(content) + ');';
                break;
            case 'json':
                result += 'module.exports = ' + content + ';';
                break;
            case "html":
            case "text":
                result += 'module.exports = ' + JSON.stringify(content) + ';';
                break;
            case "resource":
                if ((options.exports && 'resource' in options.exports) || options.nodejs) {
                    var copyTo = options.exports && 'resource' in options.exports ? options.exports.resource : null;
                    // TODO
                    //var dest = builder.getName(Path.resolve(copyTo, relatedFile.destName));
                    var dest = relatedFile.destName;
                    result += 'module.exports = ' + JSON.stringify(file.createPlaceholder(dest)) + ';';
                } else {
                    result += 'module.exports = ' + JSON.stringify(relatedFile.getBase64Url()) + ';';
                }
                break;
        }

        result += '\r\n' +
            '});\r\n';
    }

    // 添加公共尾。
    var entry = JSON.stringify(file.moduleName || file.srcName);
    switch (file.moduleBuildType) {
        case undefined:
            result += '\r\n__tpack__.require(' + entry + ');';
            break;
        case "umd":
            result += '\r\nif (typeof define !== "undefined" && define.amd) {\r\n' +
                '\tdefine(function () { return __tpack__.require(' + entry + '); });\r\n' +
                '} else if (typeof module !== "undefined") {\r\n' +
                '\tmodule.exports = __tpack__.require(' + entry + ');\r\n' +
                '} else {\r\n' +
                '\t(function (exports, value) {\r\n' +
                '\t\tfor (var key in value) {\r\n' +
                '\t\t\texports[key] = value[key];\r\n' +
                '\t\t}' +
                '\t})(typeof exports === "object" ? exports : this, __tpack__.require(' + entry + '));\r\n' +
                '}';
            break;
        case "amd":
            result += "define([], function(){ \r\n" +
                "\treturn __tpack__.require(0);\r\n" +
                "})";
            break;
        case "cmd":
            result += "define([], function(exports, module, require){ \r\n" +
                "\tmodule.exports = __tpack__.require(0);\r\n" +
                "})";
            break;
        case "commonjs":
            result += '\r\nmodule.exports = __tpack__.require(' + entry + ');';
            break;
    }

    // 保存生成的内容。
    file.content = result;

    // 导出内容。
    for (var key in exportedResults) {
        var p = file.resolvePath(exportedResults[key].replace(/\$0/g, file.srcName));
        builder.addFile(builder.getName(p), exportedResults[key]);
    }

};

/**
 * 解析一个文件内的 CommonJs require 指令。
 * @param {String} url 被包含的地址。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回原 require() 占位符。
 */
function parseCommonJsRequire(url, file, options, builder) {

    file.moduleFlags.commonJs = true;

    // 解析 node 内置模块。
    if (options.resolveNodeNativeModules !== false) {
        var path = getNodeNativeModule(url);
        if (path) {
            // 忽略自依赖文件。
            if (path === file.srcPath || options.nodejs || options.ignoreNodeNativeModules === true) {
                return url;
            }
            // 标记依赖全局模块。
            file.moduleFlags[url] = true;
            var relatedFile = exports.getFile(path, options, builder);
            relatedFile.moduleName = url;
            requireModule(file, relatedFile, builder);
            return url;
        }

        // 仅 nodejs 支持的内置模块。
        if (options.nodejs) {
            try {
                if (require.resolve(url) === url) {
                    return url;
                }
            } catch (e) {

            }
        }
    }

    // 解析位置。
    var urlObj = exports.resolveUrl(url, file, options, builder, true, true);
    if (urlObj.url || !urlObj.path) {
        return url;
    }

    // 解析目标模块。
    var relatedFile = exports.getFile(urlObj.path, options, builder);
    requireModule(file, relatedFile, builder);
    return relatedFile.srcName;
}

/**
 * 解析一个文件内的异步导入指令。
 * @param {String} url 被包含的地址。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回原 require() 占位符。
 */
function parseAsyncRequire(url, file, options, builder) {

    file.moduleFlags.commonJs = file.moduleFlags.hasAsyncRequire = true;

    // 解析位置。
    var urlObj = exports.resolveUrl(url, file, options, builder, true, true);
    if (urlObj.url || !urlObj.path) {
        return url;
    }

    // 生成最终地址。
    var relatedFile = builder.getFile(builder.getName(urlObj.path));
    return buildUrl(relatedFile, urlObj.query, url, file, options);
}

/**
 * 解析一个文件内的符号。
 * @param {String} url 被包含的地址。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function parseSymbol(symbol, file, options, builder) {

    file.moduleFlags.commonJs = true;

    switch (symbol) {
        case "exports.":
        case "module.":
        case "global.":
            break;
        case "process.":
            if (options.resolveNodeNativeModules !== false) {
                parseCommonJsRequire("process", file, options, builder);
            }
            break;
        case "Buffer":
            if (options.resolveNodeNativeModules !== false) {
                parseCommonJsRequire("buffer", file, options, builder);
            }
            break;
        case "setImmediate":
        case "clearImmediate":
            if (options.resolveNodeNativeModules !== false) {
                parseCommonJsRequire("timers", file, options, builder);
            }
            break;
    }

}

/**
 * 获取指定路径表示的 node 原生模块。
 * @param {String} url 原生模块名。 
 * @returns {String} 
 */
function getNodeNativeModule(url) {
    return require("node-libs-browser")[url];
}

// #endregion

// #region CSS

/**
 * TPack 解析 CSS 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.css = function (file, options, builder) {

    if (!initModuleInfo(file, "css")) {
        return;
    }

    // 解析地址。
    exports.url(file, options, builder);

    file.content = file.content.replace(/(\/\*[\s\S]*?(?:\*\/|$))|(@import\s+)?\burl\s*\(\s*("(?:[^\\"\r\n\f]|\\[\s\S])*"|'(?:[^\\'\n\r\f]|\\[\s\S])*'|[^)}]+?)\s*\)\s*;?|\bsrc\s*=\s*("(?:[^\\"\r\n\f]|\\[\s\S])*"|'(?:[^\\'\n\r\f]|\\[\s\S])*'|[^)}]+)/g, function (all, comment, atImport, url, filter) {

        if (comment) {
            return parseComments(all, file, options, builder);
        }

        if (url || filter) {
            all = all.replace(/\(\s*(?:"((?:[^\\"\r\n\f]|\\[\s\S])*)"|'((?:[^\\'\n\r\f]|\\[\s\S])*)'|([^)}]+?))\s*\)/, function (all, url1, url2, url3) {
                var url = url1 || url2 || url3;
                if (atImport) {
                    atImport = parseImport(url, file, options, builder);
                    return all;
                }
                return '(' + JSON.stringify(parseUrl(url, file, options, builder)) + ')';
            });
            if (atImport) {
                return "";
            }
        }

        return all;
    });

    // 如果当前文件无依赖项则不需合并。
    if (file.moduleBuildType === "global" || !file.moduleRequired.length) {
        return;
    }

    // 设置模块源码，以便其它模块依赖此模块时能获取到不含模块头的源码。
    file.moduleContent = file.content;

    var mergeResult = mergeModuleInfos(file);

    var result = "";
    for (var i = 0; i < mergeResult.required.length; i++) {
        result += mergeResult.required[i].moduleContent || mergeResult.required[i].content + "\r\n";
    }
    return result;
};

/**
 * 解析一个文件内的 @import 指令。
 * @param {String} url 被包含的地址。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {Boolean} 返回解析结果。
 */
function parseImport(url, file, options, builder) {

    // 解析位置。
    var urlObj = exports.resolveUrl(url, file, options, builder, false, true);
    if (urlObj.url || !urlObj.path) {
        return false;
    }

    // 解析目标模块。
    var relatedFile = exports.getFile(urlObj.path, options, builder);
    requireModule(file, relatedFile, builder);
    return true;
}

// #endregion

// #region 其它资源

/**
 * TPack 解析 JSON 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.json = function (file, options, builder) {

    if (!initModuleInfo(file, "json")) {
        return;
    }

    // 解析地址。
    exports.url(file, options, builder);

};

/**
 * TPack 解析文本模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.text = function (file, options, builder) {

    if (!initModuleInfo(file, "text")) {
        return;
    }

    // 解析地址。
    exports.url(file, options, builder);

};

/**
 * TPack 解析资源模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.resource = function (file, options, builder) {
    initModuleInfo(file, "resource");
};

// #endregion

// #region 模块

/**
 * 为文件添加模块信息。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {String} type 文件的模块类型。
 * @returns {Boolean} 如果返回 @false，说明文件已初始化。
 */
function initModuleInfo(file, type) {
    if (file.moduleType) {
        return false;
    }
    file.moduleType = type;
    file.moduleFlags = { __proto__: null };
    file.moduleIncluded = [];
    file.moduleRequired = [];
    file.moduleExternd = [];
    return true;
}

/**
 * 记录一个文件依赖另一个文件。
 * @param {BuildFile} file 包含的主文件。
 * @param {BuildFile} relatedFile 即将被包含的文件。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function requireModule(file, targetFile, builder) {
    if (hasModuleRequired(targetFile, file)) {
        // 允许 require 互相依赖
        //builder.warn("{0}: Circular require with '{1}'", file.srcName, targetFile.srcName);
        return;
    }
    if (file.moduleRequired.indexOf(targetFile) >= 0) {
        return;
    }
    file.moduleRequired.push(targetFile);
}

/**
 * 判断一个文件是否已依赖另一个文件。
 * @param {BuildFile} file 包含的主文件。
 * @param {BuildFile} relatedFile 即将被包含的文件。
 * @returns {Boolean}
 */
function hasModuleRequired(file, targetFile) {
    if (file === targetFile) {
        return true;
    }
    if (file.moduleRequired) {
        for (var i = 0; i < file.moduleRequired.length; i++) {
            if (hasModuleRequired(file.moduleRequired[i], targetFile)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * 记录一个文件排除另一个文件。
 * @param {BuildFile} file 包含的主文件。
 * @param {BuildFile} relatedFile 即将被包含的文件。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function externModule(file, targetFile, builder) {
    if (file.moduleExternd.indexOf(targetFile) >= 0) {
        return;
    }
    file.moduleExternd.push(target);
}

/**
 * 记录一个文件包含另一个文件。
 * @param {BuildFile} file 包含的主文件。
 * @param {BuildFile} relatedFile 即将被包含的文件。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function includeModule(file, targetFile, builder) {
    if (hasModuleIncluded(targetFile, file)) {
        builder.warn("{0}: Circular include with '{1}'", file.srcName, targetFile.srcName);
        return;
    }
    if (file.moduleIncluded.indexOf(targetFile) >= 0) {
        return;
    }

    file.moduleIncluded.push(targetFile);

    // 复制目标文件的所有属性。
    file.hasPlaceholder = file.hasPlaceholder || targetFile.hasPlaceholder;
    mergeFlags(file.moduleFlags, targetFile.moduleFlags);
    for (var i = 0; i < targetFile.moduleRequired.length; i++) {
        requireModule(file, targetFile.moduleRequired[i], builder);
    }
    for (var i = 0; i < targetFile.moduleExternd.length; i++) {
        externModule(file, targetFile.moduleExternd[i], builder);
    }
}

/**
 * 判断一个文件是否已包含另一个文件。
 * @param {BuildFile} file 包含的主文件。
 * @param {BuildFile} relatedFile 即将被包含的文件。
 * @returns {Boolean}
 */
function hasModuleIncluded(file, targetFile) {
    if (file === targetFile) {
        return true;
    }
    if (file.moduleIncluded) {
        for (var i = 0; i < file.moduleIncluded.length; i++) {
            if (hasModuleIncluded(file.moduleIncluded[i], targetFile)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * 合并文件及依赖项的信息，返回最终模块列表。
 * @param {BuildFile} file 当前正在编译的文件。
 * @returns {Object} 包含合并的结果。其属性值有：
 * * @property {Array} required 实际需要依赖的文件的有序列表。
 * * @property {Object} flags 各文件标记位的集合。
 */
function mergeModuleInfos(file) {

    var result = {
        included: [],
        externd: [],
        required: [],
        flags: { __proto__: null }
    };

    // 添加包含项。
    function include(file) {
        if (result.included.indexOf(file) >= 0) {
            return;
        }
        result.included.push(file);

        for (var i = 0; i < file.moduleRequired.length; i++) {
            include(file.moduleRequired[i]);
        }

        for (var i = 0; i < file.moduleExternd.length; i++) {
            extern(file.moduleExternd[i]);
        }

        result.required.push(file);
    }

    // 添加一个排除项，排除项依赖的项同时排除。
    function extern(file) {
        if (result.externd.indexOf(file) >= 0) {
            return;
        }
        result.externd.push(file);

        for (var i = 0; i < file.moduleRequired.length; i++) {
            extern(file.moduleRequired[i]);
        }

    }

    include(file);

    // 应用排除项和记号位。
    for (var i = result.required.length - 1; i >= 0; i--) {
        if (result.externd.indexOf(result.required[i]) >= 0) {
            result.required.splice(i, 1);
            continue;
        }
        mergeFlags(result.flags, result.required[i].flags);
    }

    return result;
}

/**
 * 合并标记位。
 * @param {Object} dest 
 * @param {Object} src 
 */
function mergeFlags(dest, src) {
    for (var key in src) {
        if (!dest[key]) {
            dest[key] = true;
        }
    }
}

// #endregion

// #region 解析地址

/**
 * 解析文件内的地址。为地址追加时间戳或转换地址为内联的文本。
 * @param {String} url 要处理的相对路径。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @param {Boolean} [returnContentIfInline=false] 如果需要转为内联时，@true 表示返回内容，@false 表示返回 base64 编码。
 * @return {String|Object} 返回文件新地址，或者返回文件信息。
 */
function parseUrl(url, file, options, builder, returnContentIfInline) {

    // 解析位置。
    var urlObj = exports.resolveUrl(url, file, options, builder, false, true);
    if (urlObj.url || !urlObj.path) {
        return url;
    }

    // 获取对应的文件。
    var relatedFile = exports.getFile(urlObj.path, options, builder);

    // 处理内联。
    var inlineLimit = options.inline === false ? 0 :
        options.inline === true ? -1 :
        typeof options.inline === "function" ? options.inline(url, relatedFile) ? -1 : 0 :
        typeof options.inline === "number" ? options.inline :
        /\b__inline\b/.test(urlObj.query) ? +(/\b__inline\s*=\s*(\d+)/.exec(urlObj.query) || [0, -1])[1] : 0;
    if (inlineLimit !== 0 && (inlineLimit < 0 || relatedFile.buffer.length < inlineLimit)) {
        if (returnContentIfInline) {
            includeModule(file, relatedFile);
            return {
                inline: true,
                content: relatedFile.content
            }
        }
        return relatedFile.getBase64Url();
    }

    return buildUrl(relatedFile, urlObj.query, url, file, options);
}

function buildUrl(relatedFile, query, url, file, options) {

    // 追加后缀。
    if (options.appendUrl) {
        query += (query ? '&' : '?') + (typeof options.appendUrl === "function" ? options.appendUrl(url, relatedFile) : relatedFile.formatName(String(options.appendUrl)));
    }

    // 返回路径占位符。
    return file.createPlaceholder(relatedFile.destName) + query;
}

function isUrl(url) {
    return /^(?:(?:\w+:)?\/\/|data:)/.test(url);
}

function splitUrl(url) {
    var urlObj = /^(.*?)([?&#].*)$/.exec(url);
    return urlObj ? {
        path: urlObj[1],
        query: urlObj[2]
    } : {
        path: url,
        query: ""
    };
}

// #endregion

// #region 解析注释

/**
 * 解析代码内的注释部分。
 * @param {String} comment 要处理的注释。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回处理后的注释内容。
 */
function parseComments(comment, file, options, builder) {
    if (options.resolveComment === false) {
        return comment;
    }
    var hasInclude = false;
    var result = "";
    comment.replace(/#(\w+)\s+(.*)/g, function (all, macroName, macroArgs) {
        switch (macroName) {
            case "include":
                var value = parseInclude(removeQuotes(macroArgs), file, options, builder);
                if (value != null) {
                    hasInclude = true;
                    result += value;
                }
                break;
            case "extern":
                parseExtern(removeQuotes(macroArgs), file, options, builder);
                break;
            case "module":
                parseModuleType(removeQuotes(macroArgs), file, options, builder);
                break;
        }
    });
    return hasInclude ? result : comment;
}

/**
 * 解析一个文件内的包含指令。返回被包含的模块内容。
 * @param {String} url 被包含的地址。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回被包含文件的内容。
 */
function parseInclude(url, file, options, builder) {

    // 解析位置。
    var urlObj = exports.resolveUrl(url, file, options, builder, false, false);
    if (urlObj.url) {
        builder.warn("{0}: Cannot include remote file '{1}'", file.srcName, url);
        return;
    }
    if (!urlObj.path) {
        builder.warn("{0}: Cannot find include file '{1}'", file.srcName, url);
        return; file.flags
    }

    // 尝试包含，判断是否存在互嵌套。
    var relatedFile = exports.getFile(urlObj.path, options, builder);
    includeModule(file, relatedFile, builder);
    return relatedFile.moduleContent || relatedFile.content;
}

/**
 * 解析一个文件内的排除指令。
 * @param {String} url 被排除的地址。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function parseExtern(url, file, options, builder) {

    // 解析位置。
    var urlObj = exports.resolveUrl(url, file, options, builder, true, false);
    if (urlObj.url || !urlObj.path) {
        return;
    }

    var relatedFile = exports.getFile(urlObj.path, options, builder);
    externModule(file, relatedFile, builder);
}

/**
 * 解析一个文件内的模块类型指令。
 * @param {String} type 页面设置的类型。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function parseModuleType(type, file, options, builder) {
    type = type.toLowerCase();
    if (type !== "global" && type !== "amd" && type !== "cmd" && type !== "umd" && type !== "commonjs") {
        builder.warn("{0}: Invalid module type: '{1}'. Only 'global', 'cmd', 'amd', 'umd' and 'commonjs' is accepted.", file.name, type);
        return;
    }
    file.moduleBuildType = type;
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

// #endregion
