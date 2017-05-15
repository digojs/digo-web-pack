import * as digo from "digo";
import * as _digo from "digo/lib";
import { Module } from "./module";
import { ResModule } from "./res";
import { HtmlModule, HtmlModuleOptions } from "./html";
import { CssModule, CssModuleOptions } from "./css";
import { JsModule, JsModuleOptions } from "./js";
import { TextModule, TextModuleOptions } from "./text";

/**
 * 表示一个模块打包器。
 */
export class Packer {

    /**
     * 存储用于处理模块文件的根列表。
     */
    readonly list = new digo.FileList();

    /**
     * 获取当前打包器的异步任务队列。
     */
    private readonly asyncQueue = new (digo as typeof _digo).AsyncQueue();

    /**
     * 存储所有模块。
     */
    private readonly modules: { [path: string]: Module | null } = { __proto__: null };

    /**
     * 存储所有入口文件。
     */
    private readonly files: digo.File[] = [];

    /**
     * 存储所有入口文件解析完成的回调函数。
     */
    private readonly callbacks: (() => void)[] = [];

    /**
     * 存储当前是否已添加所有文件。
     */
    private _allFileAdded = false;

    /**
     * 添加一个入口文件。
     * @param file 要添加的文件。
     * @param callback 指示异步操作完成的回调函数。
     */
    addFile(file: digo.File, callback: () => void) {
        this.files.push(file);
        this.callbacks.push(callback);
        this.asyncQueue.lock("loadFile");
        this.list.add(file);
    }

    /**
     * 如果文件未加载则开始加载。
     * @param path 要加载的文件路径。
     */
    ensureFile(path: string) {
        const pathLower = path.toLowerCase();
        if (!(pathLower in this.modules)) {
            // 标记当前路径正在加载以避免重复加载。
            this.modules[pathLower] = null;
            this.asyncQueue.lock("loadFile");
            this.list.add(new digo.File(path));
        }
    }

    /**
     * 创建一个文件。
     * @param path 文件的路径。
     * @param content 模块的内容。
     * @param file 内容所在的文件。
     * @param index 内容的位置。
     * @return 返回创建的文件。
     */
    createFile(path: string, content: string, sourceFile?: digo.File, sourceIndex?: number) {
        const result = new digo.File();
        result.path = path;
        result.content = content;
        if (sourceFile) {
            result.log = (data?: string | Error | digo.FileLogEntry | undefined, args?: Object | undefined, level?: digo.LogLevel | undefined) => {
                if (!(data instanceof digo.FileLogEntry)) {
                    data = new digo.FileLogEntry(sourceFile, data, args);
                }
                if (data.fileName === path && data.startLine != undefined) {
                    const newStartLoc = sourceFile.indexToLocation(sourceIndex! + result.locationToIndex({ line: data.startLine, column: data.startColumn || 0 }));
                    data.startLine = newStartLoc.line;
                    if (data.startColumn != undefined) {
                        data.startColumn = newStartLoc.column;
                    }
                    if (data.endLine != undefined) {
                        const newEndLoc = sourceFile.indexToLocation(sourceIndex! + result.locationToIndex({ line: data.endLine, column: data.endColumn || 0 }));
                        data.startLine = newEndLoc.line;
                        if (data.endColumn != undefined) {
                            data.endColumn = newEndLoc.column;
                        }
                    }
                }
                sourceFile.log(data, undefined, level);
                return result;
            };
        }
        this.asyncQueue.lock("loadFile");
        this.list.add(result);
        return result;
    }

    /**
     * 初始化新的打包器。
     * @param generator 用于处理模块文件的生成器函数。
     */
    constructor(generator: (list: digo.FileList, packer: Packer) => void) {
        generator(this.list, this);
        this.list.pipe({
            add: file => {
                let module = this.getModule(file);
                if (!module) {
                    this.setModule(file, module = this.createDefaultModule(file));
                }
                if (this._allFileAdded) {
                    module.ensure();
                }
                this.asyncQueue.unlock("loadFile");
            }
        });
        if (digo.watcher) {
            digo.watcher.on("rebuild", (changes, deletes) => {
                for (const path of changes) {
                    delete this.modules[path.toLowerCase()];
                }
                for (const path of deletes) {
                    delete this.modules[path.toLowerCase()];
                }
            });
        }
    }

    /**
     * 用于生成唯一 ID 的序号。
     */
    private static idSeed = 0;

    /**
     * 获取当前打包器的序号。
     */
    readonly id = "__web_pack_" + (Packer.idSeed++);

    /**
     * 获取指定文件对应的模块。
     * @param file 要获取的文件。
     * @return 返回模块对象。
     */
    getModule(file: digo.File) {
        if (file.generated) {
            return file[this.id] as Module;
        } else {
            return this.modules[file.srcPath!.toLowerCase()]!;
        }
    }

    /**
     * 设置指定文件对应的模块。
     * @param file 要设置的文件。
     * @param module 要设置的模块。
     */
    setModule(file: digo.File, module: Module) {
        if (file.generated) {
            file[this.id] = module;
        } else {
            this.modules[file.srcPath!.toLowerCase()] = module;
        }
    }

    /**
     * 获取指定路径对应的模块。
     * @param path 要获取的绝对路径。
     * @return 返回模块对象。
     */
    getModuleByPath(path: string) {
        return this.modules[path!.toLowerCase()]!;
    }

    /**
     * 开始生成所有模块。
     * @param result 存放结果的文件列表。
     */
    build(result: digo.FileList) {

        // 等待入口文件全部加载。
        this.asyncQueue.enqueue(() => {

            // 标记所有入口文件已添加。
            this._allFileAdded = true;
            this.list.end();

            // 解析每个入口模块的依赖，并递归解析。
            for (const file of this.files) {
                this.getModule(file).ensure();
            }
        });

        // 等待所有模块(包括依赖的模块)全部加载。
        this.asyncQueue.enqueue(() => {

            // 此时所有需要处理的模块都已加载，对入口文件逐一生成。
            for (let i = 0; i < this.files.length; i++) {
                const file = this.files[i];
                this.getModule(file).save(file, result);
                this.callbacks[i]();
            }

            // 清空状态以便下次重新生成。
            this.callbacks.length = this.files.length = 0;
            this._allFileAdded = false;
            delete this._date;
        });
    }

    /**
     * 用于生成时间戳的日期对象。
     */
    private _date: Date;

    /**
     * 获取用于生成时间戳的日期对象。
     */
    get date() { return this._date || (this._date = new Date()); }

    /**
     * 获取指定文件的默认模块。
     * @param file 要创建的模块。
     * @return 返回默认创建的模块。
     */
    createDefaultModule(file: digo.File) {
        switch (file.ext && file.ext.toLowerCase()) {
            case ".js":
            case ".jsx":
                return new JsModule(this, file);
            case ".css":
                return new CssModule(this, file);
            case ".html":
            case ".htm":
            case ".inc":
            case ".shtm":
            case ".shtml":
            case ".jsp":
            case ".asp":
            case ".php":
            case ".aspx":
            case ".cshtml":
            case ".vbhtml":
                return new HtmlModule(this, file);
            case ".json":
            case ".map":
                return new ResModule(this, file, "json");
            case ".xml":
            case ".config":
                return new ResModule(this, file, "xml");
            case ".svg":
            case ".tif":
            case ".tiff":
            case ".woff":
            case ".woff2":
            case ".ttf":
            case ".eot":
                return new ResModule(this, file, "font");
            case ".wbmp":
            case ".png":
            case ".bmp":
            case ".gif":
            case ".fax":
            case ".ico":
            case ".jfif":
            case ".jpe":
            case ".jpeg":
            case ".jpg":
                return new ResModule(this, file, "image");
            case ".swf":
                return new ResModule(this, file, "flash");
            case ".txt":
            case ".text":
            case ".md":
            case ".log":
            case ".tpl":
            case ".template":
                return new ResModule(this, file, "text");
            default:
                const mimeType = this.getMimeTypeByExt(file.ext);
                return new ResModule(this, file, /^image/.test(mimeType) ? "image" : /^application\/font/.test(mimeType) ? "font" : mimeType.replace(/\/.*$/, ""));
        }
    }

    /**
     * 存储所有 MIME 类型表。
     */
    private _mimeTypes: { [key: string]: string; };

    /**
     * 获取所有 MIME 类型表。
     */
    get mimeTypes() {
        if (!this._mimeTypes) {
            this._mimeTypes = { __proto__: null! };
            const db = require("mime-db");
            for (const mimeType in db) {
                for (const extension of db[mimeType].extensions || []) {
                    this._mimeTypes["." + extension] = mimeType;
                }
            }
        }
        return this._mimeTypes;
    }

    /**
     * 设置所有 MIME 类型表。
     */
    set mimeTypes(value) {
        this._mimeTypes = value;
    }

    /**
     * 从 MIME 数据库获取 MIME 类型。
     * @param ext 要获取的扩展名。
     * @return 返回 MIME 类型。
     */
    getMimeTypeByExt(ext: string | undefined) {
        ext = ext || "";
        return this.mimeTypes[ext.toLowerCase()] || "application/" + ext.replace(".", "");
    }

    /**
     * 从 MIME 数据库获取 MIME 类型。
     * @param ext 要获取的MIME 类型。
     * @return 返回扩展名。
     */
    getExtByMimeType(mimeType: string) {
        for (const ext in this.mimeTypes) {
            if (this.mimeTypes[ext] === mimeType) {
                return ext;
            }
        }
    }

    /**
     * 解析一个资源模块。
     */
    res = {
        name: "WebPack:RES",
        load: false,
        add: (file: digo.File, type: string) => {
            this.setModule(file, new ResModule(this, file, type));
        }
    };

    /**
     * 解析一个文本模块。
     */
    text = {
        name: "WebPack:TEXT",
        load: true,
        add: (file: digo.File, options: TextModuleOptions) => {
            this.setModule(file, new TextModule(this, file, options));
        }
    };

    /**
     * 解析一个 HTML 模块。
     */
    html = {
        name: "WebPack:HTML",
        load: true,
        add: (file: digo.File, options: HtmlModuleOptions) => {
            this.setModule(file, new HtmlModule(this, file, options));
        }
    };

    /**
     * 解析一个 CSS 模块。
     */
    css = {
        name: "WebPack:CSS",
        load: true,
        add: (file: digo.File, options: CssModuleOptions) => {
            this.setModule(file, new CssModule(this, file, options));
        }
    };

    /**
     * 解析一个 JS 模块。
     */
    js = {
        name: "WebPack:JS",
        load: true,
        add: (file: digo.File, options: JsModuleOptions) => {
            this.setModule(file, new JsModule(this, file, options));
        }
    };

}
