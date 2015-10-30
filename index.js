
var Path = require('path');
var Lang = require('tealweb/lang');
var IO = require('tealweb/io');

// #region BuildModule

/**
 * 表示一个生成模块。一个生成模块拥有依赖项。生成模块可以是远程文件。
 * @param {String} url 当前模块的绝对位置。
 * @param {String} content 当前模块的内容。
 * @param {BuildFile} [file] 如果是本地文件，当前模块的源文件。
 */
function BuildModule(url, content, file) {
    this.url = url;
    this.content = content;
    this.file = file;
    this.included = [];
    this.requires = [];
    this.excluded = [];
}

BuildModule.prototype = {
    constructor: BuildModule,

    type: '',

    /**
     * 判断当前模块是否是远程模块。
     */
    get isRemote() {
        return !this.file;
    },

    /**
     * 创建在模块内的路径占位符。
     * @param {} url 
     * @returns {} 
     */
    createPathPlaceholder: function (url) {

        if (this.isRemote) {
            return url;
        }

        var urlInfo = splitUrl(url);

        return this.file.createPathPlaceholder(this.file.builder.getName(urlInfo.path)) + urlInfo.query;
    },

    /**
     * 获取当前模板的源完整路径。可能是网址或本地文件绝对位置。
     */
    url: '',

    content: '',

    /**
     * 解析当前模块内指定地址实际代表的路径。
     * @param {String} url 
     * @returns {String} 
     */
    resolveUrl: function (url) {
        url = Path.join(Path.dirname(this.url), url);
        return this.isRemote ? url.replace(/\\/g, "/") : url;
    },

    /**
     * 添加当前模块的一个包含路径。
     * @param {} path 
     * @returns {} 
     */
    include: function (module, builder) {
        this._addDep(module, builder);
        var id = this.included.length;
        this.included[id] = module;
        return "/*_include:" + id + "*/";
    },

    /**
     * 添加当前模块的一个排除路径。
     * @param {} url 
     * @returns {} 
     */
    exclude: function (module) {

        return "";
    },

    /**
     * 标记当前模块的依赖模块。
     * @param {} module 
     * @returns {} 
     */
    require: function (module, builder) {

    },

    /**
     * 添加当前模块的依赖模块。
     * @param {} module 
     * @returns {} 
     */
    _addDep: function (module, builder) {

    },

    /**
     * 合并当前模块。
     * @returns {} 
     */
    merge: function () {

    },

    /**
     * 获取当前模块的最终源码。
     */
    pack: function (options, builder) {
        switch (this.type) {
            case "jsmodule":
                return packJsModule(this, options, builder);
            case "js":

            case "html":

            default:
                console.log(this.content)
                return this.content;
        }
    }

};

function splitUrl(url) {
    var urlParts = /^(.*)([\?&].*)$/.exec(url);
    return urlParts ? {
        path: urlParts[1],
        query: urlParts[2]
    } : {
        path: url,
        query: ""
    };
}

// #endregion

// #region 公用

/**
 * 解析一个模块内的包含指令。返回被包含的模块内容。
 * @param {String} url 被包含的地址。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @param {String} failResult 解析失败时返回的文本。
 * @returns {String} 返回被包含文件的内容。
 */
function parseInclude(url, module, options, builder, failResult) {
    var relatedModule = getRelatedModule(url, module, options, builder, false);
    return relatedModule ? module.include(relatedModule, builder) : failResult; //return module.file ? module.file.createPathPlaceholder(relatedModule.url) : relatedModule.url;
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
    var relatedModule = getRelatedModule(url, module, options, builder, true, true);
    if (relatedModule) {
        module.exclude(relatedModule, builder);
    }
    return "";
}

/**
 * 获取一个模块内核指定路径所表示的等价模块。
 * @param {String} url 要处理的相对路径。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 相关配置。
 * @param {Boolean} requireMode 如果设置为 @true，则“a/b.js”被作为全局路径处理。
 * @returns {BuildModule} 返回相对的模块。
 */
function getRelatedModule(url, module, options, builder, requireMode, ignoreError) {

    // 当一个文件中依赖了另一个地址时，尝试获取另一个地址匹配的模块。
    var urlInfo = resolveUrl(url, module, options, requireMode);

    // 获取网络模块。
    if (urlInfo.url) {
        try {
            return getModuleFromUrl(urlInfo.url, resolveModule, options, builder, module);
        } catch (e) {
            if (ignoreError !== true)
                builder.warn("{0}: Can Not Open: {1}", baseModule.url, url);
            return null;
        }
    }

    // 无法获取本地模块。
    if (urlInfo.fails) {
        if (ignoreError !== true)
            builder.warn("{0}: Reference Not Found: {1}", module.url, url);
        return null;
    }

    // 获取本地生成文件。
    var file = builder.getFile(builder.getName(urlInfo.path));
    var module = getModuleFromFile(file, resolveModule, options, builder);
    module.url = joinQuery(module.url, urlInfo.query);
    return module;

}

/**
 * 解析一个文件内指定相对路径实际所表示的路径。
 * @param {String} url 要处理的相对路径。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 相关配置。
 * @param {Boolean} requireMode 如果设置为 @true，则“a/b.js”被作为全局路径处理。
 * @returns {Object} 返回一个对象。包含以下信息：
 * * @property {String} url 如果是网址，则返回完整的网址部分。
 * * @property {String} path 如果是文件路径，则返回完整的绝对路径部分。
 * * @property {String} query 查询参数部分。
 * * @property {Boolean} fails 指示当前路径是否指向不存在的文件。
 */
function resolveUrl(url, module, options, requireMode) {

    // //domain.com/foo.txt -> http://domain.com/foo.txt
    if (/^\/\//.test(url)) {
        url = (options.protocal || "http:") + url;
    }

    // 如果基础模块是网络地址，则解析路径后仍为网络模块。
    if (module.isRemote) {
        return {
            url: module.resolveUrl(url)
        };
    }

    // 如果当前模块是网络地址，则解析路径后仍为网络模块。
    if (/^\w+:\/\//.test(url)) {
        return {
            url: url
        };
    }

    // 拆开 ? 前后
    urlParts = splitUrl(url);

    // 搜索路径。
    var paths = [];

    // 以 . 或 / 开头或包含 : 则不用全局搜索。
    if (/^[\.\/]/.test(urlParts.path) || urlParts.path.indexOf(':') >= 0) {
        paths.push(module.resolveUrl(urlParts.path));
    } else {

        // 非 require 模式首先支持将路径默认作为相对路径处理。
        if (!requireMode) {
            paths.push(module.resolveUrl(urlParts.path));
        }

        // 全局搜索路径。
        if (options.paths) {
            for (var i = 0; i < options.paths.length; i++) {
                paths.push(Path.resolve(options.paths[i], urlParts.path));
            }
        }

        // node_modules 全局搜索路径。
        if (requireMode && options.searchNodeModules) {
            var dir = module.url, p;
            while (p !== dir) {
                p = dir;
                dir = Path.dirname(dir);
                paths.push(Path.join(dir, 'node_modules', urlParts.path));
            }
        }

    }

    // 解析各种扩展名组合结果。
    var extensions = Path.extname(urlParts.path) ? null : options.extensions;
    for (var i = 0; i < paths.length; i++) {

        // 判断未补充扩展名是否存在。
        if (IO.existsFile(paths[i])) {
            urlParts.path = paths[i];
            return urlParts;
        }

        // 尝试自动填充扩展名。
        if (extensions) {
            for (var j = 0; j < extensions.length; j++) {
                if (IO.existsFile(paths[i] + extensions[j])) {
                    urlParts.path = paths[i] + extensions[j];
                    return urlParts;
                }
            }
        }

    }

    urlParts.fails = true;
    return urlParts;
}

/**
 * 获取和一个物理文件关联的模块。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Function} resolver 解析当前模块的解析器。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {BuildModule} 返回对应的模块。
 */
function getModuleFromFile(file, resolver, options, builder) {
    var module = file.module;
    if (!module) {
        file.module = module = new BuildModule(file.srcPath, file.content, file);
        resolver(module, options, builder);
    }
    return module;
}

/**
 * 获取和一个网络地址关联的模块。
 * @param {String} url 当前的网址。
 * @param {Function} resolver 解析当前模块的解析器。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {BuildModule} 返回对应的模块。
 */
function getModuleFromUrl(url, resolver, options, builder) {

    // 不允许载入网络模块。
    if (!options.requestRemoteModules) {
        return null;
    }

    // 更新网络模块缓存。
    if (builder.counter !== BuildModule._netModulesCacheId) {
        BuildModule._netModulesCacheId = builder.counter;
        BuildModule._netModulesCaches = { __proto__: null };
    }

    // 获取或创建模块。
    return BuildModule._netModulesCaches[url] || (BuildModule._netModulesCaches[url] = new BuildModule(url, request(url, options.requestTimeout || 60000)));
}

/**
 * 发送请求并返回响应。
 * @param {} url 
 * @param {} requestTimeout 
 * @returns {} 
 */
function request(url, requestTimeout) {
    return require('urllib-sync').request(url, { timeout: requestTimeout }).data;
}

function joinQuery(url, query) {
    return url + query;
}





/**
 * 处理一个文件内部内联的代码。
 * @param {String} content 内联的代码内容。
 * @param {String} ext 代码内容等效的扩展名。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Builder} builder 当前的构建器。
 * @returns {String} 返回已处理的文件内容。
 */
function parseInlineContent(content, ext, module, options, builder) {
    return builder.process(file.srcPath + "#inline" + ext, content).content;
}

function parseInlineUrl(url, module, options, builder, returnContentIfInline) {

}

/**
 * 解析一个普通模块。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {} 
 */
function resolveTextModule(module, options, builder) {
    if (options.resolveUrl !== false) {
        module.content = module.content.replace(/([^\s'",=\(\[\{\)\]\}]*)[?&]__url/g, function (_, url) {
            return parseInlineUrl(url, module, options, builder);
        });
    }
}

/**
 * 合并 #include 包含的模块。
 * @param {} module 
 * @param {} options 
 * @param {} builder 
 * @returns {} 
 */
function mergeIncludes(module, options, builder, result) {
    var content = '';
    if (module.included.length) {
        for (var i = 0; i < module.included.length; i++) {
            result
        }
    }
    return module.conet
}

function resolveModule(module, options, builder) {
    //  resolveJsModule(module, options, builder);
    //var ext = file.extension;
    //return exports[/^\.(html?|inc|.*p)$/.test(ext) ? "html" : ext === "js" ? "js" : ext === "css" ? "css" : "other"](file, options, builder);
}

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
        module.content = module.content.replace(/<!--\s*#(\w+)(.*?)\s*-->/g, function (all, macroName, args) {
            switch (macroName) {
                case "include":
                    return module.include(removeQuotes(args));
                case "exclude":
                    return module.exclude(removeQuotes(args));
                default:
                    return all;
            }
        });
    }

    // 解析特定标签。
    if (options.resolveHtmlTags !== false) {

        // 解析内联的 <style>, <script>: 分别以 CSS, JS 处理
        module.content = module.content.replace(/(<s(tyle|cript)([^>]*?)>)([\s\S]*?)(<\/s\2[^>]*?>)/gi, function (_, prefix, styleOrScript, tags, content, postfix) {

            // content 的意义根据 type 决定。
            var type = getAttr(tags, "type");
            var src;

            // <style>
            if (styleOrScript.length < 5) {
                content = parseInlineContent(content, type && type !== "text/css" ? getExtByMimeType(options, type) : '.css', module, options, builder);
            } else {
                // <script src>
                var src = getAttr(tags, "src");
                if (src) {
                    var result = parseInlineUrl(src, module, options, builder, true);
                    if (result.inline) {
                        content = result.content;
                        prefix = removeAttr(prefix, "src");
                    } else {
                        prefix = setAttr(prefix, "src", result);
                    }
                    // <script>
                } else {
                    content = parseInlineContent(content, type && type !== "text/javascript" ? getExtByMimeType(options, type) : '.js', module, options, builder);
                }
            }

            // 解析 <... __dest="">
            if (options.resolveDest !== false) {
                var dest = getAttr(prefix, "__dest");
                if (dest) {
                    var url = resolveUrl();
                    if (!url.isUrl) {

                        // 获取目标文件原始内容并追加当前文件的内容。
                        var destFile = builder.createFile(url.name);
                        builder.processFile(destFile);
                        destFile.content += content;
                        destFile.save();

                        dest = file.createPathPlaceholder(destFile.srcName);

                        // 将标签替换为等效的外链标签。
                        prefix = removeAttr(prefix, "__dest");
                        return styleOrScript.length < 5 ?
                            setAttr(setAttr('<link' + prefix.substr('<style'.length), 'rel', 'stylesheet'), 'href', dest) :
                            setAttr(prefix, 'src', dest);
                    }

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
                        var result = parseInlineUrl(src, module, options, builder, true);
                        if (result.inline) {
                            var type = getAttr(tags, "type");
                            tags = removeAttr(removeAttr('<style' + tags.substr("<link".length), "rel"), "href") + '\r\n' + result.content + '\r\n</style>';
                        } else {
                            tags = setAttr(tags, "href", result);
                        }
                    } else if (rel === "html") {
                        var result = parseInlineUrl(src, module, options, builder, true);
                        tags = result.inline ? result.content : setAttr(tags, "href", result);
                    } else {
                        tags = setAttr(tags, "href", parseInlineUrl(src, module, options, builder));
                    }
                }
            } else {
                // <... src>
                var src = getAttr(tags, 'src');
                if (src) {
                    tags = setAttr(tags, "src", parseInlineUrl(src, module, options, builder));
                }
            }

            return tags;
        });

    }

    // 解析地址。
    resolveTextModule(module, options, builder);

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

// #endregion

// #region JS

/**
 * 分析一个 JS 模块的依赖项。
 * @param {BuildModule} module 要解析的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 */
function resolveJsModule(module, options, builder) {

    module.type = 'js';

    // 解析注释 #include(...)
    if (options.resolveComments !== false) {
        module.content = module.content.replace(/\/[\/\*]\s*#(\w+)\s+(.*)/g, function (all, macroName, macroArgs) {
            macroArgs = macroArgs.replace(/\s*(\*\/)?$/, "");
            if (macroName === "include") {
                return parseInclude(macroArgs, module, options, builder, all);
            }
            if (macroName === "exclude") {
                return parseExclude(macroArgs, module, options, builder);
            }
            if (macroName === "moduletype") {
                var type = macroArgs.toLowerCase();
                if (type !== "amd" && type !== "umd" && type !== "commonjs") {
                    builder.warn("{0}: #moduletype Can only be one of `amd`, `umd` and `commonjs`. Currently is set to {1}", module.url, macroArgs);
                } else {
                    module.buildType = type;
                }
                return "";
            }
            return all;
        });
    }

    // 为避免注释干扰，首先将注释删除。
    var removedSegments = [];
    module.content = module.content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*?(\r|\n|$)|'[^']*'|"[^"]*"/g, function (all) {
        if (all[0] === '/' && /\b(require|define)\b/.test(all)) {
            var id = removedSegments.length;
            removedSegments[id] = all;
            return '/*_comment:' + id + '*/';
        }
        return all;
    });

    // 解析 CommonJs：require("xxx")
    if (options.resolveCommonJsRequires !== false) {
        module.content = module.content.replace(/\brequire\s*\(\s*('([^']*?)'|"([^"]*?)")\s*\)/g, function (all, param, url1, url2) {
            module.commonJs = true;
            return 'require("' + parseRequire(url1 || url2, module, options, builder) + '")';
        });
    }

    // 解析 AMD：define(..., [...], function(){ ... })
    if (options.resolveAmdRequires !== false) {
        module.content = module.content.replace(/\bdefine\s*\(([\s\S]*?)\,\s*function\b/g, function (all, content) {
            module.commonJs = module.amd = true;
            // content: ["module1, "module2"]  或 "name", ["module1, "module2"] 
            try {
                content = eval("[" + content + "]");
                content = content[1] || content[0];
                return '[' + Array.prototype.map.call(content, function (url) {
                    return '"' + parseRequire(url, module, options, builder) + '"';
                }).join(', ') + ']';
            } catch (e) {
                return all;
            }

        });
    }

    // 解析 AsyncRequire：require(["xxx"], function(){ ... })
    if (options.resolveAsyncRequires !== false) {
        module.content = module.content.replace(/\brequire\s*\(([\s\S]*?)\,\s*function\b/g, function (all, content) {
            module.hasAsyncRequire = true;
            try {
                content = eval(content);
                if (!Array.isArray(content)) {
                    content = [content];
                }
                return 'require([' + Array.prototype.map.call(content, function (url) {
                    return '"' + parseAsyncRequire(url, module, options, builder) + '"';
                }).join(', ') + '], function';
            } catch (e) {
                return all;
            }
        });
    }

    // 未发现其它模块类型则检测 exports。
    if (options.resolveCommonJsExports !== false && !module.commonJs && /\b(exports|module)\./.test(module.content)) {
        module.commonJs = true;
    }

    // 恢复注释。
    if (removedSegments.length) {
        module.content = module.content.replace(/\/\*_comment:(\d+)\*\//g, function (_, id) {
            return removedSegments[id];
        });
    }



}

/**
 * 解析一个模块内的导入指令。
 * @param {String} url 被包含的地址。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回原 require() 占位符。
 */
function parseRequire(url, module, options, builder) {
    var relatedModule = getRelatedModule(url, module, options, builder, false);
    module.require(relatedModule);
    return module.createPathPlaceholder(relatedModule.url);
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

    return '异步导入';
}

/**
 * 将 JS 模块打包成一个文件。
 * @param {BuildModule} module 当前正在处理的模块。
 * @param {Object} options 用户设置的传递给当前插件的选项。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String} 返回 JS 模块。
 */
function packJsModule(module, options, builder) {

    var result;

    // 既不是 commonJs 模块，又没有异步加载，不需要额外处理。
    if (!module.commonJs && !module.hasAsyncRequire) {
        result = module.content;
    } else {

        result = '';

        if (module.commonJs || module.hasAsyncRequire) {
            result += '';
        }

    }

    if (module.buildType) {

    }

}

// #endregion
















// #region 导出

/**
 * Tpack 解析模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体可用的选项值见：https://github.com/sass/node-sass。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
module.exports = exports = function (file, options, builder) {
    file.content = getModuleFromFile(file, resolveModule, options, builder).pack(options, builder);
};

/**
 * Tpack 解析 HTML 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体可用的选项值见：https://github.com/sass/node-sass。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.html = function (file, options, builder) {
    file.content = getModuleFromFile(file, resolveHtmlModule, options, builder).pack(options, builder);
};

/**
 * Tpack 解析 CSS 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体可用的选项值见：https://github.com/sass/node-sass。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.css = function (file, options, builder) {
    file.content = getModuleFromFile(file, resolveCssModule, options, builder).pack(options, builder);
};

/**
 * Tpack 解析 JS 模块内容的插件。
 * @param {BuildFile} file 当前正在编译的文件。
 * @param {Object} options 用户设置的传递给当前插件的选项。具体可用的选项值见：https://github.com/sass/node-sass。
 * @param {Builder} builder 当前正在使用的构建器。
 * @returns {String|Undefined} 返回新文件或新文件内容。
 */
exports.js = function (file, options, builder) {
    file.content = getModuleFromFile(file, resolveJsModule, options, builder).pack(options, builder);
};

// #endregion

//// #region HTML

///**
// * 处理 HTML 文件里的外部资源引用：尝试重定向地址或内联。
// * @param {} file 
// * @param {} options 
// * * @property {String} protocal 在页面中 // 表示的协议。如 https:
// * * @property {Object} mimeTypes 内联 base64 地址时使用的 MIME 类型。
// * * @property {String} virtualPath 在页面中跟路径 / 表示的路径。默认为项目跟路径。
// * * @property {String} staticUrl 路径中转换的基础地址。如 http://cdn.com/
// * * @property {String} staticPath 路径中转换的基础路径。如 assets/
// * * @property {String} urlPostfix 路径中追加的后缀。如 _=<md5>
// * @param {} builder 
// * @returns {} 
// */
//exports.html = function (file, options, builder) {

//    if (options.parseTags !== false) {

//        // 处理内联的 <style>, <script>: 分别以 CSS, JS 处理
//        file.content = file.content.replace(/(<s(tyle|cript)([^>]*?)>)([\s\S]*?)(<\/s\2[^>]*?>)/gi, function (all, prefix, styleOrScript, tags, content, postfix) {

//            // content 的意义根据 type 决定。
//            var type = getAttr(tags, "type");
//            var src;

//            // <style>
//            if (styleOrScript.length < 5) {
//                content = processInlined(builder, file, content, type && type !== "text/css" ? getExtByMimeType(options, type) : '.css');
//            } else {
//                // <script src>
//                var src = getAttr(tags, "src");
//                if (src) {
//                    var result = processDependency(file, src, options, builder, true);
//                    if (result.inline) {
//                        content = result.content;
//                        prefix = removeAttr(prefix, "src");
//                    } else {
//                        prefix = setAttr(prefix, "src", result);
//                    }
//                    // <script>
//                } else {
//                    content = processInlined(builder, file, content, type && type !== "text/javascript" ? getExtByMimeType(options, type) : '.js');
//                }
//            }

//            all = prefix + content + postfix;

//            // <... __dest="">
//            if (options.parseDest !== false) {
//                var dest = getAttr(prefix, "__dest");
//                if (dest && !/:|^\/\//.test(dest)) {

//                    // 拆分路径的 ? 后的部分。
//                    var urlParts = parseUrl(dest);

//                    // 添加为文件并替换为路径。
//                    dest = processExport(builder, file, content, dest) + urlParts.query;

//                    prefix = removeAttr(prefix, "__dest");

//                    all = styleOrScript.length < 5 ?
//                        setAttr(setAttr('<link' + prefix.substr('<style'.length), 'rel', 'stylesheet'), 'href', src) :
//                        setAttr(prefix, 'src', src);
//                }
//            }

//            return all;
//        });

//        // <link>: 内联或更新地址
//        file.content = file.content.replace(/<(link|img|embed|audio|video|link|object|source)[^>]*?>/gi, function (tags, tagName) {

//            // <link>
//            if (/^link$/i.test(tagName)) {
//                var src = getAttr(tags, "href");
//                if (src) {
//                    var rel = getAttr(tags, "rel");
//                    if (!rel || rel === "stylesheet") {
//                        var result = processDependency(file, src, options, builder, true);
//                        if (result.inline) {
//                            var type = getAttr(tags, "type");
//                            tags = removeAttr(removeAttr('<style' + tags.substr("<link".length), "rel"), "href") + '\r\n' + result.content + '\r\n</style>';
//                        } else {
//                            tags = setAttr(tags, "href", result);
//                        }
//                    } else if (rel === "html") {
//                        var result = processDependency(file, src, options, builder, true);
//                        tags = result.inline ? result.content : setAttr(tags, "href", result);
//                    } else {
//                        tags = setAttr(tags, "href", processDependency(file, src, options, builder));
//                    }
//                }
//            } else {
//                // <... src>
//                var src = getAttr(tags, 'src');
//                if (src) {
//                    tags = setAttr(tags, "src", processDependency(file, src, options, builder));
//                }
//            }

//            return tags;
//        });

//    }

//    // <!-- #include --> 内联
//    if (options.parseInclude !== false) {
//        file.content = file.content.replace(/<!--\s*#include(.*?)\s*-->/g, function (all, url) {

//            // 处理 <!-- #include virtual="p" --> -> <!-- #include p -->
//            // 处理 <!-- #include "p" --> -> <!-- #include p -->
//            url = url.replace(/^.*?['"]/, '').replace(/['"].*$/, '');

//            // 以 HTML 方式解析内部依赖项。
//            return processDependency(file, url, options, builder, true, true).content;

//        });
//    }

//    // 处理外部地址。
//    exports.text(file, options, builder);

//};

//function parseHtmlModule(parameters) {

//}

/////**
//// * 处理文件内部代码的导出。
//// * @param {Builder} builder 当前的构建器。
//// * @param {BuildFile} file 当前正在处理的文件。
//// * @param {String} content 导出的代码内容。
//// * @param {String} relativePath 导出相对路径。
//// * @returns {String} 返回导出后的新代码路径。
//// */
////function processExport(builder, file, content, relativePath) {

////}

/////**
//// * 处理指定文件的依赖文件。
//// * @param {Builder} builder 当前构建器。
//// * @param {BuildFile} file 当前正在处理的文件。
//// * @param {String} relativeUrl 要处理的相对路径。
//// * @param {Object} options 相关配置。
//// * @param {Boolean} [returnContentIfInline=false] 如果内联时，@true 表示返回内容，@false 表示返回 base64 编码。
//// * @return {String|Object} 返回文件新地址，或者返回文件信息。
//// */
////function processDependency(builder, file, relativeUrl, options, returnContentIfInline, forceInline) {

////    var url = relativeUrl;
////    // //domain.com/foo.txt -> http://domain.com/foo.txt
////    if (/^\/\//.test(url)) {
////        url = (options.protocal || "http:") + url;
////    }

////    var isInline = forceInline || (options.inline === false ? false : options.inline === true || /\b__inline\b/.test(url));
////    var urlParts = parseUrl(url);

////    // 绝对路径。
////    if (url.indexOf(':') >= 0) {

////        // 仅支持 http(s) 协议地址内联。
////        if (isInline && /^https?:/i.test(url)) {
////            var buffer = request(url);

////            var limit = +(/\b__inline\s*=\s*(\d+)/.exec(url) || 0)[1];
////            if (!limit || buffer.length < limit) {
////                return returnContentIfInline ? {
////                    inline: true,
////                    content: buffer.toString(builder.encoding)
////                } : getBase64Url(buffer, urlParts.path, options.mimeTypes);
////            }

////        }

////        // 不内联的绝对路径不处理。
////        return relativeUrl;

////    }

////    // 解析相对文件。
////    // 注意：可能出现递归调用的问题。
////    var relativeFile = file.addDependency(urlParts.path);
////    if (!relativeFile.exists) {
////        return relativeUrl;
////    }

////    // 测试是否有循环的引用。
////    if (relativeFile.hasDependency(file)) {
////        builder.error('{0}: Circular References with {1}', file.srcPath, relativeFile.srcPath);
////    }

////    // 内联。
////    if (isInline) {
////        var limit = +(/\b__inline\s*=\s*(\d+)/.exec(url) || 0)[1];
////        if (!limit || buffer.length < limit) {
////            return returnContentIfInline ? {
////                inline: true,
////                // 优先获取匹配的模板，以方便二次重定向之后更换位置。
////                content: relativeFile._assetsProcessed || relativeFile.content
////            } : getBase64Url(relativeFile.buffer, relativeFile.destPath, options.mimeTypes);
////        }
////    }

////    var newRelativeUrl;

////    // 如果指定了静态文件路径则重定向到目标静态路径。
////    if (options.staticUrl != null) {

////        // 获取 CDN 上传跟目录。
////        var staticPath = builder.getFullPath(options.staticPath);

////        // 计算目标文件在 CDN 的路径。
////        newRelativeUrl = Path.relative(staticPath, relativeFile.destFullPath);

////        // 如果当前路径在 CDN 外，则不采用 CDN 地址。
////        newRelativeUrl = /^\.\./.test(newRelativeUrl) ? '<<<path:///' + relativeFile.destPath + '>>>' : Path.join(options.staticUrl, newRelativeUrl).replace(/\\/g, '/');

////    } else {
////        newRelativeUrl = '<<<path:///' + relativeFile.destPath + '>>>';
////    }

////    // 追加后缀。
////    var urlPostfix = options.urlPostfix;
////    if (typeof urlPostfix === "function") {
////        urlPostfix = urlPostfix(relativeFile);
////    }
////    if (urlPostfix) {
////        urlPostfix = urlPostfix.replace(/<(.*)>/, function (all, tagName) {
////            switch (tagName) {
////                case "date":
////                    return new Date().format("yyyyMMdd");
////                case "time":
////                    return new Date().format("yyyyMMddHHmmss");
////                case "md5":
////                    return getMd5(relativeFile.buffer);
////                case "md5h":
////                    return getMd5(relativeFile.buffer).substr(0, 16);
////                case "md5s":
////                    return getMd5(file.buffer).substr(0, 6);
////            }
////            return all;
////        });
////        urlParts.query = (urlParts.query ? urlParts.query + '&' : '?') + urlPostfix;
////    }

////    return newRelativeUrl + urlParts.query;

////}


////function getMd5(content) {
////    var Crypto = require('crypto');
////    var md5sum = Crypto.createHash('md5');
////    md5sum.update(content);
////    return md5sum.digest('hex');
////}

////function getBase64Url(buffer, path, mimeTypes) {
////    return 'data:' + getMimeType(mimeTypes, Path.extname(path)) + ';base64,' + buffer.toString('base64');
////}

////function getMimeType(mimeTypes, ext) {

////    // 从用户定义处获取 mimeType。
////    if (mimeTypes && ext in mimeTypes) {
////        return mimeTypes[ext];
////    }

////    var serverConfigs = require('aspserver/configs');
////    if (serverConfigs.mimeTypes && ext in serverConfigs.mimeTypes) {
////        return serverConfigs.mimeTypes[ext];
////    }

////    return 'application/x-' + ext.slice(1);
////};

//// #endregion

//// #region CSS

//exports.css = function (file, options, builder) {

//    // @import url(): 内联或重定向。
//    if (options.parseCssUrl !== false) {
//        file.content = file.content.replace(/((@import\s+)?url\(\s*(['"]?))(.*?)(\3\s*\))/, function (all, prefix, atImport, q, url, postfix) {

//            // 内联 CSS。
//            if (atImport) {
//                var result = processDependency(file, url, options, builder, true);
//                return result.inline ? result.content : prefix + result + postfix;
//            }

//            // 否则是图片等外部资源。
//            return prefix + processDependency(file, url, options, builder) + postfix;

//        });
//    }

//    // 处理外部地址。
//    exports.text(file, options, builder);

//};

//// #endregion

//// #region JS

///**
// * 解析一个文件为一个模块。解析其内部的
// * @param {} file 
// * @param {} options 
// * @param {} builder 
// * @returns {} 
// */
//function parseModule(builder, options, file) {
//    var module = file._requireModule;
//    if (!module) {
//        file._requireModule = module = new Module(file, file.content);

//        // 为避免注释干扰，首先将注释删除。
//        var segments = [];
//        module.content = module.content.replace(/\/\*[\s\S]*\*\/|\/\/[^\r\n]*(\r|\n|$)/g, function (all) {
//            if (/\b(require|define)\b/.test(all)) {
//                var id = segments.length;
//                segments[id] = all;
//                return '__COMMENTS_' + id + '__';
//            }
//            return all;
//        });

//        // 解析 CommonJs：require("xxx")
//        if (options.parseCommonJsRequires !== false) {
//            module.content = module.content.replace(/\brequire\s*\(\s*('([^']*?)'|"([^"]*?)")\s*\)/g, function (all, param, url1, url2) {
//                module.type = 'commonjs';
//                var requiredModule = parseRequireModule(builder, options, file, url1 || url2);
//                module.requires.push(requiredModule);
//                return 'require("' + requiredModule.file.name + '")';
//            });
//        }

//        // 解析 AsyncRequire：require(["xxx"], function(){ ... })
//        if (options.parseAsyncRequires !== false) {
//            module.content = module.content.replace(/\brequire\s*\(([\s\S]*?)\,\s*function\b/g, function (all, content) {
//                module.hasAsyncRequire = true;
//                try {
//                    content = eval(content);
//                } catch (e) {
//                    return all;
//                }

//                if (!Array.isArray(content)) {
//                    return all;
//                }

//                return 'require("' + content.map(function (url) {
//                    var urlInfo = resolveUrl(builder, options, file, url, true);
//                    return url.isUrl ? url : file.createPathPlaceholder(urlInfo.path);
//                }).join(", ") + '", function';
//            });
//        }

//        // 设置模块类型。
//        if (!module.type) {
//            module.type = /\b(exports|module)\./.test(module.content) ? 'commonjs' : 'umd';
//        }

//        // 解析 AMD：define(..., [...], function(){ ... })
//        if (options.parseAmdRequires !== false) {
//            module.content = module.content.replace(/\bdefine\s*\(([\s\S]*?)\,\s*function\b/g, function (all, content) {
//                module.type = 'amd';
//                // content: ["module1, "module2"]  或 "name", ["module1, "module2"] 
//                try {
//                    content = eval("[" + content + "]");
//                } catch (e) {
//                    content = ['', []];
//                }
//                if (content.length > 1) {
//                    module.name = content[0];
//                }
//                module.requires.push.apply(module.requires, content[content.length - 1]);
//                return all;
//            });
//        }

//        // 解析注释 #include(...)
//        if (options.parseCommentRequires !== false) {
//            module.content = module.content.replace(/\/[\/\*]\s*#(\w+)\s+(.*)/g, function (all, command, url) {
//                url = url.replace(/\s*(\*\/)?$/, "");
//                if (command === 'include') {
//                    var requiredModule = parseRequireModule(builder, options, file, url);
//                    module.requires.push.apply(module.requires, requiredModule.requires);
//                    module.excluded.push.apply(module.excluded, requiredModule.excluded);
//                    all = requiredModule.content;
//                } else if (command === 'exclude') {
//                    module.excluded.push(parseRequireModule(builder, options, file, url));
//                } else if (command === "moduletype") {
//                    module.definedType = module.type = url.toLowerCase();
//                }
//                return all;
//            });
//        }

//        if (segments.length) {
//            module.content = module.content.replace(/__COMMENTS_(\d+)__/, function (_, id) {
//                return segments[id];
//            });
//        }

//    }
//    return module;
//}

///**
// * 解析一个模块内指定相对路径实际所表示的模块。
// * @param {} file 
// * @param {} options 
// * @param {} url 
// * @returns {} 
// */
//function parseRequireModule(builder, options, file, url) {

//    // 解析地址。
//    var urlInfo = resolveUrl(builder, options, file, url, true);

//    // 获取对应的文件。
//    var file = urlInfo.isUrl ? builder.createFile(url, request(urlInfo.url)) : builder.getFile(urlInfo.path);

//    // 解析模块。
//    return parseModule(builder, options, file);
//}

///**
// * 使用指定的方式打包指定的模块。
// * @param {Module} mainModule 要打包的主模块。
// * @param {String} [type] 模块类型，可以是 'amd'、'cmd'、'umd'、'commonjs'
// * @returns {String} 返回打包好的模块源码。 
// */
//function packModule(mainModule, type) {

//    // 无依赖模式。
//    if (!type && !mainModule.requires.length) {
//        return mainModule.content;
//    }

//    // 1. 计算模块的排除项。
//    var excludedList = [];

//    // 添加一个排除项，排除项依赖的项同时排除。
//    function addExclude(module) {

//        // 添加到排除列表，不重复排除。
//        if (excludedList.indexOf(module) >= 0) {
//            return;
//        }
//        excludedList.push(module);

//        // 排除项的依赖项同样排除。
//        for (var i = 0; i < module.requires.length; i++) {
//            addExclude(module.requires[i]);
//        }
//    }

//    // 应用模块指定的排除列表，依赖模块的排除列表同时应用。
//    function applyExclude(module) {
//        for (var i = 0; i < mainModule.excluded.length; i++) {
//            addExclude(mainModule.excluded[i]);
//        }
//        for (var i = 0; i < module.requires.length; i++) {
//            applyExclude(module.requires[i]);
//        }
//    }

//    // 主模块的依赖项直接排除。
//    applyExclude(mainModule);

//    // 2. 包含所有模块。
//    var result = excludedList.length ? '' : getSourceCode('commonJsHeader', commonJsHeader);

//    var needAppendAmdHeader = false;
//    var hasAsyncRequire = false;

//    function applyInclude(module) {

//        // 不重复包含。
//        if (excludedList.indexOf(module) >= 0) {
//            return;
//        }
//        excludedList.push(module);

//        // 处理依赖项。
//        for (var i = 0; i < module.requires.length; i++) {
//            applyInclude(module.requires[i]);
//        }

//        // 存在异步加载。
//        if (module.hasAsyncRequire) {
//            hasAsyncRequire = true;
//        }

//        if (module.type === 'amd') {
//            needAppendAmdHeader = true;

//            // AMD 模块本身具有包装，无需再次包装。
//            result += module.content;
//        } else {

//            // 其它模块必须经过包装。
//            result += '__tpack__.define("' + module.file.name + '", function(exports, module, require){\r\n' + module.content + '});\r\n';
//        }

//    }

//    applyInclude(mainModule);

//    if (!excludedList.length && needAppendAmdHeader) {
//        result = getSourceCode('amdHeader', amdHeader) + result;
//    }

//    switch (type) {
//        case undefined:
//            result += '\r\n__tpack__.require("' + mainModule.file.name + '");';
//            break;
//        case 'umd':
//            result += '\r\n__tpack__.module["' + mainModule.file.name + '"].exports = typeof exports === "object" ? exports : this';
//            result += '\r\n__tpack__.require("' + mainModule.file.name + '");';
//            break;
//        case 'amd':
//            result = '\r\ndefine("' + mainModule.file.name + '",[],function(){\r\n' + result + '\r\n\r\nreturn __tpack__.require("' + mainModule.file.name + '");});\r\n';
//            break;
//        case 'cmd':
//            result = '\r\ndefine("' + mainModule.file.name + '",function(){\r\n' + result + '\r\n\r\nreturn __tpack__.require("' + mainModule.file.name + '");});\r\n';
//        case 'commonjs':
//            result += '\r\nmodule.exports = __tpack__.require("' + mainModule.file.name + '");';
//            break;
//    }

//    return result;
//}

//function commonJsHeader() {
//    var __tpack__ = __tpack__ || {
//        modules: { __proto__: null },
//        define: function (moduleName, factory) {
//            return __tpack__.modules[moduleName] = {
//                factory: factory,
//                exports: {}
//            };
//        },
//        require: function (moduleName, callback) {
//            var module = __tpack__.modules[moduleName];
//            if (!module) {
//                throw new Error('Can not find module: ' + moduleName);
//            }
//            if (!module.loaded) {
//                module.loaded = true;
//                module.factory.call(module.exports, module.exports, module, __tpack__.require, moduleName);
//            }
//            return module.exports;
//        }
//    };
//}

//function amdHeader() {
//    var define = define || function (moduleName, depModules, factory) {
//        return __tpack__.define(moduleName, function (exports, module, require) {
//            var modules = [];
//            for (var i = 0; i < depModules.length; i++) {
//                modules = require(depModules[i]);
//            }
//            module.exports = factory.apply(null, modules);
//        });
//    };
//}

//var sourceCodes = {};
//function getSourceCode(id, fn) {
//    var sourceCode = sourceCodes[id];
//    if (!sourceCode) {
//        sourceCodes[id] = sourceCode = fn.toString().replace(/^function.*?\{/, "").replace(/\}$/, "");
//    }
//    return sourceCode;
//}

//// #endregion

//function formatProcessed(processedText, file) {
//    return processedText.replace(/<<<path:\/\/\/(.*?)>>>/g, function (all, fullPath) {
//        return file.relativePath(fullPath);
//    });
//}

