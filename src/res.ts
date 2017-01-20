/**
 * @file 资源模块
 * @author xuld <xuld@vip.qq.com>
 */
import * as digo from "digo";
import { Packer } from "./packer";
import { Module, ModuleOptions } from "./module";

/**
 * 表示一个资源模块。
 */
export class ResModule extends Module {

    /**
     * 获取当前模块的选项。
     */
    readonly options: ResModuleOptions;

    /**
     * 存储当前文件的数据。
     */
    private srcData?: digo.File["data"];

    /**
     * 初始化一个新的模块。
     * @param packer 当前模块所属的打包器。
     * @param file 当前模块的源文件。
     * @param type 当前模块的类型。
     */
    constructor(packer: Packer, file: digo.File, options?: ResModuleOptions) {
        super(packer, file, undefined);
        if (this.file.loaded) {
            this.srcData = this.file.data;
        }
    }

    /**
     * 当被子类重写时负责解析当前模块。
     */
    parse() { }

    /**
     * 当被子类重写时负责将当前模块生成的内容保存到指定的文件。
     * @param file 要保存的目标文件。
     * @param result 要保存的目标列表。
     */
    save(file: digo.File, result?: digo.FileList) { }

    /**
     * 获取当前模块的最终二进制内容。
     * @param savePath 要保存的目标路径。
     * @return 返回文件缓存。
     */
    getBuffer(savePath = this.destPath) {
        if (this.srcData != undefined) {
            return this.srcData instanceof Buffer ? this.srcData : digo.stringToBuffer(this.srcData);
        }
        if (this.srcPath != undefined) {
            try {
                return digo.readFile(this.srcPath);
            } catch (e) {
                digo.verbose(e);
            }
        }
        return Buffer.allocUnsafe(0);
    }

    /**
     * 获取当前模块的最终文本内容。
     * @param savePath 要保存的目标路径。
     * @return 返回文件内容。
     */
    getContent(savePath = this.destPath) {
        if (typeof this.srcData === "string") {
            return this.srcData;
        }
        if (this.options.type === "text" || this.options.type === "js" || this.options.type === "css" || this.options.type === "json") {
            return this.getBuffer(savePath).toString();
        }
        return this.getBase64Uri(savePath);
    }

    /**
     * 获取当前模块的最终保存大小。
     * @param savePath 要保存的目标路径。
     */
    getSize(savePath = this.destPath) {
        if (this.srcData != undefined) {
            return this.getBuffer(savePath).length;
        }
        if (this.srcPath != undefined) {
            try {
                return digo.getStat(this.srcPath).size;
            } catch (e) {
                digo.verbose(e);
            }
        }
        return 0;
    }

}

/**
 * 表示解析文本模块的选项。
 */
export interface ResModuleOptions extends ModuleOptions {

    /**
     * 资源类型。
     */
    type?: string;

}
