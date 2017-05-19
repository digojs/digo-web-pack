import * as digo from "digo";
import { Packer } from "./packer";
import { Module } from "./module";
import { TextModule, TextModuleOptions, UrlInfo } from "./text";

/**
 * 表示一个 CSS 模块。
 */
export class CssModule extends TextModule {

    /**
     * 获取当前模块的解析选项。
     */
    options: CssModuleOptions;

    /**
     * 当被子类重写时负责返回当前模块的类型。
     */
    get type() { return "css"; }

    /**
     * 初始化一个新的模块。
     * @param packer 当前模块所属的打包器。
     * @param file 当前模块的源文件。
     * @param options 当前模块的选项。
     */
    constructor(packer: Packer, file: digo.File, options?: CssModuleOptions) {
        super(packer, file, options);
    }

    /**
     * 当被子类重写时负责解析当前模块。
     */
    parse() {
        this.file.content.replace(/\/\*([\s\S]*?)(?:\*\/|$)|((?:@import\s+url|\burl)\s*\(\s*)("((?:[^\\"\n\r]|\\[\s\S])*)"|'((?:[^\\'\n\r]|\\[\s\S])*)'|[^\)\n\r]*)\s*\)\s*(?:;\s*(?:\r\n?|\n)?)?/g, (matchSource: string, comment: string | undefined, urlPrefix: string | undefined, urlArg: string | undefined, urlArgDouble: string | undefined, urlArgSingle: string | undefined, matchIndex: number) => {

            // /* ... */
            if (comment != undefined) {
                this.parseComment(matchSource, matchIndex, comment, matchIndex + "/*".length);
                return "";
            }

            // @import url(...);, url(...)
            if (urlPrefix != undefined) {

                // 提取引号内的内容。
                const arg = urlArgDouble != undefined ? urlArgDouble : urlArgSingle != undefined ? urlArgSingle : urlArg!;
                const argIndex = matchIndex + urlPrefix.length + (arg.length === urlArg!.length ? 0 : 1);
                const url = this.decodeString(arg);

                if (urlPrefix.charCodeAt(0) === 64/*@*/) {
                    // @import url(...);
                    this.parseImport(matchSource, matchIndex, arg, argIndex, url, urlArg!);
                } else {
                    // url(...)
                    this.parseUrlFunc(matchSource, matchIndex, arg, argIndex, url, urlArg!);
                }
                return "";
            }

            return "";
        });
    }

    /**
     * 解析一个 `@import` 片段。
     * @param source 要解析的 `@import url("url")` 片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param arg 要解析的 `url` 片段。
     * @param argIndex *arg* 在源文件的起始位置。
     * @param url 要解析的地址。
     * @param quote 编码地址使用的引号。
     */
    protected parseImport(source: string, sourceIndex: number, arg: string, argIndex: number, url: string, quote: string) {
        const importOptions = typeof this.options.import === "function" ? this.options.import(url, this) : this.options.import;
        if (importOptions === "ignore") {
            return;
        }
        if (importOptions == undefined || importOptions === "inline") {
            const urlInfo: UrlInfo = this.resolveUrl(arg, argIndex, url, "relative");
            const query = this.getAndRemoveQuery(urlInfo, "__inline");
            if (query === undefined || query === "true") {
                if (urlInfo.resolved) {
                    this.require(urlInfo.resolved, module => {
                        this.import(module!);
                        this.addChange(source, sourceIndex, "");
                    });
                }
                return;
            }
        }
        this.parseUrl(arg, argIndex, url, "css.import", url => this.encodeString(url, quote), urlInfo => {
            this.import(urlInfo.module!);
            this.addChange(source, sourceIndex, "");
        });
    }

    /**
     * 解析一个 `url(...)` 或 `src=...` 片段。
     * @param source 要解析的 `url("url")` 片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param arg 要解析的 `url` 片段。
     * @param argIndex *arg* 在源文件的起始位置。
     * @param funcName 解析的函数名。
     * @param url 要解析的地址。
     * @param quote 编码地址使用的引号。
     */
    protected parseUrlFunc(source: string, sourceIndex: number, arg: string, argIndex: number, url: string, quote: string) {
        const funcsOption = typeof this.options.urlFunc === "function" ? this.options.urlFunc(url, this) : this.options.urlFunc;
        if (funcsOption === false) {
            return;
        }
        this.parseUrl(arg, argIndex, url, "css.url", url => this.encodeString(url, quote));
    }

    /**
     * 解码一个 CSS 字符串。
     * @param value 要解码的字符串。
     * @returns 返回处理后的字符串。
     */
    protected decodeString(value: string) {
        return value.replace(/\\(([\da-fA-F]{1,6})\s?|[\S\s])/g, (all, word: string, unicode: string | undefined) => {
            if (unicode) {
                return String.fromCharCode(parseInt(unicode, 16));
            }
            switch (word.charCodeAt(0)) {
                case 34 /*"*/:
                    return '\"';
                case 39 /*'*/:
                    return "'";
                case 92 /*\*/:
                    return "\\";
                case 10 /*\n*/:
                case 13 /*\r*/:
                    return "";
                case 110 /*n*/:
                    return "\n";
                case 114 /*r*/:
                    return "\r";
                case 118 /*v*/:
                    return "\v";
                case 116 /*t*/:
                    return "\t";
                case 98 /*b*/:
                    return "\b";
                case 102 /*f*/:
                    return "\f";
                case 48 /*0*/:
                    return "\0";
                default:
                    return word;
            }
        });
    }

    /**
     * 编码一个 CSS 字符串。
     * @param value 要编码的字符串。
     * @param quote 使用的引号字符。
     * @returns 返回处理后的字符串。
     */
    protected encodeString(value: string, quote: string) {
        if (quote.charCodeAt(0) === 34 /*"*/ || quote.charCodeAt(0) === 39 /*'*/) {
            return JSON.stringify(value).slice(1, -1).replace(/'/g, "\\'");
        }
        return /^[\w\.\-@:\/#+!\?%&|,;=]*$/.test(value) ? value : JSON.stringify(value);
    }

    /**
     * 当被子类重写时负责返回一个值，指示当前模块是否允许生成源映射。
     */
    get sourceMap() { return true; }

}

/**
 * 表示解析 CSS 模块的选项。
 */
export interface CssModuleOptions extends TextModuleOptions {

    /**
     * 处理 @import 的方式。
     * - "inline": 内联 @import。
     * - "url": 更新引用地址。
     * - "ignore": 忽略。
     * @default "inline"
     */
    import?: "inline" | "url" | "ignore" | ((url: string, module: Module) => "inline" | "url" | "ignore");

    /**
     * 是否解析 url() 函数。
     */
    urlFunc?: boolean | ((url: string, module: Module) => boolean);

}
