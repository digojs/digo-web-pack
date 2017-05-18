import * as digo from "digo";
import { Packer } from "./packer";
import { JsModuleOptions } from "./js";
import { CssModuleOptions } from "./css";
import { HtmlModuleOptions } from "./html";

/**
 * 当前处理器的名字。
 */
export const name = "WebPack";

/**
 * 初始化处理器选项。
 * @param options 传递给处理器的只读选项。
 * @return 返回更新后的选项。
 */
export function init(options: ((list: digo.FileList, packer: Packer) => void) | JsModuleOptions | CssModuleOptions | HtmlModuleOptions) {
    return new Packer(typeof options === "function" ? options : (list, packer) => {
        list.src("*.js").pipe(packer.js, options);
        list.src("*.css").pipe(packer.css, options);
        list.src("*.html", "*.htm").pipe(packer.html, options);
    });
}

/**
 * 当添加一个文件后执行。
 * @param file 要处理的文件。
 * @param packer 传递给处理器的只读选项。
 * @param done 指示异步操作完成的回调函数。如果未声明此参数则表示当前处理器是同步执行的。如果函数的第一个参数为 false 则不再继续处理此文件。
 */
export function add(file: digo.File, packer: Packer, done: () => void) {
    packer.addFile(file, done);
}

/**
 * 当所有文件添加完成后执行。
 * @param packer 传递给处理器的只读选项。
 * @param result 结果列表。
 */
export function after(packer: Packer, result: digo.FileList) {
    packer.build(result);
}
