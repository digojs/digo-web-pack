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
     * 获取当前模块的源内容。
     */
    protected readonly sourceContent: digo.File["content"];

    /**
     * 获取当前模块的源映射。
     */
    protected readonly sourceMapBuilder: digo.SourceMapBuilder;

    private readonly _index: number[] = [];

    /**
     * 当被子类重写时负责返回当前模块的类型。
     */
    get type() { return "text"; }

    /**
     * 初始化一个新的模块。
     * @param packer 当前模块所属的打包器。
     * @param file 当前模块的源文件。
     * @param options 当前模块的选项。
     */
    constructor(packer: Packer, file: digo.File, options?: TextModuleOptions) {
        super(packer, file, options);
        this.sourceContent = this.file.content;
        this.sourceMapBuilder = this.file.sourceMapBuilder!;
    }

    /**
     * 当被子类重写时负责解析当前模块。
     */
    parse() {
        this.parseSubs(this.sourceContent, 0);
    }

    /**
     * 获取当前模块的替换列表。
     */
    protected readonly changes: Change[] = [];

    /**
     * 判断指定的区域是否存在更改记录。
     * @param source 要替换的源。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @returns 如果存在则返回 true，否则返回 false。
     */
    protected hasChange(source: string, sourceIndex: number) {
        // FIXME: 是否需要改进为二分搜索?
        for (const change of this.changes) {
            if (change.endIndex <= sourceIndex) {
                continue;
            }
            if (change.startIndex <= sourceIndex) {
                return true;
            }
            if (sourceIndex + source.length <= change.startIndex) {
                return false;
            }
            return true;
        }
        return false;
    }

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
     * 当被子类重写时负责返回一个值，指示当前模块是否允许生成源映射。
     */
    get sourceMap() { return false; }

    /**
     * 当被子类重写时负责将当前模块生成的内容保存到指定的文件。
     * @param file 要保存的目标文件。
     * @param result 要保存的目标列表。
     */
    save(file: digo.File, result?: digo.FileList) {
        this.resolve();
        const modules = this.getModuleList();
        const extracts = [];
        const writer = file.createWriter({
            sourceMap: this.sourceMap === false ? false : this.options.output && this.options.output.sourceMap,
            indentChar: this.options.output && this.options.output.indentChar
        });
        this.write(writer, file.path, modules, extracts);
        writer.end();
        if (result && extracts.length) {
            for (const file of extracts) {
                result.add(file);
            }
        }
    }

    /**
     * 当被子类重写时负责将当前模块的内容写入到指定的写入器。
     * @param writer 要写入的目标写入器。
     * @param savePath 要保存的目标路径。
     * @param modules 依赖的所有模块。
     * @param extracts 导出的所有文件。
     */
    write(writer: digo.Writer, savePath: string | undefined, modules: Module[], extracts: digo.File[]) {
        const outputOptions = this.options.output! || emptyObject;
        if (outputOptions.prepend) {
            writer.write(this.replaceVariable(outputOptions.prepend, this));
        }
        for (let i = 0; i < modules.length; i++) {
            const module = modules[i];
            if (i > 0 && outputOptions.seperator !== "") {
                writer.write(outputOptions.seperator || "\n\n");
            }
            if (outputOptions.modulePrepend) {
                writer.write(this.replaceVariable(outputOptions.modulePrepend, module));
            }
            this.writeModule(writer, module, savePath, modules, extracts);
            if (outputOptions.moduleAppend) {
                writer.write(this.replaceVariable(outputOptions.moduleAppend, module));
            }
        }
        if (outputOptions.append) {
            writer.write(this.replaceVariable(outputOptions.append, this));
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
        if (module instanceof TextModule) {
            module.writeContent(writer, savePath);
        } else {
            writer.write(module.getContent(savePath));
        }
    }

    /**
     * 将当前模块的内容写入到指定的写入器。
     * @param writer 要写入的目标写入器。
     * @param savePath 要保存的目标路径。
     */
    private writeContent(writer: digo.Writer, savePath: string | undefined) {
        if (!this.changes || this.changes.length === 0) {
            writer.write(this.sourceContent, 0, this.sourceContent.length, this.srcPath, this.sourceMapBuilder, 0, 0);
            return;
        }

        let p = 0;
        for (const change of this.changes) {

            // 写入上一次替换到这次更新记录中间的普通文本。
            if (p < change.startIndex) {
                const loc = digo.indexToLocation(this.sourceContent, p, this._index);
                writer.write(this.sourceContent, p, change.startIndex, this.srcPath, this.sourceMapBuilder, loc.line, loc.column);
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
            const loc = digo.indexToLocation(this.sourceContent, p, this._index);
            writer.write(this.sourceContent, p, this.sourceContent.length, this.srcPath, this.sourceMapBuilder, loc.line, loc.column);
        }
    }

    /**
     * 替换字符串中的变量。
     * @param value 要替换的内容。
     * @param module 当前的模块内容。
     * @return 返回已替换的内容。
     */
    protected replaceVariable(value: string | ((module: Module, owner: Module) => string), module: Module) {
        if (typeof value === "function") {
            return value(module, this);
        }
        return value.replace(/__(date|time|path|name|ext)/g, (all, word: string) => {
            switch (word) {
                case "date":
                    return digo.formatDate(this.packer.date, "yyyy/MM/dd");
                case "time":
                    return digo.formatDate(this.packer.date, "yyyy/MM/dd HH:mm:ss");
                case "path":
                    return module.srcPath ? digo.relativePath(module.srcPath) : "";
                case "name":
                    return module.srcPath ? digo.getFileName(module.srcPath) : "";
                case "ext":
                    return module.srcPath ? digo.getExt(module.srcPath) : "";
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
    protected parseUrl(source: string, sourceIndex: number, url: string, name: string, formater?: (url: string) => string, inliner?: (url: UrlInfo) => void) {
        const urlOptions = this.options.url! || emptyObject;
        const urlInfo: UrlInfo = this.resolveUrl(source, sourceIndex, url, "relative");
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
                    inline = module.getSize() < inline;
                }
                if (inline) {
                    if (!this.include(module)) {
                        this.log(source, sourceIndex, "Cannot inline {resolved} due to circular include", urlInfo, digo.LogLevel.error);
                    } else {
                        if (inliner) {
                            inliner(urlInfo);
                        } else {
                            // FIXME: 需要延时计算 base64 地址?
                            this.addChange(source, sourceIndex, savePath => {
                                let result = module.getBase64Uri(savePath);
                                if (formater) {
                                    result = formater(result);
                                }
                                return result;
                            });
                        }
                        return;
                    }
                }
            }

            // 追加地址后缀。
            if (this.getAndRemoveQuery(urlInfo, "__append") !== "false" && !this.replaceQueryVariable(urlInfo)) {
                const append = typeof urlOptions.append === "function" ? urlOptions.append(urlInfo, this) : module ? urlOptions.append : undefined;
                if (append) {
                    urlInfo.query += (urlInfo.query ? "&" : "?") + append;
                    this.replaceQueryVariable(urlInfo);
                }
            }

            // 格式化地址。
            this.addChange(source, sourceIndex, savePath => {
                let result: string | undefined | null;
                if (urlOptions.format) {
                    result = urlOptions.format(urlInfo, this, savePath);
                }
                if (result == undefined) {
                    if (urlInfo.resolved) {
                        result = this.replacPrefix(urlOptions.public, digo.relativePath(urlInfo.resolved));
                    }
                    if (result == null) {
                        if (urlInfo.module && urlInfo.module.destPath != undefined && savePath != undefined) {
                            result = digo.relativePath(digo.getDir(savePath), urlInfo.module.destPath);
                        } else {
                            result = urlInfo.path;
                        }
                    }
                    result += urlInfo.query;
                }
                if (formater) {
                    result = formater(result);
                }
                return result;
            });
        });
    }

    /**
     * 解析当前模块内指定地址实际所表示的地址。
     * @param source 相关的代码片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     * @param url 要解析的地址。
     * @param defaultType 地址默认的解析方式。
     * @return 返回一个地址信息对象。
     */
    protected resolveUrl(source: string, sourceIndex: number, url: string, defaultType: UrlType) {
        const resolveOptions = this.options.resolve! || emptyObject;
        const qi = url.search(/[?#]/);
        const result: ResolveUrlResult = qi >= 0 ? { path: url.substr(0, qi), query: url.substr(qi) } : { path: url, query: "" };

        // 允许忽略个别地址。
        if (this.getAndRemoveQuery(result, "__ignore") === "true" || resolveOptions.before && resolveOptions.before(result, this, defaultType) === false) {
            return result;
        }

        // 忽略空路径。
        if (!result.path) {
            return result;
        }

        // 处理绝对路径（如 'http://'、'//' 和 'data:'）。
        if (digo.isAbsoluteUrl(result.path)) {
            const absolute = typeof resolveOptions.absolute === "function" ? resolveOptions.absolute(result, this, defaultType) : resolveOptions.absolute;
            if (absolute === "error" || absolute === "warning") {
                this.log(source, sourceIndex, "Cannot use absolute url: '{url}'", { url: url }, absolute === "error" ? digo.LogLevel.error : digo.LogLevel.warning);
            }
            return result;
        }

        // 解析相对路径。
        if ((resolveOptions.type || defaultType) === "node") {
            digo.verbose("Start Resoving: {path}", result);
            const packageMains = resolveOptions.packageMains || defaultPackageMains;
            const extensions = resolveOptions.extensions || defaultExtensions;
            if (result.path.charCodeAt(0) === 46/*.*/) {
                result.resolved = this.tryPackage(path.resolve(this.srcPath || this.destPath || "_", "..", result.path), packageMains, extensions);
            } else {
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
                            let dirPath = path.resolve(this.srcPath || this.destPath || "_", "..");
                            search: while (true) {
                                for (const modulesDirectory of modulesDirectories) {
                                    if (result.resolved = this.tryPackage(path.join(dirPath, modulesDirectory, result.path), packageMains, extensions)) {
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
            result.local = path.resolve(this.srcPath || this.destPath || "_", "..", result.path);
            result.resolved = this.existsFile(result.local) ? result.local : undefined;
        }

        // 路径解析完成。
        if (!result.resolved) {
            const notFound = resolveOptions.notFound != undefined ? (typeof resolveOptions.notFound === "function" ? resolveOptions.notFound(result, this, defaultType) : resolveOptions.notFound) : (defaultType === "node" ? "error" : "warning");
            if (notFound === "error" || notFound === "warning") {
                this.log(source, sourceIndex, defaultType === "node" ? "Cannot find module: '{url}'." : "Cannot find file: '{url}'.", { url: result.local || result.path }, notFound === "error" ? digo.LogLevel.error : digo.LogLevel.warning);
            }
            return result;
        }

        // 解析完成。
        if (resolveOptions.after && resolveOptions.after(result, this, defaultType) === false) {
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
        if ((!this.options.resolve || this.options.resolve.strict !== false) && this.packer.findModule(path) !== undefined) {
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
                        if (packageObj[packageMain] != undefined) {
                            const main = path.join(module, packageObj[packageMain]);
                            digo.verbose("Apply packageMains {field} => {path}", { field: packageMain, path: main });
                            const result = this.tryExtensions(main, extensions);
                            if (result) {
                                return result;
                            }
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
        }
        return this.tryExtensions(module, extensions);
    }

    /**
     * 搜索追加扩展名的路径。
     * @param path 要搜索的路径。
     * @param extensions 要追加的扩展名。
     * @returns 如果存在则返回添加扩展名的路径。
     */
    private tryExtensions(module: string, extensions: string[]) {
        for (const extension of extensions) {
            const result = module + extension;
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
                        return url.module ? digo.sha1(url.module.getBuffer("")).substr(0, +postfix! || 6) : "";
                    case "md5":
                        return url.module ? digo.md5(url.module.getBuffer("")).substr(0, +postfix! || 32) : "";
                    case "random":
                        return (~~(Math.random() * Math.pow(10, +postfix! || 3))).toString();
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
        let commentOptions = this.options.comment;
        if (commentOptions === false) {
            return;
        }
        if (!commentOptions || commentOptions === true) {
            commentOptions = emptyObject;
        }
        let foundCommand = false;
        comment.replace(/(#(include|import|exclude|config)\s*)(.*)/g, (matchSource: string, prefix: string, name: string, args: string, matchIndex: number) => {
            if ((commentOptions as any)[name] === false) {
                return "";
            }
            foundCommand = true;
            const match = /'(.*)'|"(.*)"/.exec(args);
            const arg = match ? match[1] || match[2] || "" : args.trim();
            const argIndex = commentIndex + matchIndex + prefix.length + (match ? match.index + 1 : 0);
            this.parseCommand(source, sourceIndex, name, arg, argIndex);
            return "";
        });
        if (foundCommand) {
            this.addChange(source, sourceIndex, "");
        }
    }

    /**
     * 解析宏。
     * @param source 相关的代码片段。
     * @param sourceIndex *source* 在源文件的起始位置。
     */
    protected parseSubs(source: string, sourceIndex: number) {
        let subOptions = this.options.sub;
        if (subOptions === false) {
            return;
        }
        if (!subOptions || subOptions === true) {
            subOptions = emptyObject;
        }
        source.replace(/(__(include|import|exclude|config|url|macro)\s*\(\s*)("((?:[^\\"\n\r]|\\[\s\S])*)"|'((?:[^\\'\n\r]|\\[\s\S])*)'|[^\)\n\r]*)\s*\)/g, (matchSource: string, prefix: string, name: string, subArg: string, subArgDouble: string | undefined, subArgSingle: string | undefined, matchIndex: number) => {
            if ((subOptions as any)[name] === false) {
                return "";
            }
            const arg = subArgDouble != undefined ? subArgDouble : subArgSingle != undefined ? subArgSingle : subArg;
            const argIndex = sourceIndex + matchIndex + prefix.length + (subArg.length === subArg!.length ? 0 : 1);
            this.parseCommand(source, sourceIndex, name, arg, argIndex);
            return "";
        });
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
        switch (name) {
            case "include": {
                const urlInfo = this.resolveUrl(arg, argIndex, arg, "relative");
                if (urlInfo.resolved) {
                    this.require(urlInfo.resolved, module => {
                        if (!this.include(module!)) {
                            this.log(source, sourceIndex, "Circular include with {path}", { path: module!.srcPath }, digo.LogLevel.error);
                            return;
                        }
                        this.addChange(source, sourceIndex, savePath => module!.getContent(savePath));
                    });
                }
                break;
            }
            case "import": {
                const urlInfo = this.resolveUrl(arg, argIndex, arg, "node");
                if (urlInfo.resolved) {
                    this.require(urlInfo.resolved, module => {
                        this.import(module!);
                    });
                }
                break;
            }
            case "exclude": {
                const urlInfo = this.resolveUrl(arg, argIndex, arg, "node");
                if (urlInfo.resolved) {
                    this.require(urlInfo.resolved, module => {
                        this.import(module!);
                    });
                }
                break;
            }
            case "url": {
                this.parseUrl(source, sourceIndex, arg, "__url");
                break;
            }
            case "macro": {
                const defined = this.getDefined(arg);
                this.addChange(source, sourceIndex, defined == undefined ? "" : defined.toString());
                break;
            }
        }
    }

    /**
     * 获取预定义的宏。
     * @param name 要获取的宏名称。
     * @return 返回宏对应的值。如果宏未定义则返回 undefined。
     */
    protected getDefined(name: string) {
        const defines = this.options.defines;
        if (!defines || !defines.hasOwnProperty(name)) return undefined;
        return typeof defines[name] === "function" ? (defines[name] as ((module: Module) => boolean | string))(this) : defines[name];
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
            line: startLoc.line,
            column: startLoc.column,
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
         * @param defaultType 地址默认的解析方式。
         * @return 如果忽略指定的地址则返回 false。
         * @example 将地址中 `~/` 更换为指定目录然后继续解析：
         * ```json
         * {
         *      before: function(url, module, defaultType){
         *          url.path = url.path.replace(/^~\//, "virtual-root");
         *      }
         * }
         * ```
         */
        before?(url: ResolveUrlResult, module: Module, defaultType: UrlType): boolean | void;

        /**
         * 处理绝对路径（如 'http://'、'//' 和 'data:'）的方式。
         * - "error": 报错。
         * - "warning": 警告。
         * - "ignore": 忽略。
         * @default "error"
         */
        absolute?: ErrorType | ((url: ResolveUrlResult, module: Module, defaultType: UrlType) => ErrorType);

        /**
         * 解析路径的方式。
         * - "relative": 采用相对地址解析。
         * - "node": 采用和 Node.js 中 `require` 相同的方式解析。
         */
        type?: UrlType,

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
        notFound?: ErrorType | ((url: ResolveUrlResult, module: Module, defaultType: UrlType) => ErrorType);

        /**
         * 在解析地址成功后的回调函数。
         * @param url 包含地址信息的对象。
         * @param module 地址所在的模块。
         * @param defaultType 地址默认的解析方式。
         * @return 如果忽略指定的地址则返回 false。
         */
        after?(url: ResolveUrlResult, module: Module, defaultType: UrlType): boolean | void;

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
        format?: (url: UrlInfo, module: Module, savePath: string | undefined) => string;

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
        public?: { [url: string]: string };

    };

    /**
     * 解析注释内指令（如 #include）。
     */
    comment?: boolean | {

        /**
         * 是否解析 #include 指令。
         * @default true
         */
        include?: boolean;

        /**
         * 是否解析 #exclude 指令。
         * @default true
         */
        exclude?: boolean;

        /**
         * 是否解析 #require 指令。
         * @default true
         */
        import?: boolean;

        /**
         * 是否解析 #config 指令。
         * @default true
         */
        config?: boolean;

    };

    /**
     * 是否解析全局宏。
     */
    sub?: boolean | {

        /**
         * 是否解析 __url 常量。
         * @default true
         */
        url?: boolean;

        /**
         * 解析 __macro 常量的值。
         * @default true
         */
        macro?: boolean;

        /**
         * 是否解析 __include 常量。
         * @default true
         */
        include?: boolean;

        /**
         * 是否解析 __exclude 指令。
         * @default true
         */
        exclude?: boolean;

        /**
         * 是否解析 __require 指令。
         * @default true
         */
        import?: boolean;

        /**
         * 是否解析 __config 指令。
         * @default true
         */
        config?: boolean;

    };

    /**
     * 宏列表。
     */
    defines?: { [name: string]: boolean | string | ((module: Module) => boolean | string) };

    /**
     * 输出设置。
     */
    output?: digo.WriterOptions & {

        /**
         * 在最终输出目标文件时追加的前缀。
         * @example "/* This file is generated by digo at __date. DO NOT EDIT DIRECTLY!! *\/"
         */
        prepend?: string | ((module: Module, owner: Module) => string),

        /**
         * 在最终输出目标文件时追加的后缀。
         * @default ""
         */
        append?: string | ((module: Module, owner: Module) => string),

        /**
         * 在每个依赖模块之间插入的代码。
         * @default "\n\n"
         */
        seperator?: string,

        /**
         * 在每个依赖模块前插入的代码。
         * @default ""
         */
        modulePrepend?: string | ((module: Module, owner: Module) => string),

        /**
         * 在每个依赖模块后插入的代码。
         */
        moduleAppend?: string | ((module: Module, owner: Module) => string),

        /**
         * 用于缩进源码的字符串。
         * @default "\t"
         */
        sourceIndent?: string | ((module: Module, owner: Module) => string),

    };

}

/**
 * 表示错误的处理方式。
 */
export type ErrorType = "error" | "warning" | "ignore";

/**
 * 表示地址的解析方式。
 */
export type UrlType = "relative" | "node";

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
     * 当前更改记录在原始内容的起始位置。
     */
    startIndex: number;

    /**
     * 当前更改记录在原始内容的结束位置（不包括结束位置）。
     */
    endIndex: number;

    /**
     * 当前替换的数据。
     */
    replacement: string | ((savePath: string | undefined) => string);

}

const defaultExtensions = ["", ".json", ".js"];
const defaultPackageMains = ["main"];
const defaultModulesDirectories = [];
