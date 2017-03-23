/**
 * @file HTML 模块
 * @author xuld <xuld@vip.qq.com>
 */
import * as digo from "digo";
import { Packer } from "./packer";
import { Module } from "./module";
import { TextModule, TextModuleOptions } from "./text";

/**
 * 表示一个 HTML 模块。
 */
export class HtmlModule extends TextModule {

    /**
     * 获取当前模块的解析选项。
     */
    options: HtmlModuleOptions;

    /**
     * 初始化一个新的模块。
     * @param packer 当前模块所属的打包器。
     * @param file 当前模块的源文件。
     * @param options 当前模块的选项。
     */
    constructor(packer: Packer, file: digo.File, options?: TextModuleOptions) {
        super(packer, file, options);
    }

    /**
     * 当被子类重写时负责解析当前模块。
     */
    parse() {
        this.file.content.replace(/<!--([\s\S]*?)(?:-->|$)|<!\[CDATA\[([\s\S*]*?)(?:\]\]>|$)|<%([\s\S*]*?)(?:%>|$)|<\?([\s\S*]*?)(?:\?>|$)|(<script\b(?:'[^']*'|"[^"]*"|[^>])*>)([\s\S]*?)(?:<\/script(?:'[^']*'|"[^"]*"|[^>])*>|$)|(<style\b(?:'[^']*'|"[^"]*"|[^>])*>)([\s\S]*?)(?:<\/style(?:'[^']*'|"[^"]*"|[^>])*>|$)|<([^\s'"]+)\b(?:'[^']*'|"[^"]*"|[^>])*>/ig, (matchSource: string, comment: string | undefined, cdata: string | undefined, asp: string | undefined, php: string | undefined, openScript: string | undefined, script: string | undefined, openStyle: string | undefined, style: string | undefined, tag: string | undefined, matchIndex: number) => {

            // <img>, <link>, ...
            if (tag != undefined) {
                this.parseTag(matchSource, matchIndex, tag.toLowerCase());
                return "";
            }

            // <!-- -->
            if (comment != undefined) {
                this.parseComment(matchSource, matchIndex, comment, matchIndex + "<!--".length);
                return "";
            }

            // <script>
            if (openScript != undefined) {
                this.parseTag(openScript, matchIndex, "script", script, matchIndex + openScript.length);
                return "";
            }

            // <style>
            if (openStyle != undefined) {
                this.parseTag(openStyle, matchIndex, "style", style, matchIndex + openStyle.length);
                return "";
            }

            return "";
        });
    }

    /**
     * 解析一个 `<tag ...>` 片段。
     * @param source 要解析的 `<tag ...>` 片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param tagName 解析的标签名。
     * @param innerHTML 标签的内容部分。仅当标签为 "script" 或 "style" 时存在。
     * @param innerHTMLIndex *innerHTML* 在源文件的起始位置。
     */
    protected parseTag(source: string, sourceIndex: number, tagName: string, innerHTML?: string, innerHTMLIndex?: number) {

        // 允许通过配置禁用部分标签的解析。
        if (!this.canParseTag(tagName)) {
            return;
        }

        // 解析属性。
        let skipInnerHTML: boolean | undefined;
        let langAttr: { source: string; sourceIndex: number; value: string; ext: string } | undefined;
        const serverCode = this.options.serverCode || /<[%\?]|[%\?]>|@\(/;
        source.replace(/\s*([^\s='"]+)\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]*)/g, (matchSource: string, attrName: string, attrString: string, doubleString: string | undefined, singleString: string | undefined, matchIndex: number) => {

            // 如果值含模板代码则不解析。
            if (serverCode.test(attrString)) {
                return "";
            }

            // 判断解析当前属性的配置。
            const attrType = this.attrType(source, sourceIndex, tagName, attrName.toLowerCase());
            if (!attrType) {
                return "";
            }

            // 移除引号位置。
            const attrValue = doubleString != undefined ? doubleString : singleString != undefined ? singleString : attrString;
            const attrValueIndex = sourceIndex + matchIndex + matchSource.length - attrString.length + (attrValue.length === attrString.length ? 0 : 1);
            const value = this.decodeHTML(attrValue);

            // 处理属性。
            switch (attrType) {
                case "url":
                    this.parseUrl(attrValue, attrValueIndex, value, "html.tag", url => this.formatAttrValue(url, attrString));
                    break;
                case "script":
                    this.parseContent(attrValue, attrValueIndex, value, ".js", content => this.formatAttrValue(content, attrString));
                    break;
                case "style":
                    this.parseContent(attrValue, attrValueIndex, value, ".css", content => this.formatAttrValue(content, attrString));
                    break;
                case "script-url":
                    skipInnerHTML = true;
                    this.parseUrl(attrValue, attrValueIndex, value, "html.tag", url => this.formatAttrValue(url, attrString), urlInfo => {
                        // 删除 "lang=..."
                        if (langAttr && langAttr.value !== "text/javascript" && /\.js$/i.test(urlInfo.module!.destPath!)) {
                            this.addChange(langAttr.source, langAttr.sourceIndex, "");
                        }
                        // 删除 "src=..."
                        this.addChange(matchSource, sourceIndex + matchIndex, "");
                        // ">" => ">..."
                        this.addChange("", sourceIndex + source.length, savePath => urlInfo.module!.getContent(savePath));
                    });
                    break;
                case "style-url":
                    skipInnerHTML = true;
                    this.parseUrl(attrValue, attrValueIndex, value, "html.tag", url => this.formatAttrValue(url, attrString), urlInfo => {
                        // 删除 "lang=..."
                        if (langAttr && langAttr.value !== "text/css" && /\.css$/i.test(urlInfo.module!.destPath!)) {
                            this.addChange(langAttr.source, langAttr.sourceIndex, "");
                        }
                        if (tagName === "link") {
                            const rel = this.getAttr(source, sourceIndex, "rel");
                            if (rel && rel.value === "stylesheet") {
                                // "<link" => "<style"
                                this.addChange(tagName, sourceIndex + "<".length, "style");
                                // 删除 "rel=..."
                                this.addChange(rel.source, rel.sourceIndex, "");
                                // 删除 "href=..."
                                this.addChange(matchSource, sourceIndex + matchIndex, "");
                                // "/>" => ">...</style>"
                                const end = /\s*\/?>$/.exec(source)!;
                                this.addChange(end[0], sourceIndex + end.index, savePath => ">" + urlInfo.module!.getContent(savePath) + "</style>");
                            } else {
                                this.addChange(attrValue, attrValueIndex, savePath => this.formatAttrValue(urlInfo.module!.getBase64Uri(savePath), attrString));
                            }
                        } else {
                            // 删除 "href=..."
                            this.addChange(matchSource, sourceIndex + matchIndex, "");
                            // ">" => ">..."
                            this.addChange("", sourceIndex + source.length, savePath => urlInfo.module!.getContent(savePath));
                        }
                    });
                    break;
                case "lang":
                    langAttr = {
                        source: matchSource,
                        sourceIndex: sourceIndex + matchIndex,
                        value: value,
                        ext: this.getExtOfLang(value)
                    };
                    break;
                case "urlset":
                    // http://www.webkit.org/demos/srcset/
                    // <img src="image-src.png" srcset="image-1x.png 1x, image-2x.png 2x, image-3x.png 3x, image-4x.png 4x">
                    attrValue.replace(/((?:^|,)\s*)(.*?)\s+\dx/g, (matchSource: string, prefix: string, url: string, matchIndex: number) => {
                        this.parseUrl(url, attrValueIndex + matchIndex + prefix.length, this.decodeHTML(url), "html.tag", url => this.formatAttrValue(url, attrString));
                        return "";
                    });
                    break;
            }
            return "";
        });

        // 解析内联内容。
        if (innerHTML != undefined && !skipInnerHTML && this.attrType(source, sourceIndex, tagName, "innerHTML")) {
            this.parseContent(innerHTML, innerHTMLIndex!, innerHTML, langAttr ? langAttr.ext : this.getExtOfLang(tagName), content => content.replace(/<\/(script|style)>/g, "<\\u002f$1>"), module => {
                if (langAttr && langAttr.value !== (tagName === "style" ? "text/css" : "text/javascript") && (tagName === "style" ? /\.js$/i : /\.css$/i).test(module.destPath!)) {
                    // 删除 "lang=..."
                    this.addChange(langAttr.source, langAttr.sourceIndex, "");
                }
            });
        }

    }

    /**
     * 判断是否允许解析指定的标签。
     * @param file 要解析的源文件。
     * @param options 解析的选项。
     * @param tagName 要解析的标签名。
     * @return 如果允许则返回 true，否则返回 false。
     */
    protected canParseTag(tagName: string) {
        const tagsOption = this.options.tags;
        if (tagsOption === false) {
            return false;
        }
        if (typeof tagsOption === "object" && (tagsOption[tagName] === false || tagsOption["*"] === false)) {
            return false;
        }
        return true;
    }

    /**
     * 判断指定的属性的解析方式。
     * @param file 要解析的源文件。
     * @param options 解析的选项。
     * @param source 相关的代码片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param tagName 要解析的标签名。
     * @param attrName 要解析的属性名。
     * @return 返回解析类型。
     */
    protected attrType(source: string, sourceIndex: number, tagName: string, attrName: string) {
        let result: AttrType;
        const tagsOption = this.options.tags;
        if (typeof tagsOption === "object") {
            if (typeof tagsOption[tagName] === "object") {
                result = tagsOption[tagName][attrName];
            }
            if (result == undefined && typeof tagsOption["*"] === "object") {
                result = tagsOption["*"][attrName];
            }
        } else if (typeof tagsOption === "function") {
            result = tagsOption(tagName, attrName, source, sourceIndex, this);
        }
        if (result == undefined || result === true) {
            result = defaultTags[tagName] && defaultTags[tagName][attrName] || defaultTags["*"][attrName];
        }
        return result;
    }

    /**
     * 获取指定语言的扩展名。
     * @param file 要解析的源文件。
     * @param options 解析的选项。
     * @param lang 要获取的语言名或 MIME 类型或标签名。
     * @return 返回扩展名。
     */
    protected getExtOfLang(lang: string) {
        return this.options.langs && this.options.langs[lang] || defaultLangs[lang] || this.packer.getExtByMimeType(lang) || lang.replace(/\^.*\//, "");
    }

    /**
     * 获取指定属性的信息。
     * @param openTag 相关的代码片段。
     * @param openTagIndex *openTag* 在源文件的起始位置。
     * @param attrName 要解析的属性名。
     */
    protected getAttr(openTag: string, openTagIndex: number, attrName: string) {
        const match = new RegExp("(\\s" + attrName + ')(?:(\\s*=\\s*)("([^"]*)"|\'([^\']*)\'|[^\\s>]*))?', "i").exec(openTag);
        if (match) {
            return {
                source: match[0],
                sourceIndex: openTagIndex + match.index,
                value: this.decodeHTML(match[4] != undefined ? match[4] : match[5] != undefined ? match[5] : match[3])
            };
        }
    }

    /**
     * 解码 HTML 特殊字符。
     * @param value 要解码的字符串。
     * @return 返回已解码的字符串。
     * @example decodeHTML("<a></a>") // "&lt;a&gt;&lt;/a&gt;"
     */
    protected decodeHTML(value: string) {
        return value.replace(/&(#(\d{1,4})|amp|lt|gt|quot);/g, (_, word: string, unicode: string) => unicode ? String.fromCharCode(+unicode) : {
            amp: "&",
            lt: "<",
            gt: ">",
            quot: '\"'
        }[word]);
    }

    /**
     * 生成属性值字符串。
     * @param value 相关的属性值。
     * @param quote 优先使用的引号。
     * @return 返回已格式化的属性字符串。
     */
    protected formatAttrValue(value: string, quote: string) {
        switch (quote.charCodeAt(0)) {
            case 34/*"*/:
                return value.replace(/"/g, "&quot;");
            case 39/*'*/:
                return value.replace(/'/g, "&#39;");
            default:
                return /[>\s="']/.test(value) ? '"' + this.formatAttrValue(value, '"') + '"' : value;
        }
    }

    /**
     * 当被子类重写时负责将当前模块的内容写入到指定的写入器。
     * @param writer 要写入的目标写入器。
     * @param savePath 要保存的目标路径。
     * @param modules 依赖的所有模块。
     * @param extracts 导出的所有文件。
     */
    write(writer: digo.Writer, savePath: string, modules: Module[], extracts: digo.File[]) {
        super.writeModule(writer, this, savePath, modules, extracts);
    }

}

/**
 * 表示解析 HTML 模块的选项。
 */
export interface HtmlModuleOptions extends TextModuleOptions {

    /**
     * 设置 HTML 标签的解析方式。
     * @example
     * #### 不解析所有标签
     * ```json
     * {
     *      tags: false
     * }
     * ```
     * #### 不解析特定标签
     * ```json
     * {
     *      tags: {
     *          "img": false,
     *          "canvas": false
     *      }
     * }
     * ```
     * #### 分别设置每个属性的解析方式
     * ```json
     * { 
     *      tags: {
     *          "img": {
     *              "src": false        // 不解析 <img src>
     *              "onpaint": "script" // 将 <img onpaint> 解析为内联的脚本
     *              "theme": "style"    // 将 <img theme> 解析为内联的样式
     *              "href": "url"       // 将 <img href> 解析为内联的地址
     *          },
     *          "*": {                  // * 将对所有节点生效
     *              "style": false
     *          }
     *      } 
     * }
     * ```
     * #### 自定义函数
     * ```json
     * { 
     *      tags: function (tagName, attrName, openTag, openTagIndex, module) {
     *          return "url";
     *      }
     * }
     * ```
     */
    tags?: boolean | { [tagName: string]: boolean | { [attrName: string]: AttrType } } | ((tagName: string, attrName: string, openTag: string, openTagIndex: number, module: Module) => AttrType);

    /**
     * 设置各语言的映射扩展名。
     */
    langs?: { [type: string]: string };

    /**
     * 测试是否包含服务端代码的正则表达式。
     */
    serverCode?: RegExp,

}

/**
 * 表示属性的解析方式。
 */
export type AttrType = void | boolean | "url" | "urlset" | "style" | "script" | "lang" | "script-url" | "style-url";

const defaultTags = {
    "*": {
        "src": "url",
        "data-src": "url",
        "href": "url",
        "style": "style",
        "onabort": "script",
        "onafterprint": "script",
        "onbeforeprint": "script",
        "onbeforeunload": "script",
        "onblur": "script",
        "oncanplay": "script",
        "oncanplaythrough": "script",
        "onchange": "script",
        "onclick": "script",
        "oncompassneedscalibration": "script",
        "oncontextmenu": "script",
        "ondblclick": "script",
        "ondevicelight": "script",
        "ondevicemotion": "script",
        "ondeviceorientation": "script",
        "ondrag": "script",
        "ondragend": "script",
        "ondragenter": "script",
        "ondragleave": "script",
        "ondragover": "script",
        "ondragstart": "script",
        "ondrop": "script",
        "ondurationchange": "script",
        "onemptied": "script",
        "onended": "script",
        "onerror": "script",
        "onfocus": "script",
        "onhashchange": "script",
        "oninput": "script",
        "oninvalid": "script",
        "onkeydown": "script",
        "onkeypress": "script",
        "onkeyup": "script",
        "onload": "script",
        "onloadeddata": "script",
        "onloadedmetadata": "script",
        "onloadstart": "script",
        "onmessage": "script",
        "onmousedown": "script",
        "onmouseenter": "script",
        "onmouseleave": "script",
        "onmousemove": "script",
        "onmouseout": "script",
        "onmouseover": "script",
        "onmouseup": "script",
        "onmousewheel": "script",
        "onmsgesturechange": "script",
        "onmsgesturedoubletap": "script",
        "onmsgestureend": "script",
        "onmsgesturehold": "script",
        "onmsgesturestart": "script",
        "onmsgesturetap": "script",
        "onmsinertiastart": "script",
        "onmspointercancel": "script",
        "onmspointerdown": "script",
        "onmspointerenter": "script",
        "onmspointerleave": "script",
        "onmspointermove": "script",
        "onmspointerout": "script",
        "onmspointerover": "script",
        "onmspointerup": "script",
        "onoffline": "script",
        "ononline": "script",
        "onorientationchange": "script",
        "onpagehide": "script",
        "onpageshow": "script",
        "onpause": "script",
        "onplay": "script",
        "onplaying": "script",
        "onpopstate": "script",
        "onprogress": "script",
        "onratechange": "script",
        "onreadystatechange": "script",
        "onreset": "script",
        "onresize": "script",
        "onscroll": "script",
        "onseeked": "script",
        "onseeking": "script",
        "onselect": "script",
        "onstalled": "script",
        "onstorage": "script",
        "onsubmit": "script",
        "onsuspend": "script",
        "ontimeupdate": "script",
        "ontouchcancel": "script",
        "ontouchend": "script",
        "ontouchmove": "script",
        "ontouchstart": "script",
        "onunload": "script",
        "onvolumechange": "script",
        "onwaiting": "script"
    },
    "script": {
        "innerHTML": "script",
        "src": "script-url",
        "type": "lang",
        "lang": "lang",
        "language": "lang"
    },
    "link": {
        "href": "style-url",
        "type": "lang",
        "lang": "lang",
        "language": "lang"
    },
    "style": {
        "innerHTML": "style",
        "src": "style-url",
        "type": "lang",
        "lang": "lang",
        "language": "lang"
    },
    "img": {
        "srcset": "urlset",
    },
    "form": {
        "action": "url",
    },
    "input": {
        "formaction": "url",
    },
    "button": {
        "formaction": "url",
    },
    "object": {
        "data": "url",
    },
};

const defaultLangs = {
    "script": ".js",
    "style": ".css",
    "template": ".inc",
    "text/javascript": ".js",
    "text/style": ".css",
    "text/plain": ".txt",
    "text/template": ".inc"
};
