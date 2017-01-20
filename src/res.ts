/**
 * @file digo 插件：Web 模块依赖打包
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
     * 获取当前资源模块的类型。
     */
    readonly type?: string;

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
    constructor(packer: Packer, file: digo.File, type?: string) {
        super(packer, file, undefined);
        this.type = type;
        if (this.file.loaded) {
            this.srcData = this.file.data;
        }
    }

    /**
     * 当被子类重写时负责将当前模块生成的内容保存到指定的文件。
     * @param file 要保存的目标文件。
     * @param result 要保存的目标列表。
     */
    save(file: digo.File, result?: digo.FileList) { }

    /**
     * 当被子类重写时负责获取当前模块的最终二进制内容。
     */
    getBuffer() {
        if (this.srcData != undefined) {
            return this.srcData instanceof Buffer ? this.srcData : digo.stringToBuffer(this.srcData);
        }
        if (this.srcPath) {
            return digo.readFile(this.srcPath);
        }
        return Buffer.allocUnsafe(0);
    }

    /**
     * 当被子类重写时负责获取当前模块的最终保存大小。
     */
    getSize() {
        if (this.srcData != undefined) {
            return this.getBuffer().length;
        }
        if (this.srcPath) {
            return digo.getStat(this.srcPath).size;
        }
        return 0;
    }

}
