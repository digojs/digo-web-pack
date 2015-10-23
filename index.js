
var Path = require('path');
var Lang = require('tealweb/lang');

exports = module.exports = function (file, options, builder) {
	var ext = Path.extname(file.path);
	return exports[ext === ".htm" || ext === ".html" ? "html" : ext === "js" ? "js" : ext === "css" ? "css" : "text"](file, options, builder);
};

/**
 * 处理 HTML 文件里的外部资源引用：尝试重定向地址或内联。
 * @param {} file 
 * @param {} options 
 * * @property {String} protocal 在页面中 // 表示的协议。如 https:
 * * @property {Object} mimeTypes 内联 base64 地址时使用的 MIME 类型。
 * * @property {String} virtualPath 在页面中跟路径 / 表示的路径。默认为项目跟路径。
 * * @property {String} staticUrl 路径中转换的基础地址。如 http://cdn.com/
 * * @property {String} staticPath 路径中转换的基础路径。如 assets/
 * * @property {String} urlPostfix 路径中追加的后缀。如 _=<md5>
 * @param {} builder 
 * @returns {} 
 */
exports.html = function (file, options, builder) {
	return formatProcessed(file._assetsProcessed = processHtml(file, options, builder), file);
};

exports.js = function (file, options, builder) {
	return formatProcessed(file._assetsProcessed = processJs(file, options, builder), file);
};

exports.css = function (file, options, builder) {
	return formatProcessed(file._assetsProcessed = processCss(file, options, builder), file);
};

exports.text = function (file, options, builder) {
	return formatProcessed(file._assetsProcessed = processUrl(file.content, file, options, builder), file);
};

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
	console.assert(typeof str === "string", "encodeHTMLAttribute(str: 必须是字符串)");
	return str.replace(/[\'\"]/g, function (v) {
		return ({
			'\'': '&#39;',
			'\"': '&quot;'
		})[v];
	});
}

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

function getExtByMimeType(mimeTypes, mimeType) {
    
    for (var ext in mimeTypes) {
        if (mimeTypes[ext] === mimeType) {
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
};

function parseUrl(url) {
	var result = /^(.*)([\?&].*)$/.exec(url);
	return result ? { path: result[1], query: result[2] } : { path: url, query: '' };
}

/**
 * 处理指定文件的依赖文件。
 * @param {BuildFile} baseFile 当前正在处理的文件。
 * @param {String} relativeUrl 要处理的相对路径。
 * @param {Object} options 相关配置。
 * @param {Builder} builder 当前构建器。
 * @param {Boolean} [returnContentIfInline=false] 如果内联时，@true 表示返回内容，@false 表示返回 base64 编码。
 * @return {String|Object} 返回文件新地址，或者返回文件信息。
 */
function processDependency(baseFile, relativeUrl, options, builder, returnContentIfInline, forceInline) {
	
	// 路径可能有：
	//	http://domain.com/foo.txt
	//  //domain.com/foo.txt
	//  /foo.txt
	//  foo.txt
	var url = relativeUrl;
	// //domain.com/foo.txt -> http://domain.com/foo.txt
	if (/^\/\//.test(url)) {
		url = (options.protocal || "http:") + url;
	}
	
	var isInline = forceInline || /\b__inline\b/.test(url);
	var urlParts = parseUrl(url);
	
	// 绝对路径。
	if (url.indexOf(':') >= 0) {
		
		// 仅支持 http(s) 协议地址内联。
		if (isInline && /^https?:/i.test(url)) {
            var buffer = request(url);

            var limit = +(/\b__inline\s*=\s*(\d+)/.exec(url) || 0)[1];
            if (!limit || buffer.length < limit) {
                return returnContentIfInline ? {
                    inline: true,
                    content: buffer.toString(builder.encoding)
                } : getBase64Url(buffer, urlParts.path, options.mimeTypes);
            }
			
		}
		
		// 不内联的绝对路径不处理。
		return relativeUrl;

	}
	
	// 获取依赖的文件路径。
	var relativeFilePath = baseFile.resolvePath(urlParts.path);
	
	// 解析相对文件。
	// 注意：可能出现递归调用的问题。
	var relativeFile = builder.processDependency(baseFile, relativeFilePath);
	if (relativeFile.notFound) {
		return relativeUrl;
	}
	
	// 测试是否有循环的引用。
	if (relativeFile.hasDependency(baseFile)) {
	    builder.error('{0}: Circular References with {1}', baseFile.srcPath, relativeFile.srcPath);
	}
	
	// 内联。
    if (isInline) {
        var limit = +(/\b__inline\s*=\s*(\d+)/.exec(url) || 0)[1];
        if (!limit || buffer.length < limit) {
            return returnContentIfInline ? {
                inline: true,
                // 优先获取匹配的模板，以方便二次重定向之后更换位置。
                content: relativeFile._assetsProcessed || relativeFile.content
            } : getBase64Url(relativeFile.buffer, relativeFile.destPath, options.mimeTypes);
        }
    }
	
	var newRelativeUrl;
	
	// 如果指定了静态文件路径则重定向到目标静态路径。
	if (options.staticUrl != null) {
		
		// 获取 CDN 上传跟目录。
		var staticPath = builder.getFullPath(options.staticPath);
		
		// 计算目标文件在 CDN 的路径。
		newRelativeUrl = Path.relative(staticPath, relativeFile.destFullPath);
		
		// 如果当前路径在 CDN 外，则不采用 CDN 地址。
		newRelativeUrl = /^\.\./.test(newRelativeUrl) ? '<<<path:///' + relativeFile.destPath + '>>>' : Path.join(options.staticUrl, newRelativeUrl).replace(/\\/g, '/');

	} else {
		newRelativeUrl = '<<<path:///' + relativeFile.destPath + '>>>';
	}
	
	// 追加后缀。
	var urlPostfix = options.urlPostfix;
	if (typeof urlPostfix === "function") {
		urlPostfix = urlPostfix(relativeFile);
	}
	if (urlPostfix) {
		urlPostfix = urlPostfix.replace(/<(.*)>/, function (all, tagName) {
			switch (tagName) {
				case "date":
					return new Date().format("yyyyMMdd");
				case "time":
					return new Date().format("yyyyMMddHHmmss");
				case "md5":
					return getMd5(relativeFile.buffer);
                case "md5h":
                    return getMd5(relativeFile.buffer).substr(0, 16);
                case "md5s":
                    return getMd5(file.buffer).substr(0, 6);
			}
			return all;
		});
		urlParts.query = (urlParts.query ? urlParts.query + '&' : '?') + urlPostfix;
	}
	
	return newRelativeUrl + urlParts.query;

}

function processUrl(content, file, options, builder) {
	return content.replace(/([^\s'",=\(\[\{\)\]\}]*)[?&]__url/g, function (all, url) {
		return processDependency(file, url, options, builder);
	});
}

/**
 * 将 CSS 文件中的路径部分转为项目路径。如 <<<path:///a.txt>>>
 * @param {} file 
 * @param {} options 
 * @param {} builder 
 * @returns {} 
 */
function processCss(file, options, builder) {
	
	// @import url(): 内联或重定向。
	return processUrl(file.content.replace(/((@import\s+)?url\(\s*(['"]?))(.*?)(\3\s*\))/, function (all, prefix, atImport, q, url, postfix) {
		
		// 内联 CSS。
		if (atImport) {
			var result = processDependency(file, url, options, builder, true);
			return result.inline ? result.content : prefix + result + postfix;
		}
		
		// 否则是图片等外部资源。
		return prefix + processDependency(file, url, options, builder) + postfix;
		
	}), file, options, builder);
}

/**
 * 将 JS 文件中的路径部分转为项目路径。如 <<<path:///a.txt>>>
 * @param {} file 
 * @param {} options 
 * @param {} builder 
 * @returns {} 
 */
function processJs(file, options, builder) {
	return processUrl(file.content, file, options, builder);
}

function processInlined(baseFile, content, ext, builder) {
	var result = builder.processDependency(baseFile, baseFile.srcPath + "#inline" + ext, content);
	return result._assetsProcessed || result.content;
}

/**
 * 将 HTML 文件中的路径部分转为项目路径。如 <<<path:///a.txt>>>
 * @param {} file 
 * @param {} options 
 * @param {} builder 
 * @returns {} 
 */
function processHtml(file, options, builder) {
	
	// <style>, <script>: 以 CSS, JS 处理
	return processUrl(file.content.replace(/(<s(tyle|cript)([^>]*?)>)([\s\S]*?)(<\/s\2[^>]*?>)/gi, function (all, prefix, styleOrScript, tags, content, postfix) {
		
		// content 的意义根据 type 决定。
		var type = getAttr(tags, "type");
		
		// <style>
		if (styleOrScript.length < 5) {
			content = processInlined(file, content, type && type !== "text/css" ? getExtByMimeType(options.mimeTypes, type) : '.css' , builder);
		} else {
			// <script src>
			var src = getAttr(tags, "src");
			if (src) {
				var result = processDependency(file, src, options, builder, true);
				if (result.inline) {
					content = result.content;
					prefix = removeAttr(prefix, "src");
				} else {
					prefix = setAttr(prefix, "src", result);
				}
			// <script>
			} else {
				content = processInlined(file, content, type && type !== "text/javascript" ?  getExtByMimeType(options.mimeTypes, type) : '.js', builder);
			}
		}
		
		all = prefix + content + postfix;
		
		// <... __dest="">
		var outerSrc = getAttr(tags, "__dest");
		if (outerSrc && !/:|^\/\//.test(outerSrc)) {
			
			// 拆分路径的 ? 后的部分。
			var urlParts = parseUrl(outerSrc);
			
			// 添加为文件并替换为路径。
			var src = "<<<path:///" + builder.addFile(file.resolvePath(urlParts.path), content).destPath + ">>>" + urlParts.query;
			
			all = removeAttr(styleOrScript.length < 5 ?
				setAttr(setAttr('<link' + prefix.substr('<style'.length), 'rel', 'stylesheet'), 'href', src):
				setAttr(prefix, 'src', src), "__dest");
		}
		
		return all;
	
	// <link>: 内联或更新地址
	}).replace(/<(link|img|embed|audio|video|link|object|source)[^>]*?>/gi, function (tags, tagName) {
		
		// <link>
		if (/^link$/i.test(tagName)) {
			var src = getAttr(tags, "href");
			if (src) {
				var rel = getAttr(tags, "rel");
				if (!rel || rel === "stylesheet") {
					var result = processDependency(file, src, options, builder, true);
					if (result.inline) {
						var type = getAttr(tags, "type");
						tags = removeAttr(removeAttr('<style' + tags.substr("<link".length), "rel"), "href") + '\r\n' + result.content + '\r\n</style>';
					} else {
						tags = setAttr(tags, "href", result);
					}
				} else if (rel === "html") {
					var result = processDependency(file, src, options, builder, true);
					tags = result.inline ? result.content : setAttr(tags, "href", result);
				} else {
					tags = setAttr(tags, "href", processDependency(file, src, options, builder));
				}
			}
		} else {
			// <... src>
			var src = getAttr(tags, 'src');
			if (src) {
				tags = setAttr(tags, "src", processDependency(file, src, options, builder));
			}
		}
		
		return tags;
	
	// <!-- #include --> 内联
	}), file, options, builder).replace(/<!--\s*#include(.*?)\s*-->/g, function (all, url) {
		
		// 处理 <!-- #include virtual="p" --> -> <!-- #include p -->
		// 处理 <!-- #include "p" --> -> <!-- #include p -->
		url = url.replace(/^.*?['"]/, '').replace(/['"].*$/, '');
		
		// 以 HTML 方式解析内部依赖项。
		return processDependency(file, url, options, builder, true, true).content;
	
	});
	
}

function formatProcessed(processedText, file) {
	return processedText.replace(/<<<path:\/\/\/(.*?)>>>/g, function (all, fullPath) {
		return file.relativePath(fullPath);
	});
}
