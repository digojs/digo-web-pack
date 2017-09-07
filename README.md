# digo-web-pack
[digo](https://github.com/digojs/digo) 插件：Web 模块依赖打包。

## 安装
```bash
npm install digo-web-pack -g
```

## 用法
### 打包 require, @import 和解析 HTML src/href
```js
digo.src("*").pipe("digo-web-pack", function (list, packer) {
    list.src("*.js").pipe(packer.js);
    list.src("*.css").pipe(packer.css);
    list.src("*.html", ".htm").pipe(packer.html);
    list.src("*.png", "*.jpg").pipe(packer.res);
});
```

## 配置
```js
digo.src("*").pipe("digo-web-pack", function (list, packer) {
    list.src("*.js").pipe(packer.js, {
        require: { // require 相关的配置。
            root: "", // 模块的跟路径。
            baseUrl: "", // 异步模块的请求根地址。
            commonjs: false, // 是否强制使所有模块都作为 Commonjs 模块处理。
            loader: true, // 添加的模块加载器。true 表示默认模块加载器。字符串则表示加载器本身。
            module: "var", // 默认编译的库类型。可能的值有："var": var Library = xxx；"this": this["Library"] = xxx；"commonjs": exports["Library"] = xxx；"commonjs2": this.exports = xxx；"amd"；"umd"
            exports: "", // 导出的变量名。
            extractCss: "" // 设置导出 CSS 的路径。true 表示和 js 同名。
        };
    });
    list.src("*.css").pipe(packer.css, {
        import: {
            import: "inline", // 处理 @import 的方式。"inline"：内联 @import；"url"：更新引用地址；"ignore"：忽略。可以设置为函数自定义根据不同的文件设置。
            urlFunc: true // 是否解析 url() 函数。可以设置为函数自定义根据不同的文件设置。
        }
    });
    list.src("*.html", ".htm").pipe(packer.html, {
        tags: { // 设置不同标签属性的解析方式。如：
                //     {
                //          "img": {
                //              "src": false        // 不解析 <img src>
                //              "onpaint": "script" // 将 <img onpaint> 解析为内联的脚本
                //              "theme": "style"    // 将 <img theme> 解析为内联的样式
                //              "href": "url"       // 将 <img href> 解析为内联的地址
                //          },
                //          "*": {                  // * 将对所有节点生效
                //              "style": false
                //          }
                //      }
                // }
        },
        langs: {// 设置各语言的映射扩展名。
            "text/javascript": "js"
        },
        serverCode: null // 测试是否包含服务端代码的正则表达式。
    });
    list.src("*.png", "*.jpg").pipe(packer.res);
});
```

#### 其它公共配置

```ts
{

    /**
     * 手动设置导入项。
     */
    imports?: string[];

    /**
     * 手动设置排除项。
     */
    excludes?: string[];

    /**
     * 当前资源的 MIME 类型。
     */
    mimeType?: string;

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
```

### 源映射(Source Map)
本插件支持生成源映射，详见[源映射](https://github.com/digo/digo/wiki/源映射)。
