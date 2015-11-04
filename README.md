tpack-assets
===========================================

TPack 解析文件依赖的插件。

## 安装

    > npm install tpack-assets -g

## 使用

    require("tpack")
        .src("*")
        .pipe(require("tpack-assets"));

## 支持的配置

#### resolveComments 
是否解析注释内的 #include 等指令。（默认：true）