tpack-assets
===========================================

提供静态资源处理支持

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

