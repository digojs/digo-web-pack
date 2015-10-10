﻿

var Path = require('path');
var Lang = require('tealweb/lang');

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
    var re = new RegExp('\\s' + attrName + '\\s*(=\\s*([\'"])([\\s\\S]*?)\\2)?', 'i');
    html = html.replace(re, "");
    return html;
}

function encodeHTMLAttribute(str) {
    typeof console === "object" && console.assert(typeof str === "string", "encodeHTMLAttribute(str: 必须是字符串)");
    return str.replace(/[\'\"]/g, function (v) {
        return ({
            '\'': '&#39;',
            '\"': '&quot;'
        })[v];
    });
}

/**
 * 处理指定文件的依赖文件。
 * @param {Builder} builder 当前正在处理的文件路径。
 * @param {BuildRule} rule 当前生成的规则。
 * @param {BuildFile} baseFile 当前正在处理的文件路径。
 * @param {String} relativeUrl 要处理文件的相对路径。
 * @param {Boolean} [returnContentIfInline=false] 如果内联时，@true 表示返回内容，@false 表示返回 base64 编码。
 * @return {String|Object} 返回文件新地址，或者返回文件信息。
 */
function processDependency(builder, rule, baseFile, relativeUrl, returnContentIfInline) {

    var isInline = /\b__inline\b/.test(relativeUrl);
    var urlParts = /^(.*)([\?&].*)$/.exec(relativeUrl) || [relativeUrl, relativeUrl, null];

    // 绝对路径。
    if (/^\/|:/.test(relativeUrl)) {

        if (isInline) {
            var url = relativeUrl.replace(/^\/\//, (rule.protocal || builder.protocal || "http") + "://");
            if (/^https?:/i.test(url)) {
                var buffer = request(url);

                if (returnContentIfInline) {
                    return {
                        inline: true,
                        content: buffer.toString(builder.encoding)
                    };
                }

                return getBase64Url(buffer, urlParts[1], builder.mimeTypes);
            }
        }

        // 不内联的绝对路径不处理。
        return relativeUrl;

    }

    // 提取文件路径部分，转为绝对路径并处理。
    var relativeFile = builder.process(Path.resolve(Path.dirname(baseFile.src), urlParts[1]));

    if (isInline) {

        if (returnContentIfInline) {
            return {
                inline: true,
                content: relativeFile.content
            };
        }

        return getBase64Url(relativeFile.buffer, relativeFile.dest, builder.mimeTypes);

    } else {

        // 将生成的文件根据目标路径提取相对路径。
        var result = Path.relative(builder.dest, relativeFile.dest).replace(/\\/g, '/');

        // 如果指定了静态文件路径则重定向到目标静态路径。
        var staticPath = rule.staticPath || builder.staticPath;
        if (staticPath) {
            result = Path.normalize(staticPath + "/" + result).replace(/\\/g, '/');
        }

        // 追加后缀。
        var urlPostfix = rule.urlPostfix || builder.urlPostfix;
        if (typeof urlPostfix === "function") {
            urlPostfix = urlPostfix(result, relativeFile);
        }
        if (urlPostfix) {
            urlPostfix = urlPostfix.replace(/\{(.*)\}/, function (all, tagName) {
                switch (tagName) {
                    case "date":
                        return new Date().format("yyyyMMdd");
                    case "time":
                        return new Date().format("yyyyMMddHHmmss");
                    case "md5":
                        return getMd5(relativeFile.buffer);
                }
                return all;
            });
            urlParts[2] = (urlParts[2] ? urlParts[2] + '&' : '?') + urlPostfix;
        }

        return result + urlParts[2];

    }

}

function getBase64Url(buffer, path, mimeTypes) {
    return 'data:' + getMimeType(mimeTypes, Path.extname(path)) + ';base64,' + buffer.toString('base64');
}

function getMimeType(mimeTypes, ext) {

    // 从用户定义处获取 mimeType。
    if (mimeTypes && ext in mimeTypes) {
        return mimeTypes[ext];
    }

    var serverConfigs = require('aspserver/configs');
    if (serverConfigs.mimeTypes && ext in serverConfigs.mimeTypes) {
        return serverConfigs.mimeTypes[ext];
    }

    return 'application/x-' + ext.slice(1);
};

function getMd5(content) {
    var Crypto = require('crypto');
    var md5sum = Crypto.createHash('md5');
    md5sum.update(content);
    return md5sum.digest('hex');
}

function request(url) {
    var SyncRequest = require('urllib-sync');
    var res = SyncRequest.request(url);
    return res.data;
}

function replaceUrl(file, builder, rule) {
    file.content = file.content.replace(/(['"])(.*)[?&]__url\1/gi, function (all, prefix, src) {
        var result = processDependency(builder, rule, file, src, false);
        return prefix + result + prefix;
    });
}

exports.html = function (file, builder) {

    var rule = this;

    // <!-- #include --> 内联


    // <style>: 以 CSS 处理
    file.content = file.content.replace(/(<style([^>]*?)>)([\s\S]*?)(<\/style[^>]*?>)/gi, function (all, prefix, html, content, postfix) {
        var type = getAttr(html, "type");
        if (!type || type === "text/css") {
            var targetFile = builder.process(file.src + "#inline.css", "#inline.css", content, true);
            return prefix + targetFile.content + postfix;
        }
        return all;
    });

    // <link>: 内联或更新地址
    file.content = file.content.replace(/<link[^>]*?>/gi, function (html) {
        var src = getAttr(html, "href");
        if (src) {
            var rel = getAttr(html, "rel");
            if (!rel || rel === "stylesheet") {
                var result = processDependency(builder, rule, file, src, true);
                if (result.inline) {
                    var type = getAttr(html, "type");
                    html = '<style' + (type ? ' type="' + type + '"' : '') + '>\r\n' + result.content + '\r\n</style>';
                } else {
                    html = setAttr(html, "href", result);
                }
            } else if (rel === "html") {
                var result = processDependency(builder, rule, file, src, true);
                html = result.inline ? result.content : setAttr(html, "href", result);
            }
        }
        return html;
    });

    // <script>: 以 JS 处理
    file.content = file.content.replace(/(<script([^>]*?)>)([\s\S]*?)(<\/script[^>]*?>)/gi, function (all, prefix, html, content, postfix) {
        var type = getAttr(html, "type");
        var src = getAttr(html, "src");
        if (src) {
            var result = processDependency(builder, rule, file, src, true);
            if (result.inline) {
                content = result.content;
                prefix = removeAttr(prefix, "src");
            } else {
                prefix = setAttr(prefix, "src", result);
            }
            return prefix + content + postfix;
        }

        if (!type || type === "text/javascript") {
            var targetFile = builder.process(file.src + "#inline.js", "#inline.js", content, true);
            return prefix + targetFile.content + postfix;
        }

        return all;
    });

    // <img>/<embed>/等: 处理 src
    file.content = file.content.replace(/<(img|embed|audio|video|link|object|source)[^>]*?>/gi, function (html, tagName) {
        var src = getAttr(html, 'src');
        if (src) {
            var result = processDependency(builder, rule, file, src, false);
            html = setAttr(html, "src", result);
        }
        return html;
    });

    replaceUrl(file, builder, rule);

};

exports.js = function (file, builder) {
    var rule = this;
    replaceUrl(file, builder, rule);
};

exports.css = function (file, builder) {
    var rule = this;

    //file.content = file.content.replace(/?__inline/, function() {

    //})

    replaceUrl(file, builder, rule);
};

///**
// * 解析 CSS 内的全部依赖。
// * @param {} context 
// * @param {} ruleSet 
// * @returns {} 
// */
//exports.inlineHTML = function (context, ruleSet) {
//    exports.replaceInclude(context, ruleSet, 3);
//    exports.replaceInline(context, ruleSet);
//};

///**
// * 解析 CSS 内的全部依赖。
// * @param {} context 
// * @param {} ruleSet 
// * @returns {} 
// */
//exports.inlineCSS = function (context, ruleSet) {
//    exports.replaceInclude(context, ruleSet, 2);
//    exports.replaceInline(context, ruleSet);
//};

///**
// * 解析 JS 内的全部依赖。
// * @param {} context 
// * @param {} ruleSet 
// * @returns {} 
// */
//exports.inlineJS = function (context, ruleSet) {
//    exports.replaceInclude(context, ruleSet, 1);
//    exports.replaceInline(context, ruleSet);
//};

///**
// * 解析模块内的 include。
// * @param {} context 
// * @param {} ruleSet 
// * @param {Number} type 0: 任意格式，1：JS，2:CSS，3：HTML
// * @returns {} 
// */
//exports.replaceInclude = function (context, ruleSet, type) {

//    function includeModule(fullPath, includedList) {

//        // 同一个文件不重复处理。
//        if (fullPath in includedList) {
//            return "";
//        }
//        includedList[fullPath] = true;

//        // 读取源码内容。
//        var context = ruleSet.process(fullPath);
//        if (!context) {
//            return "/* File Not Found: " + getFriendlyName(fullPath) + "*/";
//        }

//        // 解析排除项。
//        context.destContent.replace(/^\s*\/[\/\*]\s*#exclude\s+([^\r\n\*]+)/gm, function (all, requireUrl) {
//            requireUrl = Path.resolve(Path.dirname(fullPath), requireUrl);
//            var list = [];
//            parseModule(requireUrl, list);
//            includedList.push.apply(includedList, list);
//        });

//        // 解析依赖项。
//        return context.destContent.replace(/^\s*\/[\/\*]\s*#include\s+([^\r\n\*]+)/gm, function (all, requireUrl) {
//            requireUrl = Path.resolve(Path.dirname(fullPath), requireUrl);
//            return "/* " + getFriendlyName(requireUrl) + " */" + parseModule(requireUrl, includedList) + all;
//        });
//    }

//    function parseModule(fullPath, content, includedList) {

//        // 解析排除项。
//        content.replace(/^\s*\/[\/\*]\s*#exclude\s+([^\r\n\*]+)/gm, function (all, requireUrl) {
//            requireUrl = Path.resolve(Path.dirname(fullPath), requireUrl);
//            var list = [];
//            parseModule(requireUrl, list);
//            includedList.push.apply(includedList, list);
//        });

//        // 解析依赖项。
//        return context.destContent.replace(/^\s*\/[\/\*]\s*#include\s+([^\r\n\*]+)/gm, function (all, requireUrl) {
//            requireUrl = Path.resolve(Path.dirname(fullPath), requireUrl);
//            return "/* " + getFriendlyName(requireUrl) + " */" + parseModule(requireUrl, includedList) + all;
//        });
//    }

//    function getFriendlyName(fullPath) {
//        return Path.relative(ruleSet.src, fullPath).replace(/\\/g, "/");
//    }

//    context.content = parseModule(context.srcFullPath, []);

//};

///**
// * 解析模块内的 __inline 为 BASE64。
// * @param {} context 
// * @param {} ruleSet 
// * @returns {} 
// */
//exports.replaceInline = function (context, ruleSet) {
//    context.content = context.content.replace(/\?__inline\b/)
//};

//exports.getBase64Uri = function (path, ruleSet) {
//    var context = ruleSet.process(path);
//    if (!context) {
//        return null;
//    }


//};

//exports.inlineUrl = function (content) {
//    content = content.replace(/\?__inline/)
//};

////expand html
////[@require id] in comment to require resource
////<!--inline[path]--> to embed resource content
////<img|embed|audio|video|link|object ... (data-)?src="path"/> to locate resource
////<img|embed|audio|video|link|object ... (data-)?src="path?__inline"/> to embed resource content
////<script|style ... src="path"></script|style> to locate js|css resource
////<script|style ... src="path?__inline"></script|style> to embed js|css resource
////<script|style ...>...</script|style> to analyse as js|css
//function extHtml(content) {
//    var reg = /(<script(?:(?=\s)[\s\S]*?["'\s\w\/\-]>|>))([\s\S]*?)(?=<\/script\s*>|$)|(<style(?:(?=\s)[\s\S]*?["'\s\w\/\-]>|>))([\s\S]*?)(?=<\/style\s*>|$)|<(img|embed|audio|video|link|object|source)\s+[\s\S]*?["'\s\w\/\-](?:>|$)|<!--inline\[([^\]]+)\]-->|<!--(?!\[)([\s\S]*?)(-->|$)/ig;
//    return content.replace(reg, function (m, $1, $2, $3, $4, $5, $6, $7, $8) {
//        if ($1) {//<script>
//            var embed = '';
//            $1 = $1.replace(/(\s(?:data-)?src\s*=\s*)('[^']+'|"[^"]+"|[^\s\/>]+)/ig, function (m, prefix, value) {
//                if (isInline(fis.util.query(value))) {
//                    embed += map.embed.ld + value + map.embed.rd;
//                    return '';
//                } else {
//                    return prefix + map.uri.ld + value + map.uri.rd;
//                }
//            });
//            if (embed) {
//                //embed file
//                m = $1 + embed;
//            } else if (!/\s+type\s*=/i.test($1) || /\s+type\s*=\s*(['"]?)text\/javascript\1/i.test($1)) {
//                //without attrubite [type] or must be [text/javascript]
//                m = $1 + extJs($2);
//            } else {
//                //other type as html
//                m = $1 + extHtml($2);
//            }
//        } else if ($3) {//<style>
//            m = $3 + extCss($4);
//        } else if ($5) {//<img|embed|audio|video|link|object|source>
//            var tag = $5.toLowerCase();
//            if (tag === 'link') {
//                var inline = '', isCssLink = false, isImportLink = false;
//                var result = m.match(/\srel\s*=\s*('[^']+'|"[^"]+"|[^\s\/>]+)/i);
//                if (result && result[1]) {
//                    var rel = result[1].replace(/^['"]|['"]$/g, '').toLowerCase();
//                    isCssLink = rel === 'stylesheet';
//                    isImportLink = rel === 'import';
//                }
//                m = m.replace(/(\s(?:data-)?href\s*=\s*)('[^']+'|"[^"]+"|[^\s\/>]+)/ig, function (_, prefix, value) {
//                    if ((isCssLink || isImportLink) && isInline(fis.util.query(value))) {
//                        if (isCssLink) {
//                            inline += '<style' + m.substring(5).replace(/\/(?=>$)/, '').replace(/\s+(?:charset|href|data-href|hreflang|rel|rev|sizes|target)\s*=\s*(?:'[^']+'|"[^"]+"|[^\s\/>]+)/ig, '');
//                        }
//                        inline += map.embed.ld + value + map.embed.rd;
//                        if (isCssLink) {
//                            inline += '</style>';
//                        }
//                        return '';
//                    } else {
//                        return prefix + map.uri.ld + value + map.uri.rd;
//                    }
//                });
//                m = inline || m;
//            } else if (tag === 'object') {
//                m = m.replace(/(\sdata\s*=\s*)('[^']+'|"[^"]+"|[^\s\/>]+)/ig, function (m, prefix, value) {
//                    return prefix + map.uri.ld + value + map.uri.rd;
//                });
//            } else {
//                m = m.replace(/(\s(?:data-)?src\s*=\s*)('[^']+'|"[^"]+"|[^\s\/>]+)/ig, function (m, prefix, value) {
//                    var key = isInline(fis.util.query(value)) ? 'embed' : 'uri';
//                    return prefix + map[key]['ld'] + value + map[key]['rd'];
//                });
//                if (tag == 'img') {
//                    //<img src="image-src.png" srcset="image-1x.png 1x, image-2x.png 2x, image-3x.png 3x, image-4x.png 4x">
//                    //http://www.webkit.org/demos/srcset/
//                    m = m.replace(/(\ssrcset\s*=\s*)('[^']+'|"[^"]+"|[^\s\/>]+)/ig, function (m, prefix, value) {
//                        var info = fis.util.stringQuote(value);
//                        var set = info.rest.split(',');
//                        var imgset = [];
//                        set.forEach(function (item) {
//                            item = item.trim();
//                            var p = item.indexOf(' ');
//                            if (p == -1) {
//                                imgset.push(item);
//                                return;
//                            }
//                            imgset.push(map['uri']['ld'] + item.substr(0, p) + map['uri']['rd'] + item.substr(p));
//                        });
//                        return prefix + info.quote + imgset.join(', ') + info.quote;
//                    });
//                }
//            }
//        } else if ($6) {
//            m = map.embed.ld + $6 + map.embed.rd;
//        } else if ($7) {
//            m = '<!--' + analyseComment($7) + $8;
//        }
//        return m;
//    });
//}

//exports.inlineHTML = function (context, xfly) {




//    // 找到内联的 CSS 并处理。
//    var result = xfly.process('../a.css');
//    // result.destContent
//    // result.srcContent

//    return content;
//};


/////<link[^>]+href=(["']?)([^'"]*)\1[^>]*>/

/////*
//// * fis
//// * http://fis.baidu.com/
//// */

////'use strict';

////var CACHE_DIR;

////var exports = module.exports = function (file) {
////    if (!CACHE_DIR) {
////        fis.log.error('uninitialized compile cache directory.');
////    }
////    file = fis.file.wrap(file);
////    if (!file.realpath) {
////        error('unable to compile [' + file.subpath + ']: Invalid file realpath.');
////    }
////    fis.log.debug('compile [' + file.realpath + '] start');
////    fis.emitter.emit('compile:start', file);
////    if (file.isFile()) {
////        if (file.useCompile && file.ext && file.ext !== '.') {
////            var cache = file.cache = fis.cache(file.realpath, CACHE_DIR),
////                revertObj = {};
////            if (file.useCache && cache.revert(revertObj)) {
////                exports.settings.beforeCacheRevert(file);
////                file.requires = revertObj.info.requires;
////                file.extras = revertObj.info.extras;
////                if (file.isText()) {
////                    revertObj.content = revertObj.content.toString('utf8');
////                }
////                file.setContent(revertObj.content);
////                exports.settings.afterCacheRevert(file);
////            } else {
////                exports.settings.beforeCompile(file);
////                file.setContent(fis.util.read(file.realpath));
////                process(file);
////                exports.settings.afterCompile(file);
////                revertObj = {
////                    requires: file.requires,
////                    extras: file.extras
////                };
////                cache.save(file.getContent(), revertObj);
////            }
////        } else {
////            file.setContent(file.isText() ? fis.util.read(file.realpath) : fis.util.fs.readFileSync(file.realpath));
////        }
////    } else if (file.useCompile && file.ext && file.ext !== '.') {
////        process(file);
////    }
////    if (exports.settings.hash && file.useHash) {
////        file.getHash();
////    }
////    file.compiled = true;
////    fis.log.debug('compile [' + file.realpath + '] end');
////    fis.emitter.emit('compile:end', file);
////    embeddedUnlock(file);
////    return file;
////};

////exports.settings = {
////    unique: false,
////    debug: false,
////    optimize: false,
////    lint: false,
////    test: false,
////    hash: false,
////    domain: false,
////    beforeCacheRevert: function () { },
////    afterCacheRevert: function () { },
////    beforeCompile: function () { },
////    afterCompile: function () { }
////};

////exports.setup = function (opt) {
////    var settings = exports.settings;
////    if (opt) {
////        fis.util.map(settings, function (key) {
////            if (typeof opt[key] !== 'undefined') {
////                settings[key] = opt[key];
////            }
////        });
////    }
////    CACHE_DIR = 'compile/';
////    if (settings.unique) {
////        CACHE_DIR += Date.now() + '-' + Math.random();
////    } else {
////        CACHE_DIR += ''
////            + (settings.debug ? 'debug' : 'release')
////            + (settings.optimize ? '-optimize' : '')
////            + (settings.hash ? '-hash' : '')
////            + (settings.domain ? '-domain' : '');
////    }
////    return CACHE_DIR;
////};

////exports.clean = function (name) {
////    if (name) {
////        fis.cache.clean('compile/' + name);
////    } else if (CACHE_DIR) {
////        fis.cache.clean(CACHE_DIR);
////    } else {
////        fis.cache.clean('compile');
////    }
////};

////var map = exports.lang = (function () {
////    var keywords = ['require', 'embed', 'uri', 'dep', 'jsEmbed'],
////        LD = '<<<', RD = '>>>',
////        qLd = fis.util.escapeReg(LD),
////        qRd = fis.util.escapeReg(RD),
////        map = {
////            reg: new RegExp(
////                qLd + '(' + keywords.join('|') + '):([\\s\\S]+?)' + qRd,
////                'g'
////            )
////        };
////    keywords.forEach(function (key) {
////        map[key] = {};
////        map[key]['ld'] = LD + key + ':';
////        map[key]['rd'] = RD;
////    });
////    return map;
////})();

//////"abc?__inline" return true
//////"abc?__inlinee" return false
//////"abc?a=1&__inline"" return true
////function isInline(info) {
////    return /[?&]__inline(?:[=&'"]|$)/.test(info.query);
////}

//////analyse [@require id] syntax in comment
////function analyseComment(comment, callback) {
////    var reg = /(@require\s+)('[^']+'|"[^"]+"|[^\s;!@#%^&*()]+)/g;
////    callback = callback || function (m, prefix, value) {
////        return prefix + map.require.ld + value + map.require.rd;
////    };
////    return comment.replace(reg, callback);
////}

//////expand javascript
//////[@require id] in comment to require resource
//////__inline(path) to embedd resource content or base64 encodings
//////__uri(path) to locate resource
//////require(path) to require resource
////function extJs(content, callback) {
////    var reg = /"(?:[^\\"\r\n\f]|\\[\s\S])*"|'(?:[^\\'\n\r\f]|\\[\s\S])*'|(\/\/[^\r\n\f]+|\/\*[\s\S]*?(?:\*\/|$))|\b(__inline|__uri|require)\s*\(\s*("(?:[^\\"\r\n\f]|\\[\s\S])*"|'(?:[^\\'\n\r\f]|\\[\s\S])*')\s*\)/g;
////    callback = callback || function (m, comment, type, value) {
////        if (type) {
////            switch (type) {
////                case '__inline':
////                    m = map.jsEmbed.ld + value + map.jsEmbed.rd;
////                    break;
////                case '__uri':
////                    m = map.uri.ld + value + map.uri.rd;
////                    break;
////                case 'require':
////                    m = 'require(' + map.require.ld + value + map.require.rd + ')';
////                    break;
////            }
////        } else if (comment) {
////            m = analyseComment(comment);
////        }
////        return m;
////    };
////    return content.replace(reg, callback);
////}

////expand css
////[@require id] in comment to require resource
////[@import url(path?__inline)] to embed resource content
////url(path) to locate resource
////url(path?__inline) to embed resource content or base64 encodings
////src=path to locate resource
//function extCss(content, callback) {
//    var reg = /(\/\*[\s\S]*?(?:\*\/|$))|(?:@import\s+)?\burl\s*\(\s*("(?:[^\\"\r\n\f]|\\[\s\S])*"|'(?:[^\\'\n\r\f]|\\[\s\S])*'|[^)}\s]+)\s*\)(\s*;?)|\bsrc\s*=\s*("(?:[^\\"\r\n\f]|\\[\s\S])*"|'(?:[^\\'\n\r\f]|\\[\s\S])*'|[^\s}]+)/g;
//    callback = callback || function (m, comment, url, last, filter) {
//        if (url) {
//            var key = isInline(fis.util.query(url)) ? 'embed' : 'uri';
//            if (m.indexOf('@') === 0) {
//                if (key === 'embed') {
//                    m = map.embed.ld + url + map.embed.rd + last.replace(/;$/, '');
//                } else {
//                    m = '@import url(' + map.uri.ld + url + map.uri.rd + ')' + last;
//                }
//            } else {
//                m = 'url(' + map[key].ld + url + map[key].rd + ')' + last;
//            }
//        } else if (filter) {
//            m = 'src=' + map.uri.ld + filter + map.uri.rd;
//        } else if (comment) {
//            m = analyseComment(comment);
//        }
//        return m;
//    };
//    return content.replace(reg, callback);
//}

////function process(file) {
////    if (file.useParser !== false) {
////        pipe(file, 'parser', file.ext);
////    }
////    if (file.rExt) {
////        if (file.usePreprocessor !== false) {
////            pipe(file, 'preprocessor', file.rExt);
////        }
////        if (file.useStandard !== false) {
////            standard(file);
////        }
////        if (file.usePostprocessor !== false) {
////            pipe(file, 'postprocessor', file.rExt);
////        }
////        if (exports.settings.lint && file.useLint !== false) {
////            pipe(file, 'lint', file.rExt, true);
////        }
////        if (exports.settings.test && file.useTest !== false) {
////            pipe(file, 'test', file.rExt, true);
////        }
////        if (exports.settings.optimize && file.useOptimizer !== false) {
////            pipe(file, 'optimizer', file.rExt);
////        }
////    }
////}

////function pipe(file, type, ext, keep) {
////    var key = type + ext;
////    fis.util.pipe(key, function (processor, settings, key) {
////        settings.filename = file.realpath;
////        var content = file.getContent();
////        try {
////            fis.log.debug('pipe [' + key + '] start');
////            var result = processor(content, file, settings);
////            fis.log.debug('pipe [' + key + '] end');
////            if (keep) {
////                file.setContent(content);
////            } else if (typeof result === 'undefined') {
////                fis.log.warning('invalid content return of pipe [' + key + ']');
////            } else {
////                file.setContent(result);
////            }
////        } catch (e) {
////            //log error
////            fis.log.debug('pipe [' + key + '] fail');
////            var msg = key + ': ' + String(e.message || e.msg || e).trim() + ' [' + (e.filename || file.realpath);
////            if (e.hasOwnProperty('line')) {
////                msg += ':' + e.line;
////                if (e.hasOwnProperty('col')) {
////                    msg += ':' + e.col;
////                } else if (e.hasOwnProperty('column')) {
////                    msg += ':' + e.column;
////                }
////            }
////            msg += ']';
////            e.message = msg;
////            error(e);
////        }
////    });
////}

////var embeddedMap = {};

////function error(msg) {
////    //for watching, unable to exit
////    embeddedMap = {};
////    fis.log.error(msg);
////}

////function embeddedCheck(main, embedded) {
////    main = fis.file.wrap(main).realpath;
////    embedded = fis.file.wrap(embedded).realpath;
////    if (main === embedded) {
////        error('unable to embed file[' + main + '] into itself.');
////    } else if (embeddedMap[embedded]) {
////        var next = embeddedMap[embedded],
////            msg = [embedded];
////        while (next && next !== embedded) {
////            msg.push(next);
////            next = embeddedMap[next];
////        }
////        msg.push(embedded);
////        error('circular dependency on [' + msg.join('] -> [') + '].');
////    }
////    embeddedMap[embedded] = main;
////    return true;
////}

////function embeddedUnlock(file) {
////    delete embeddedMap[file.realpath];
////}

////function addDeps(a, b) {
////    if (a && a.cache && b) {
////        if (b.cache) {
////            a.cache.mergeDeps(b.cache);
////        }
////        a.cache.addDeps(b.realpath || b);
////    }
////}

////function standard(file) {
////    var path = file.realpath,
////        content = file.getContent();
////    if (typeof content === 'string') {
////        fis.log.debug('standard start');
////        //expand language ability
////        if (file.isHtmlLike) {
////            content = extHtml(content);
////        } else if (file.isJsLike) {
////            content = extJs(content);
////        } else if (file.isCssLike) {
////            content = extCss(content);
////        }
////        content = content.replace(map.reg, function (all, type, value) {
////            var ret = '', info;
////            try {
////                switch (type) {
////                    case 'require':
////                        info = fis.uri.getId(value, file.dirname);
////                        file.addRequire(info.id);
////                        ret = info.quote + info.id + info.quote;
////                        break;
////                    case 'uri':
////                        info = fis.uri(value, file.dirname);
////                        if (info.file && info.file.isFile()) {
////                            if (info.file.useHash && exports.settings.hash) {
////                                if (embeddedCheck(file, info.file)) {
////                                    exports(info.file);
////                                    addDeps(file, info.file);
////                                }
////                            }
////                            var query = (info.file.query && info.query) ? '&' + info.query.substring(1) : info.query;
////                            var url = info.file.getUrl(exports.settings.hash, exports.settings.domain);
////                            var hash = info.hash || info.file.hash;
////                            ret = info.quote + url + query + hash + info.quote;
////                        } else {
////                            ret = value;
////                        }
////                        break;
////                    case 'dep':
////                        if (file.cache) {
////                            info = fis.uri(value, file.dirname);
////                            addDeps(file, info.file);
////                        } else {
////                            fis.log.warning('unable to add deps to file [' + path + ']');
////                        }
////                        break;
////                    case 'embed':
////                    case 'jsEmbed':
////                        info = fis.uri(value, file.dirname);
////                        var f;
////                        if (info.file) {
////                            f = info.file;
////                        } else if (fis.util.isAbsolute(info.rest)) {
////                            f = fis.file(info.rest);
////                        }
////                        if (f && f.isFile()) {
////                            if (embeddedCheck(file, f)) {
////                                exports(f);
////                                addDeps(file, f);
////                                f.requires.forEach(function (id) {
////                                    file.addRequire(id);
////                                });
////                                if (f.isText()) {
////                                    ret = f.getContent();
////                                    if (type === 'jsEmbed' && !f.isJsLike && !f.isJsonLike) {
////                                        ret = JSON.stringify(ret);
////                                    }
////                                } else {
////                                    ret = info.quote + f.getBase64() + info.quote;
////                                }
////                            }
////                        } else {
////                            fis.log.error('unable to embed non-existent file [' + value + ']');
////                        }
////                        break;
////                    default:
////                        fis.log.error('unsupported fis language tag [' + type + ']');
////                }
////            } catch (e) {
////                embeddedMap = {};
////                e.message = e.message + ' in [' + file.subpath + ']';
////                throw e;
////            }
////            return ret;
////        });
////        file.setContent(content);
////        fis.log.debug('standard end');
////    }
////}

////exports.extJs = extJs;
////exports.extCss = extCss;
////exports.extHtml = extHtml;
////exports.isInline = isInline;
////exports.analyseComment = analyseComment;
