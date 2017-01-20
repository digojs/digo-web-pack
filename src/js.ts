/**
 * @file JS 模块
 * @author xuld <xuld@vip.qq.com>
 */
import * as digo from "digo";
import { Packer } from "./packer";
import { Module } from "./module";
import { TextModule, TextModuleOptions, UrlUsage, UrlInfo } from "./text";
import { CssModule } from "./css";
import { HtmlModule } from "./html";
import { ResModule } from "./res";

/**
 * 表示一个 JS 模块。
 */
export class JsModule extends TextModule {

    /**
     * 获取当前模块的解析选项。
     */
    options: JsModuleOptions;

    /**
     * 判断当前模块是否是 Commonjs 模块。
     */
    commonjs: boolean;

    /**
     * 初始化一个新的模块。
     * @param packer 当前模块所属的打包器。
     * @param file 当前模块的源文件。
     * @param options 当前模块的选项。
     */
    constructor(packer: Packer, file: digo.File, options?: JsModuleOptions) {
        super(packer, file, options);
        file.content.replace(/"((?:[^\\"\n\r]|\\[\s\S])*)"|'((?:[^\\'\n\r]|\\[\s\S])*)'|\/\/([^\n\r]*)|\/\*([\s\S]*?)(?:\*\/|$)|(\brequire\s*\(\s*)(?:"((?:[^\\"\n\r]|\\[\s\S])*)"|'((?:[^\\'\n\r]|\\[\s\S])*)')\s*\)/g, (matchSource: string, doubleString: string | undefined, singleString: string | undefined, singleComment: string | undefined, multiComment: string | undefined, requirePrefix: string | undefined, requireDoubleString: string | undefined, requireSingleString: string | undefined, matchIndex: number) => {

            // "...", '...'
            if (doubleString != undefined || singleString != undefined) {
                return "";
            }

            // //...
            if (singleComment != undefined) {
                this.parseComment(matchSource, matchIndex, singleComment, matchIndex + "//".length);
                return "";
            }

            // /*...*/
            if (multiComment != undefined) {
                this.parseComment(matchSource, matchIndex, multiComment, matchIndex + "/*".length);
                return "";
            }

            // require("..."), require('...')
            if (requireDoubleString != undefined || requireSingleString != undefined) {
                const arg = requireDoubleString != undefined ? requireDoubleString : requireSingleString!;
                const argIndex = matchIndex + requirePrefix!.length + 1;
                this.parseRequire(matchSource, matchIndex, arg, argIndex, this.decodeString(arg));
                return "";
            }

            return "";
        });

    }

    /**
     * 解析一个 `require(...)` 片段。
     * @param source 要解析的 `require("url")` 片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param arg 要解析的 `url` 片段。
     * @param argIndex *arg* 在源文件的起始位置。
     * @param url 依赖的地址。
     */
    protected parseRequire(source: string, sourceIndex: number, arg: string, argIndex: number, url: string) {
        this.commonjs = true;
        const urlInfo = this.resolveUrl(arg, argIndex, url, "require");
        if (urlInfo.resolved) {
            this.require(urlInfo.resolved, (module: Module) => {
                this.import(module);
                const url = this.getModuleName(module) || digo.relativePath(digo.getDir(this.srcPath || ""), module.srcPath).replace(/^[^\.]/, "./$&");
                this.addChange(arg, argIndex, this.encodeString(url));
            });
        }
    }

    /**
     * 解码一个 JavaScript 字符串。
     * @param value 要解码的字符串。
     * @returns 返回处理后的字符串。
     */
    protected decodeString(value: string) {
        return value.replace(/\\(u(?:\{[\da-fA-F]{1,6}\}|[\da-fA-F]{1,4})|x[\da-fA-F]{1,2}|[\S\s])/g, (all, word: string) => {
            switch (word.charCodeAt(0)) {
                case 34/*"*/:
                    return '\"';
                case 39/*'*/:
                    return '\'';
                case 92/*\*/:
                    return '\\';
                case 10/*\n*/:
                case 13/*\r*/:
                    return '';
                case 110/*n*/:
                    return '\n';
                case 114/*r*/:
                    return '\r';
                case 118/*v*/:
                    return '\v';
                case 116/*t*/:
                    return '\t';
                case 98/*b*/:
                    return '\b';
                case 102/*f*/:
                    return '\f';
                case 48/*0*/:
                    return '\0';
                case 117/*u*/:
                case 120/*x*/:
                    return String.fromCharCode(parseInt(/\}$/.test(word) ? word.slice(2, -1) : word.slice(1), 16));
                default:
                    return word;
            }
        });
    }

    /**
     * 编码一个 JavaScript 字符串。
     * @param value 要编码的字符串。
     * @returns 返回处理后的字符串。
     */
    protected encodeString(value: string) {
        return JSON.stringify(value).slice(1, -1);
    }

    /**
     * 确保当前模块及依赖都已解析。
     */
    resolve() {
        super.resolve();

        // 导出 css

    }

    /**
     * 当被子类重写时负责将当前模块的内容写入到指定的写入器。
     * @param writer 要写入的目标写入器。
     * @param savePath 要保存的目标路径。
     */
    protected write(writer: digo.Writer, savePath: string) {
        if (!this.commonjs) {
            super.writeModule(writer, this, savePath);
            return;
        }
        const requireOptions = this.options.require;
        const loader = requireOptions && requireOptions.loader != undefined ? requireOptions.loader : !this.excludes.length;
        if (loader === true) {
            writer.write(this.getLoader());
        } else if (typeof loader === "string") {
            writer.write(loader);
        }
        super.write(writer, savePath);
        const modulePath = this.getModuleName(this) || digo.relativePath(this.srcPath || "");
        const libraryTarget = requireOptions && requireOptions.libraryTarget || "var";
        switch (libraryTarget) {
            case "var":
                writer.write(`\n\nvar ${requireOptions && requireOptions.variable || "exports"} = digo.require(${JSON.stringify(modulePath)});`);
                break;
            case "this":
                writer.write(`\n\nthis[${JSON.stringify(requireOptions && requireOptions.variable || "exports")}] = digo.require(${JSON.stringify(modulePath)});`);
                break;
            case "exports":
                writer.write(`\n\nexports[${JSON.stringify(requireOptions && requireOptions.variable || "exports")}] = digo.require(${JSON.stringify(modulePath)});`);
                break;
            case "commonjs":
                writer.write(`\n\nmodule.exports = digo.require(${JSON.stringify(modulePath)});`);
                break;
            case "amd":
                writer.write(`\n\ndefine(function() { return digo.require(${JSON.stringify(modulePath)}); });`);
                break;
            case "umd":
                writer.write(`(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        root[${JSON.stringify(requireOptions && requireOptions.variable || "exports")}] = factory();
    }
}(this, function factory() {
    return digo.require(${JSON.stringify(modulePath)}); });;
}));`);
                break;
        }
    }

    /**
     * 当被子类重写时负责写入每个依赖模块到写入器。
     * @param writer 要写入的目标写入器。
     * @param module 要写入的模块列表。
     * @param savePath 要保存的目标路径。
     */
    protected writeModule(writer: digo.Writer, module: Module, savePath: string) {
        writer.write(`digo.define(${JSON.stringify(this.getModuleName(module) || digo.relativePath(module.srcPath || ""))}, function (require, exports, module) {\n`)
        writer.indent();
        if (module instanceof JsModule) {
            super.writeModule(writer, module, savePath);
        } else if (module instanceof CssModule || (module instanceof ResModule && module.type === "css")) {
            writer.write(`module.exports = digo.style(${JSON.stringify(module.getContent(savePath))});`);
        } else if (module instanceof HtmlModule || module instanceof TextModule as any || (module instanceof ResModule && module.type === "text") || (module instanceof ResModule && module.type === "html")) {
            writer.write(`module.exports = ${JSON.stringify(module.getContent(savePath))};`);
        } else if (module instanceof ResModule && module.type === "json") {
            writer.write(`module.exports = ${module.getContent(savePath)};`);
        } else if (module instanceof ResModule && module.type === "js") {
            writer.write(`${module.getContent(savePath)};`);
        } else {
            writer.write(`module.exports = ${JSON.stringify(module.getContent(savePath))};`);
        }
        writer.unindent();
        writer.write(`\n});`);
    }

    /**
     * 获取指定模块的名称。
     * @param module 要获取的模块。
     * @return 返回模块名。如果无可用名称则返回 undefined。
     */
    protected getModuleName(module: Module) {
        let emitRoot = this.options.require && this.options.require.emitRoot || this.options.resolve && this.options.resolve.root;
        if (typeof emitRoot === "string") {
            emitRoot = [emitRoot];
        }
        if (Array.isArray(emitRoot)) {
            for (let i = 0; i < emitRoot.length; i++) {
                const relative = digo.relativePath(emitRoot[i], module.srcPath);
                if (relative.charCodeAt(0) !== 46/*.*/) {
                    return relative;
                }
            }
        }
    }

    /**
     * 存储加载器。
     */
    private static _loader: string;

    /**
     * 获取加载器源码。
     * @return 返回加载器源码。
     */
    protected getLoader() {
        return JsModule._loader || (JsModule._loader = digo.readFile(require.resolve("../data/loader.js")).toString());
    }

}

/**
 * 表示解析 JS 模块的选项。
 */
export interface JsModuleOptions extends TextModuleOptions {

    /**
     * require 相关的配置。
     */
    require?: {

        /**
         * 模块的跟路径。
         */
        emitRoot?: string | string[];

        /**
         * 添加的模块加载器。
         */
        loader?: boolean | string;

        /**
         * 在异步加载模块时，是否追加 cross-orign 属性。
         * @see https://developer.mozilla.org/en/docs/Web/HTML/Element/script#attr-crossorigin
         */
        crossOriginLoading?: boolean,

        /**
         * 默认编译的库类型。可能的值有：
         * - var: var Library = xxx
         * - this: this["Library"] = xxx
         * - commonjs: exports["Library"] = xxx
         * - commonjs2: this.exports = xxx
         * - amd
         * - umd
         * @default "var"
         */
        libraryTarget?: "var" | "this" | "exports" | "commonjs" | "umd" | "amd" | "lib";

        /**
         * 导出的变量名。
         */
        variable?: string;

        /**
         * 设置导出 CSS 的路径。
         */
        extractCss?: boolean | string;

    };

}