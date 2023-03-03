//Copy files in list of relative paths from srcdir to dstdir.

const fs = require("fs");
const path = require("path");
const cpa = {pathsFile:"", srcdir:"", dstdir:""}

function copyFile (fp) {
    const srcfile = path.join(cpa.srcdir, fp);
    if(!fs.existsSync(srcfile)) {
        throw("srcfile not found: " + srcfile); }
    var cpdir = cpa.dstdir;
    const dirs = fp.split(path.sep).slice(0, -1);
    dirs.forEach(function (dir) {
        cpdir = path.join(cpdir, dir)
        if(!fs.existsSync(cpdir)) {
            fs.mkdirSync(cpdir); } });
    const dstfile = path.join(cpa.dstdir, fp);
    fs.copyFileSync(srcfile, dstfile);
}


function copyPaths () {
    //process.argv[0]: node
    //process.argv[1]: copypaths.js
    cpa.pathsFile = process.argv[2]
    console.log("cpa.pathsFile: " + cpa.pathsFile);
    cpa.srcdir = process.argv[3]
    console.log("cpa.srcdir: " + cpa.srcdir);
    cpa.dstdir = process.argv[4]
    console.log("cpa.dstdir: " + cpa.dstdir);
    if(!fs.existsSync(cpa.srcdir)) {
        console.log("srcdir " + cpa.srcdir + " does not exist");
        return; }
    if(!fs.existsSync(cpa.dstdir)) {
        console.log("dstdir " + cpa.dstdir + " does not exist");
        return; }
    cpa.paths = fs.readFileSync(cpa.pathsFile, "utf8");
    //console.log("cpa.paths: " + cpa.paths);
    cpa.paths = cpa.paths.split("\n");
    cpa.paths.forEach(function (fp) {
        try {
            if(fp) {
                copyFile(fp); }
        } catch(e) {
            console.log("copyFile " + fp + " failed: " + e);
        } });
}
    

copyPaths();
