/**
 * @file 文本模块
 * @author xuld <xuld@vip.qq.com>
 */
import * as path from "path";
import * as digo from "digo";
import { Packer } from "./packer";
import { Module, ModuleOptions, emptyObject } from "./module";

/**
 * 表示一个文本模块。
 */
export class TextModule extends Module {

    /**
     * 获取当前模块的选项。
     */
    readonly options: TextModuleOptions;

    /**
     * 存储当前模块的源内容。
     */
    protected sourceContent: string;

    /**
     * 获取当前模块的源映射。
     */
    protected sourceMapData: digo.SourceMapData;

    /**
     * 初始化一个新的模块。
     * @param packer 当前模块所属的打包器。
     * @param file 当前模块的源文件。
     * @param options 当前模块的选项。
     */
    constructor(packer: Packer, file: digo.File, options?: TextModuleOptions) {
        super(packer, file, options);
        if (this.options.imports) {
            for (const path of this.options.imports) {
                this.require(this.resolvePathInConfig(path), module => {
                    if (module) {
                        this.import(module);
                    }
                })
            }
        }
        if (this.options.excludes) {
            for (const path of this.options.excludes) {
                this.require(this.resolvePathInConfig(path), module => {
                    if (module) {
                        this.exclude(module);
                    }
                })
            }
        }
        this.sourceContent = this.file.content;
        this.sourceMapData = this.file.sourceMapData;
    }

    /**
     * 获取当前模块的替换列表。
     */
    protected changes: Change[] = [];

    /**
     * 添加一个更改记录。
     * @param source 要替换的源。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param replacement 要替换的新内容。
     */
    protected addChange(source: string, sourceIndex: number, replacement: Change["replacement"]) {
        let p = this.changes.length;
        for (; p > 0; p--) {
            const change = this.changes[p - 1];
            if (sourceIndex >= change.startIndex) {
                break;
            }
        }
        const change = { startIndex: sourceIndex, endIndex: sourceIndex + source.length, replacement: replacement } as Change;
        if (p >= this.changes.length) {
            this.changes.push(change);
        } else {
            this.changes.splice(p, 0, change);
        }
    }

    /**
     * 当被子类重写时负责将当前模块生成的内容保存到指定的文件。
     * @param file 要保存的目标文件。
     * @param result 要保存的目标列表。
     */
    save(file: digo.File, result?: digo.FileList) {
        file.path = this.destPath;
        const writer = file.createWriter(this.options.output);
        this.build(writer, this.destPath || "");
        writer.end();
        if (result) {
            for (const path in this.extracts) {
                const extractedFile = new digo.File();
                this.extracts[path].save(extractedFile);
                result.add(extractedFile);
            }
        }
    }

    /**
     * 当被子类重写时负责获取当前模块的最终二进制内容。
     * @param savePath 要保存的目标路径。
     * @return 返回文件缓存。
     */
    getBuffer(savePath: string) {
        return digo.stringToBuffer(this.getContent(this.destPath || this.path || ""));
    }

    /**
     * 获取当前模块的最终文本内容。
     * @param savePath 要保存的目标路径。
     * @return 返回文件内容。
     */
    getContent(savePath: string) {
        const writer = new digo.File().createWriter({ sourceMap: false });
        this.build(writer, savePath);
        return writer.toString();
    }

    /**
     * 确保当前模块及依赖都已解析。
     */
    resolve() {
        super.resolve();
        this.modules = this.getModuleList();
        this.extracts = { __proto__: null! };
    }

    /**
     * 获取当前模块依赖的所有模块。
     */
    modules: Module[];

    /**
     * 获取当前模块导出的所有模块。
     */
    extracts: { [path: string]: Module; };

    /**
     * 构建当前模块的内容。
     * @param writer 要写入的目标写入器。
     * @param savePath 要保存的目标路径。
     */
    protected build(writer: digo.Writer, savePath: string) {

        // 解析模块。
        this.resolve();

        // 生成模块内容。
        this.write(writer, savePath);

    }

    /**
     * 当被子类重写时负责将当前模块的内容写入到指定的写入器。
     * @param writer 要写入的目标写入器。
     * @param savePath 要保存的目标路径。
     */
    protected write(writer: digo.Writer, savePath: string) {
        const outputOptions = this.options.output! || emptyObject;
        for (let i = 0; i < this.modules.length; i++) {
            const module = this.modules[i];

            // 写入模块分隔符。
            if (i > 0 && outputOptions.seperator !== "") {
                writer.write(outputOptions.seperator || "\n\n");
            }

            // 写入模块头。
            if (outputOptions.modulePrepend) {
                writer.write(this.replaceVariable(outputOptions.modulePrepend, module, savePath));
            }

            // 写入模块。
            this.writeModule(writer, module, savePath);

            // 写入模块尾。
            if (outputOptions.moduleAppend) {
                writer.write(this.replaceVariable(outputOptions.moduleAppend, module, savePath));
            }
        }
    }

    /**
     * 当被子类重写时负责写入每个依赖模块到写入器。
     * @param writer 要写入的目标写入器。
     * @param module 要写入的模块列表。
     * @param savePath 要保存的目标路径。
     */
    protected writeModule(writer: digo.Writer, module: Module, savePath: string) {
        if (module instanceof TextModule) {
            module.writeContent(writer, savePath);
        }
    }

    /**
     * 将当前模块的内容写入到指定的写入器。
     * @param writer 要写入的目标写入器。
     * @param savePath 要保存的目标路径。
     */
    private writeContent(writer: digo.Writer, savePath: string) {
        if (!this.changes || this.changes.length === 0) {
            writer.write(this.sourceContent, 0, this.sourceContent.length, this.path, 0, 0, this.sourceMapData);
            return;
        }

        let p = 0;
        for (const change of this.changes) {

            // 写入上一次替换到这次更新记录中间的普通文本。
            if (p < change.startIndex) {
                writer.write(this.sourceContent, p, change.startIndex, this.path, 0, 0, this.sourceMapData);
            }

            // 写入替换的数据。
            if (typeof change.replacement === "function") {
                writer.write(change.replacement(savePath));
            } else {
                writer.write(change.replacement);
            }

            // 更新最后一次替换位置。
            p = change.endIndex;
        }

        // 输出最后一段文本。
        if (p < this.sourceContent.length) {
            writer.write(this.sourceContent, p, this.sourceContent.length, this.path, 0, 0, this.sourceMapData);
        }
    }

    /**
     * 替换字符串中的变量。
     * @param value 要替换的内容。
     * @param module 当前的模块内容。
     * @return 返回已替换的内容。
     */
    protected replaceVariable(value: string, module: Module, savePath: string) {
        return value.replace(/__(date|time|path|name|ext)/g, (all, word: string) => {
            switch (word) {
                case "date":
                    return digo.formatDate(this.packer.date, "yyyy/MM/dd");
                case "time":
                    return digo.formatDate(this.packer.date, "yyyy/MM/dd HH:mm:ss");
                case "path":
                    return digo.relativePath(savePath);
                case "name":
                    return digo.getFileName(savePath);
                case "ext":
                    return digo.getExt(savePath);
                default:
                    return word;
            }
        });
    }

    // #region 解析公共

    /**
     * 解析一个地址。
     * @param source 地址代码片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param url 要解析的地址。
     * @param name 引用的来源名。
     * @param formater 自定义编码地址的函数。
     * @param inliner 自定义内联文件的函数。
     */
    protected parseUrl(source: string, sourceIndex: number, url: string, name: string, formater?: (url: string) => string, inliner?: (url: UrlInfo, module: Module) => void) {
        const urlOptions = this.options.url! || emptyObject;
        const urlInfo: UrlInfo = this.resolveUrl(source, sourceIndex, url, "inline");
        this.require(urlInfo.resolved, module => {

            // 处理内联。
            if (module) {
                urlInfo.module = module;
                let inline: number | boolean | undefined;
                const inlineOptionFromQuery = this.getAndRemoveQuery(urlInfo, "__inline");
                if (inlineOptionFromQuery != undefined) {
                    if (inlineOptionFromQuery == "true") {
                        inline = true;
                    } else if (inlineOptionFromQuery == "false") {
                        inline = false;
                    } else {
                        inline = +inlineOptionFromQuery || 0;
                    }
                } else {
                    inline = typeof urlOptions.inline === "function" ? urlOptions.inline(urlInfo, this) : urlOptions.inline;
                }
                if (typeof inline === "number") {
                    inline = module.getSize("") < inline;
                }
                if (inline) {
                    if (!this.include(module)) {
                        this.log(source, sourceIndex, "Cannot inline {resolved} due to circular include", urlInfo, digo.LogLevel.error);
                    } else {
                        if (inliner) {
                            inliner(urlInfo, module);
                        } else {
                            let base64Uri = this.getBase64Uri(module);
                            if (formater) {
                                base64Uri = formater(base64Uri);
                            }
                            this.addChange(source, sourceIndex, base64Uri);
                        }
                        return;
                    }
                }
            }

            // 追加地址后缀。
            if (!this.replaceQueryVariable(urlInfo)) {
                const append = typeof urlOptions.append === "function" ? urlOptions.append(urlInfo, this) : urlOptions.append;
                if (append) {
                    urlInfo.query += (urlInfo.query ? "&" : "?") + append;
                    this.replaceQueryVariable(urlInfo);
                }
            }

            // 格式化地址。
            this.addChange(source, sourceIndex, savePath => {
                let formated: string | undefined | null;
                if (urlOptions.format) {
                    formated = urlOptions.format(urlInfo, this, savePath);
                }
                if (formated == undefined) {
                    if (urlInfo.resolved) {
                        formated = this.replacPrefix(urlOptions.public, digo.relativePath(urlInfo.resolved));
                    }
                    if (formated !== null && urlInfo.module && urlInfo.module.destPath && this.destPath) {
                        formated = digo.relativePath(digo.getDir(savePath), urlInfo.module.destPath);
                    } else {
                        formated = urlInfo.path;
                    }
                    formated += urlInfo.query;
                }
                if (formater) {
                    formated = formater(formated);
                }
                return savePath;
            });
        });
    }

    /**
     * 解析当前模块内指定地址实际所表示的地址。
     * @param source 相关的代码片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param url 要解析的地址。
     * @param usage 地址的使用位置。
     * @return 返回一个地址信息对象。
     */
    protected resolveUrl(source: string, sourceIndex: number, url: string, usage: UrlUsage) {
        const resolveOptions = this.options.resolve! || emptyObject;
        const qi = url.search(/[?#]/);
        const result: ResolveUrlResult = qi >= 0 ? { path: url.substr(0, qi), query: url.substr(qi) } : { path: url, query: "" };

        // 允许忽略个别地址。
        if (this.getAndRemoveQuery(result, "__ignore") === "true" || resolveOptions.before && resolveOptions.before(result, this, usage) === false) {
            return result;
        }

        // 处理绝对路径（如 'http://'、'//' 和 'data:'）。
        if (digo.isAbsoluteUrl(result.path)) {
            const absolute = typeof resolveOptions.absolute === "function" ? resolveOptions.absolute(result, this, usage) : resolveOptions.absolute;
            if (absolute === "error" || absolute === "warning") {
                this.log(source, sourceIndex, "Cannot use absolute url: '{url}'", { url: url }, absolute === "error" ? digo.LogLevel.error : digo.LogLevel.warning);
            }
            return result;
        }

        // 解析相对路径。
        if (resolveOptions.type ? resolveOptions.type === "node" : usage === "require") {
            digo.verbose("Start Resoving: {path}", result);
            const extensions = resolveOptions.extensions || defaultExtensions;
            if (result.path.charCodeAt(0) === 46/*.*/) {
                result.local = path.resolve(this.file.srcDir || this.file.destDir || "", result.path);
                result.resolved = this.tryExtensions(result.local, extensions);
            } else {
                const packageMains = resolveOptions.packageMains || defaultPackageMains;
                // alias
                let alias = this.replacPrefix(resolveOptions.alias, result.path);
                if (alias !== undefined) {
                    if (alias === null) {
                        digo.verbose("Apply alias: null, resolve completed");
                        return result;
                    }
                    alias = this.resolvePathInConfig(alias);
                    digo.verbose("Apply alias: {alias}", { alias });
                    result.resolved = this.tryPackage(alias, packageMains, extensions);
                } else {
                    // root
                    if (resolveOptions.root != undefined) {
                        if (typeof resolveOptions.root === "string") {
                            result.resolved = this.tryPackage(this.resolvePathInConfig(resolveOptions.root, result.path), packageMains, extensions);
                        } else {
                            for (const root of resolveOptions.root) {
                                if (result.resolved = this.tryPackage(this.resolvePathInConfig(root, result.path), packageMains, extensions)) {
                                    break;
                                }
                            }
                        }
                    }
                    // node_modules
                    if (!result.resolved) {
                        const modulesDirectories = resolveOptions.modulesDirectories || defaultModulesDirectories;
                        if (modulesDirectories.length) {
                            let dirPath = this.file.srcDir || this.file.destDir || process.cwd();
                            search: while (true) {
                                for (const modulesDirectory of modulesDirectories) {
                                    if (result.resolved = this.tryPackage(path.resolve(dirPath, modulesDirectory, result.path), packageMains, extensions)) {
                                        break search;
                                    }
                                }
                                const oldDirPath = dirPath;
                                dirPath = path.dirname(dirPath);
                                if (dirPath === oldDirPath) {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        } else {
            result.local = path.resolve(this.file.srcDir || this.file.destDir || "", result.path);
            result.resolved = this.existsFile(result.local) ? result.local : undefined;
        }

        // 路径解析完成。
        if (!result.resolved) {
            const notFound = resolveOptions.notFound != undefined ? (typeof resolveOptions.notFound === "function" ? resolveOptions.notFound(result, this, usage) : resolveOptions.notFound) : (usage === "inline" ? "warning" : "error");
            if (notFound === "error" || notFound === "warning") {
                this.log(source, sourceIndex, usage === "require" ? "Cannot find module: '{url}'." : "Cannot find file: '{url}'.", { url: result.local || result.path }, notFound === "error" ? digo.LogLevel.error : digo.LogLevel.warning);
            }
            return result;
        }

        // 解析完成。
        if (resolveOptions.after && resolveOptions.after(result, this, usage) === false) {
            delete result.resolved;
        }
        return result;
    }

    /**
     * 判断指定的绝对地址是否存在。
     * @param path 要判断的地址。
     * @returns 如果存在则返回 true，否则返回 false。
     */
    protected existsFile(path: string) {
        if ((!this.options.resolve || this.options.resolve.strict !== false) && this.packer.getModuleFromPath(path) !== undefined) {
            return true;
        }
        return digo.existsFile(path);
    }

    /**
     * 根据指定的对象设置替换一个地址。
     * @param paths 所有地址对象。
     * @param url 要替换的地址。
     * @return 如果替换成功则返回替换的地址，否则返回 undefined。
     */
    protected replacPrefix(paths: { [prefix: string]: string | null } | undefined, url: string) {
        if (paths) {
            const pathLower = url.toLowerCase() + "/";
            for (const prefix in paths) {
                if (pathLower.startsWith(prefix.toLowerCase() + "/")) {
                    const newPrefix = paths[prefix];
                    if (newPrefix === null) {
                        return null;
                    }
                    return newPrefix + url.substr(prefix.length);
                }
            }
        }
    }

    /**
     * 尝试加载一个包。
     * @param module 要加载的包路径。
     * @param packageMains 要搜索的包主名。
     * @param extensions 要搜索的扩展名。
     * @return 返回添加扩展名的路径。
     */
    private tryPackage(module: string, packageMains: string[], extensions: string[]) {
        if (digo.existsDir(module)) {
            digo.verbose("Test: {path} => Is a directory, try load as a package", { path: module });
            if (packageMains.length) {
                digo.verbose("packageMains present: Try load package.json");
                const pkg = path.join(module, "package.json");
                let packageObj;
                try {
                    packageObj = require(pkg);
                    digo.verbose("Load: {pkg} successfully", { pkg });
                } catch (e) {
                    digo.verbose("Cannot load: {pkg}: {error}", { pkg: pkg, error: e });
                }
                if (packageObj) {
                    for (const packageMain of packageMains) {
                        const main = path.join(module, packageObj[packageMain]);
                        digo.verbose("Apply packageMains {field} => {path}", { field: packageMain, path: main });
                        const result = this.tryExtensions(main, extensions);
                        if (result) {
                            return result;
                        }
                    }
                }
            } else {
                digo.verbose("packageMains not present: Skip load package.json");
            }
            const result = this.tryExtensions(path.join(module, "index"), extensions);
            if (result) {
                return result;
            }
        } else {
            digo.verbose("Test: {url} => Is not a directory", { url: module });
            return this.tryExtensions(module, extensions);
        }
    }

    /**
     * 搜索追加扩展名的路径。
     * @param path 要搜索的路径。
     * @param extensions 要追加的扩展名。
     * @returns 如果存在则返回添加扩展名的路径。
     */
    private tryExtensions(module: string, extensions: string[]) {
        for (let i = 0; i < extensions.length; i++) {
            const result = module + extensions[i];
            if (this.existsFile(result)) {
                digo.verbose("Test: {path} => Found, resolve completed", { path: result });
                return result;
            }
            digo.verbose("Test: {path} => Not found", { path: result });
        }
    }

    /**
     * 用于搜索查询字符串的正则表达式。
     */
    private static _queryRegExp: { [name: string]: RegExp } = { __proto__: null! };

    /**
     * 处理地址中的查询字符串。
     * @param url 包含地址信息的对象。
     * @param name 参数名。
     * @returns 返回参数值。
     */
    protected getAndRemoveQuery(url: ResolveUrlResult, name: string) {
        if (url.query) {
            const re = TextModule._queryRegExp[name] || (TextModule._queryRegExp[name] = new RegExp("(\\?|&)" + name + "(?:=([^&]*))?(?:&|$)"));
            const match = re.exec(url.query);
            if (match) {
                url.query = url.query.replace(re, "$1").replace(/\?&?$/, "");
                return match[2] || "true";
            }
        }
    }

    /**
     * 替换地址中的变量。
     * @param url 包含地址信息的对象。
     * @return 如果已替换则返回 true，否则返回 false。
     */
    protected replaceQueryVariable(url: UrlInfo) {
        let result = false;
        if (url.query) {
            url.query = url.query.replace(/__(date|now|hash|md5|random)(?::([\w\-]+))?\b/g, (all, type: string, postfix: string | undefined) => {
                switch (type) {
                    case "date":
                        return digo.formatDate(this.packer.date, postfix || "yyyyMMdd");
                    case "now":
                        return new Date().getTime().toString();
                    case "hash":
                        return url.module ? digo.sha1(url.module.getBuffer("")).substr(0, +postfix || 6) : "";
                    case "md5":
                        return url.module ? digo.md5(url.module.getBuffer("")).substr(0, +postfix || 32) : "";
                    case "random":
                        return (~~(Math.random() * Math.pow(10, +postfix || 3))).toString();
                }
                result = true;
                return all;
            });
        }
        return result;
    }

    /**
     * 解析内联在源码中的源码。
     * @param source 相关的代码片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param content 要解析的源码内容。
     * @param ext 源码映射的扩展名。
     * @param formater 编码内容的回调函数。
     * @param inliner 自定义内联文件的函数。
     */
    protected parseContent(source: string, sourceIndex: number, content: string, ext: string, formater?: (content: string) => string, init?: (module: Module) => void) {
        const file = this.packer.createFile("#" + ext, content, this.file, sourceIndex);
        this.require(undefined, () => {
            const module = this.packer.getModule(file);
            if (init) {
                init(module);
            }
            this.addChange(source, sourceIndex, savePath => {
                let formated = module instanceof TextModule ? module.getContent(savePath) : content;
                if (formater) {
                    formated = formater(formated);
                }
                return formated;
            });
        });
    }

    /**
     * 解析内联在源码中的源码。
     * @param source 相关的代码片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param content 要解析的源码内容。
     * @param comment 注释。
     * @param commentIndex *comment* 在源文件的起始位置。
     */
    protected parseComment(source: string, sourceIndex: number, comment: string, commentIndex: number) {
        // TODO
    }

    /**
     * 解析宏。
     * @param source 相关的代码片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     */
    protected parseSubs(source: string, sourceIndex: number) {
        // TODO
    }

    /**
     * 记录一个错误或警告。
     * @param source 相关的代码片段。
     * @param sourceIndex 片段在源文件的起始位置。
     * @param message 错误的信息。
     * @param args 格式化参数。
     * @param logLevel 日志等级。
     * @param error 原始错误信息。
     */
    protected log(source: string, sourceIndex: number, message: string, args?: Object, logLevel?: digo.LogLevel, error?: Error) {
        const startLoc = this.file.indexToLocation(sourceIndex);
        const endLoc = this.file.indexToLocation(sourceIndex + source.length);
        this.file.log({
            plugin: "WebPack",
            message: message,
            error: error,
            startLine: startLoc.line,
            startColumn: startLoc.column,
            endLine: endLoc.line,
            endColumn: endLoc.column
        }, args, logLevel);
    }

    // #endregion

}

/**
 * 表示解析文本模块的选项。
 */
export interface TextModuleOptions extends ModuleOptions {

    /**
     * 手动设置导入项。
     */
    imports?: string[];

    /**
     * 手动设置排除项。
     */
    excludes?: string[];

    /**
     * 解析地址的配置。
     */
    resolve?: {

        /**
         * 是否允许缓存地址解析结果。
         */
        cache?: boolean;

        /**
         * 是否采用严格解析模式。如果使用了严格模式则每次解析地址时都确认物理文件是否存在。
         */
        strict?: boolean;

        /**
         * 在解析地址前的回调函数。
         * @param url 包含地址信息的对象。
         * @param module 地址所在的模块。
         * @param usage 地址的使用位置。
         * @return 如果忽略指定的地址则返回 false。
         * @example 将地址中 `~/` 更换为指定目录然后继续解析：
         * ```json
         * {
         *      before: function(url, module, usage){
         *          url.path = url.path.replace(/^~\//, "virtual-root");
         *      }
         * }
         * ```
         */
        before?(url: ResolveUrlResult, module: Module, usage: UrlUsage): boolean | void;

        /**
         * 处理绝对路径（如 'http://'、'//' 和 'data:'）的方式。
         * - "error": 报错。
         * - "warning": 警告。
         * - "ignore": 忽略。
         * @default "error"
         */
        absolute?: "error" | "warning" | "ignore" | ((url: ResolveUrlResult, module: Module, usage: UrlUsage) => "error" | "warning" | "ignore");

        /**
         * 解析路径的方式。
         * - "relative": 采用相对地址解析。
         * - "node": 采用和 Node.js 中 `require` 相同的方式解析。
         */
        type?: "relative" | "node",

        /**
         * 路径别名列表。
         * @example 
         * ```json
         * {
         *      alias: {
         *          "$": "jquery",
         *          "require": null // 忽略解析特定的地址。
         *      }
         * }
         * ```
         */
        alias?: { [prefix: string]: string | null };

        /**
         * 搜索的根目录。
         */
        root?: string | string[];

        /**
         * 搜索的模块目录名。
         */
        modulesDirectories?: string[];

        /**
         * 检查 package.json 中这些字段以搜索入口模块。
         */
        packageMains?: string[];

        /**
         * 自动追加的扩展名。
         */
        extensions?: string[];

        /**
         * 处理无效本地路径的方式。可能值有：
         * - "error": 报错。
         * - "warning": 警告。
         * - "ignore": 忽略。
         */
        notFound?: "error" | "warning" | "ignore" | ((url: ResolveUrlResult, module: Module, usage: UrlUsage) => "error" | "warning" | "ignore");

        /**
         * 在解析地址成功后的回调函数。
         * @param url 包含地址信息的对象。
         * @param module 地址所在的模块。
         * @param usage 地址的使用位置。
         * @return 如果忽略指定的地址则返回 false。
         */
        after?(url: ResolveUrlResult, module: Module, usage: UrlUsage): boolean | void;

    };

    /**
     * 处理地址相关配置。
     */
    url?: {

        /**
         * 是否内联地址。
         * @desc
         * - false(默认): 不内联。
         * - true：内联。
         * - 数字：当文件字节数未超过指定大小则内联，否则不内联。
         * - 函数：自定义是否内联的函数。
         * @param url 包含地址信息的对象。
         * @param module 地址所在的模块。
         * @return 如果需要内联则返回 true，否则返回 false。
         * @default false
         */
        inline?: boolean | number | ((url: UrlInfo, module: Module) => boolean | number);

        /**
         * 追加地址后缀。
         * @desc 可能值有：
         * - 一个字符串，字符串可以包含 __md5 等标记。支持的标记有：
         * * __md5: 替换成文件的 MD5 值。
         * * __hash: 本次生成的哈希值。
         * * __date: 替换成当前时间。
         * * __now: 替换成当前时间。
         * - 一个函数，函数参数为：
         * @param url 包含地址信息的对象。
         * @param module 地址所在模块。
         * @return 返回后缀字符串。
         */
        append?: string | ((url: UrlInfo, module: Module) => string);

        /**
         * 生成最终地址的回调函数。该函数允许自定义最终保存到文件时使用的地址。
         * @param url 包含地址信息的对象。
         * @param module 地址所在模块。
         * @param savePath 模块的保存位置。
         * @return 返回生成的地址。
         */
        format?: (url: UrlInfo, module: Module, savePath: string) => string;

        /**
         * 各个路径发布后的地址。
         * @example
         * ```json
         * {
         *    public: {
         *       "assets": "http://cdn.com/assets" 
         *    }
         * }
         * ```
         */
        public?: { [url: string]: string }

    };

    /**
     * 输出设置。
     */
    output?: {

        /**
         * 设置是否生成源码映射表。
         */
        sourceMap?: boolean;

        /**
         * 在最终输出目标文件时追加的前缀。
         * @example "/* This file is generated by digo at __date. DO NOT EDIT DIRECTLY!! *\/"
         */
        prepend?: string,

        /**
         * 在最终输出目标文件时追加的后缀。
         * @default ""
         */
        append?: string,

        /**
         * 在每个依赖模块之间插入的代码。
         * @default "\n"
         */
        seperator?: string,

        /**
         * 在每个依赖模块前插入的代码。
         * @default ""
         */
        modulePrepend?: string,

        /**
         * 在每个依赖模块后插入的代码。
         */
        moduleAppend?: string,

        /**
         * 用于缩进源码的字符串。
         * @default "\t"
         */
        sourceIndent?: string,

    };

}

/**
 * 表示地址的使用位置。
 */
export type UrlUsage = "inline" | "require";

/**
 * 表示解析地址返回的结果。
 */
export interface ResolveUrlResult {

    /**
     * 地址的路径部分。
     */
    path: string;

    /**
     * 地址的查询参数和哈希值部分(含 ? 和 #)。
     */
    query: string;

    /**
     * 返回解析映射的本地文件绝对路径。如果地址采用了 require 解析则返回 undefined。
     */
    local?: string;

    /**
     * 如果文件存在则返回解析映射的本地文件绝对路径，否则返回 undefined。
     */
    resolved?: string;

}

/**
 * 表示一个地址信息。
 */
export interface UrlInfo extends ResolveUrlResult {

    /**
     * 当前路径对应的模块。
     */
    module?: Module | null;

}

/**
 * 表示一个更改记录。
 */
export interface Change {

    /**
     * 获取当前更改记录在原始内容的起始位置。
     */
    startIndex: number;

    /**
     * 获取当前更改记录在原始内容的结束位置（不包括结束位置）。
     */
    endIndex: number;

    /**
     * 获取当前替换的数据。
     */
    replacement: string | ((savePath: string) => string);

}

const defaultExtensions = ["", ".json", ".js"];
const defaultPackageMains = ["main"];
const defaultModulesDirectories = [];
