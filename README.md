digo-web-pack
===============================
[digo](https://github.com/digojs/digo) 插件：Web 模块依赖打包。

安装
-------------------------------
```
$ npm install digo-web-pack -g
```

用法
-------------------------------
### 打包 require, @import 和解析 HTML src/href
```js
digo.src("*").pipe("digo-web-pack", function (list, packer) {
    list.src("*.js").pipe(packer.js);
    list.src("*.css").pipe(packer.css);
    list.src("*.html", ".htm").pipe(packer.html);
    list.src("*.png", "*.jpg").pipe(packer.res);
});
```

### 源映射(Source Map)
本插件支持生成源映射，详见[源映射](https://github.com/digo/digo/wiki/源映射)。
