/**
 * @file JS 模块
 * @author xuld <xuld@vip.qq.com>
 */
import * as path from "path";
import * as digo from "digo";
import { Packer } from "./packer";
import { Module, emptyObject } from "./module";
import { TextModule, TextModuleOptions, UrlType, UrlInfo } from "./text";
import { CssModule } from "./css";

/**
 * 表示一个 JS 模块。
 */
export class JsModule extends TextModule {

    /**
     * 获取当前模块的解析选项。
     */
    options: JsModuleOptions;

    /**
     * 是否强制使所有模块都作为 Commonjs 模块处理。
     */
    commonjs?: boolean;

    /**
     * 添加的模块加载器。
     */
    loader?: boolean | string;

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
    module?: "var" | "this" | "exports" | "commonjs" | "umd" | "amd" | "lib";

    /**
     * 导出的变量名。
     */
    exports?: string;

    /**
     * 设置导出 CSS 的路径。
     */
    extractCss?: boolean | string;

    /**
     * 当被子类重写时负责返回当前模块的类型。
     */
    get type() { return "js"; }

    /**
     * 初始化一个新的模块。
     * @param packer 当前模块所属的打包器。
     * @param file 当前模块的源文件。
     * @param options 当前模块的选项。
     */
    constructor(packer: Packer, file: digo.File, options?: JsModuleOptions) {
        super(packer, file, options);
        this.commonjs = !!(this.options.require && this.options.require.commonjs);
    }

    /**
     * 当被子类重写时负责解析当前模块。
     */
    parse() {
        this.file.content.replace(/"((?:[^\\"\n\r]|\\[\s\S])*)"|'((?:[^\\'\n\r]|\\[\s\S])*)'|\/\/([^\n\r]*)|\/\*([\s\S]*?)(?:\*\/|$)|(\brequire\s*\(\s*)(?:"((?:[^\\"\n\r]|\\[\s\S])*)"|'((?:[^\\'\n\r]|\\[\s\S])*)')\s*\)/g, (matchSource: string, doubleString: string | undefined, singleString: string | undefined, singleComment: string | undefined, multiComment: string | undefined, requirePrefix: string | undefined, requireDoubleString: string | undefined, requireSingleString: string | undefined, matchIndex: number) => {
            // TODO: 改进异步 require 实现

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
        const urlInfo = this.resolveUrl(arg, argIndex, url, "node");
        if (urlInfo.resolved) {
            this.require(urlInfo.resolved, (module: Module) => {
                this.import(module);
                this.addChange(arg, argIndex, this.encodeString(this.getModuleName(module)));
            });
        }
    }

    /**
     * 解析一个内置命令。
     * @param source 相关的代码片段。
     * @param sourceIndex 片段在源文件的起始位置。
     * @param name 解析的命令名。
     * @param arg 解析的命令参数。
     * @param argIndex 解析的命令参数在源文件的起始位置。
     */
    protected parseCommand(source: string, sourceIndex: number, name: string, arg: string, argIndex: number) {
        if (name === "config") {
            const kv = /(loader|commonjs|module|exports|extractCss)\s+(\w*)/.exec(arg);
            if (kv) {
                this[kv[1]] = kv[1] === "loader" || kv[1] === "commonjs" ? kv[2] !== "false" : kv[2];
            }
        } else {
            super.parseCommand(source, sourceIndex, name, arg, argIndex);
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
        return JSON.stringify(value).slice(1, -1).replace(/'/g, "\\'");
    }

    /**
     * 当被子类重写时负责返回一个值，指示当前模块是否允许生成源映射。
     */
    get sourceMap() { return true; }

    /**
     * 当被子类重写时负责将当前模块的内容写入到指定的写入器。
     * @param writer 要写入的目标写入器。
     * @param savePath 要保存的目标路径。
     * @param modules 依赖的所有模块。
     * @param extracts 导出的所有文件。
     */
    write(writer: digo.Writer, savePath: string | undefined, modules: Module[], extracts: digo.File[]) {
        if (!this.commonjs) {
            super.writeModule(writer, this, savePath, modules, extracts);
            return;
        }
        const requireOptions = this.options.require || emptyObject!;
        if (requireOptions.extractCss) {
            const cssModules: CssModule[] = [];
            for (let i = 0; i < modules.length; i++) {
                if (modules[i] instanceof CssModule) {
                    cssModules.push(modules[i] as CssModule);
                    modules.splice(i--, 1);
                }
            }
            if (cssModules.length) {
                const cssPath = savePath != undefined ? path.resolve(savePath, "..", requireOptions.extractCss === true ? "__name.css" : requireOptions.extractCss).replace("__name", digo.getFileName(savePath, false)) : undefined;
                const cssFile = new digo.File(cssPath);
                const cssWriter = cssFile.createWriter(this.options.output);
                if (cssPath != undefined) {
                    const existsModule = this.packer.getModuleByPath(cssPath);
                    if (existsModule instanceof CssModule) {
                        cssModules.push(existsModule);
                    }
                }
                cssModules[cssModules.length - 1].write(cssWriter, cssPath, cssModules, []);
                cssWriter.end();
                extracts.push(cssFile);
            }
        }
        const loader = this.loader != undefined ? this.loader : requireOptions.loader != undefined ? requireOptions.loader : !this.excludes.length;
        if (loader === true) {
            writer.write(this.getLoader());
        } else if (typeof loader === "string") {
            writer.write(loader);
        }
        if (requireOptions.baseUrl) {
            writer.write(`digo.baseUrl = ${JSON.stringify(requireOptions.baseUrl)};`);
        }
        const append = this.options.url && (typeof this.options.url.append === "function" ? this.options.url.append({ path: "", query: "" }, this) : this.options.url.append);
        if (append) {
            const urlInfo = { path: "", query: "?" + append };
            this.replaceQueryVariable(urlInfo);
            writer.write(`digo.urlArgs = ${JSON.stringify(urlInfo.query)};`);
        }
        super.write(writer, savePath, modules, extracts);
        const modulePath = this.getModuleName(this);
        const module = requireOptions.module || "var";
        switch (module) {
            case "var":
                writer.write(`\n\nvar ${requireOptions.exports || "exports"} = digo.require(${JSON.stringify(modulePath)});`);
                break;
            case "this":
                writer.write(`\n\nthis[${JSON.stringify(requireOptions.exports || "exports")}] = digo.require(${JSON.stringify(modulePath)});`);
                break;
            case "exports":
                writer.write(`\n\nexports[${JSON.stringify(requireOptions.exports || "exports")}] = digo.require(${JSON.stringify(modulePath)});`);
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
        root[${JSON.stringify(requireOptions.exports || "exports")}] = factory();
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
     * @param modules 依赖的所有模块。
     * @param extracts 导出的所有文件。
     */
    protected writeModule(writer: digo.Writer, module: Module, savePath: string | undefined, modules: Module[], extracts: digo.File[]) {
        writer.write(`digo.define(${JSON.stringify(this.getModuleName(module))}, function (require, exports, module) {\n`)
        writer.indent();
        if (module.type === "js") {
            super.writeModule(writer, module, savePath, modules, extracts);
        } else if (module.type === "css") {
            writer.write(`module.exports = digo.style(${JSON.stringify(module.getContent(savePath))});`);
        } else if (module.type === "text") {
            writer.write(`module.exports = ${JSON.stringify(module.getContent(savePath))};`);
        } else if (module.type === "json") {
            writer.write(`module.exports = ${module.getContent(savePath)};`);
        } else {
            writer.write(`module.exports = ${JSON.stringify(module.getContent(savePath))};`);
        }
        writer.unindent();
        writer.write(`\n});`);
    }

    /**
     * 获取指定模块的名称。
     * @param module 要获取的模块。
     * @return 返回模块名。
     */
    protected getModuleName(module: Module) {
        const root = this.options.require && this.options.require.root || "";
        return digo.relativePath(root, module.destPath);
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
        return JsModule._loader || (JsModule._loader = digo.readFile(require.resolve("../data/loader.default.js")).toString());
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
        root?: string;

        /**
         * 异步模块的请求根地址。
         */
        baseUrl?: string;

        /**
         * 是否强制使所有模块都作为 Commonjs 模块处理。
         */
        commonjs?: boolean;

        /**
         * 添加的模块加载器。
         */
        loader?: boolean | string;

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
        module?: "var" | "this" | "exports" | "commonjs" | "umd" | "amd" | "lib";

        /**
         * 导出的变量名。
         */
        exports?: string;

        /**
         * 设置导出 CSS 的路径。
         */
        extractCss?: boolean | string;

    };

}