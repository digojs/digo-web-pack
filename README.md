tpack-assets
===========================================

当资源文件被移动或内联时，负责更新资源文件内部的路径引用。

## 安装

    > npm install tpack-assets -g

## 使用

    require('tpack').build({
        rules: [
            {
                src: "*.html",
                process: require("tpack-assets").html
            },
            {
                src: "*.css",
                process: require("tpack-assets").css
            },
            {
                src: "*.js",
                process: require("tpack-assets").js
            }
        ]
    });

