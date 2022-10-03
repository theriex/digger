/*global jtminjsDecorateWithUtilities, window, diggerapp */
/*jslint browser, white, unordered */

var jt = {};
var app = (function () {
    "use strict";

    function globkey (e) {
        //jt.log("globkey charCode: " + e.charCode + ", keyCode: " + e.keyCode);
        if(e && (e.charCode === 32 || e.keyCode === 32)) {  //space bar
            const edtags = ["textarea", "input"];
            const tname = e.target.tagName;
            if(tname && edtags.indexOf(tname.toLowerCase()) < 0) {
                if(app.spacebarhookfunc) {
                    app.spacebarhookfunc(); } } }
    }


    function init2 () {
        app.amdtimer.load.end = new Date();
        jt.log("window.innerWidth/Height: " + window.innerWidth + " x " +
               window.innerHeight);
        jt.on(document, "keydown", globkey);
        app.startParams = jt.parseParams("String");
        app.startPath = window.location.pathname.toLowerCase();
        if(diggerapp.context === "local" || app.startPath === "/digger") {
            if(diggerapp.context === "web") {
                jt.byId("topsectiondiv").style.display = "none"; }
            jt.out("outercontentdiv", jt.tac2html(
                ["div", {id:"contentframingdiv"},
                 ["div", {id:"contentdiv"},
                  [["div", {cla:"paneldiv", id:"pantopdiv"}],
                   ["div", {cla:"paneldiv", id:"panplaydiv"}],
                   ["div", {cla:"paneldiv", id:"panfiltdiv"}],
                   ["div", {cla:"paneldiv", id:"pandeckdiv"}],
                   ["div", {id:"appoverlaydiv"}]]]]));
            if(app.startPath === "/digger") {  //web startup needs auth info
                app.login.init(false); }  //calls initDiggerModules
            else {
                app.initDiggerModules(); } }
        else if(diggerapp.context === "web") {
            app.login.init(); }
    }

return {
    init: function () {
        var ox = window.location.href;
        if(!diggerapp.context === "web") {
            if((ox.toLowerCase().indexOf("https:") !== 0) &&  //not secure
               (ox.search(/:\d080/) < 0)) {  //and not local dev
                window.location.href = "https:" + ox.slice(ox.indexOf("/"));
                return; } }  //stop and let the redirect happen.
        if(ox.indexOf("android") >= 0) {
            app.docroot = "https://appassets.androidplatform.net/assets/"; }
        else {
            app.docroot = ox.split("/").slice(0, 3).join("/") + "/"; }
        if(!jtminjsDecorateWithUtilities) { //support lib not loaded yet
            return setTimeout(app.init, 50); }
        jtminjsDecorateWithUtilities(jt);
        const loadfs = diggerapp.modules.map((p) => "js/amd/" + p.name);
        app.amdtimer = {};
        app.amdtimer.load = { start: new Date() };
        jt.loadAppModules(app, loadfs, app.docroot, init2, "?v=221003");
    },


    restart: init2,


    initDiggerModules: function () {
        diggerapp.modules.forEach(function (md) {
            if(md.type === "dm") {
                app[md.name].init(); } });
    },


    fileVersion: function () {
        return "v=221003";  //updated as part of release process
    },


    //divdesc can be a string divid to display/hide, or a toggle group spec:
    // {rootids:[srcdivroot, srcdivroot2...]
    //  clicked:srcdivroot}
    //The toggleable content group clicked element is "tcgc" + srcdivroot
    //The toggleable content group display element is "tcgd" + srcdivroot
    //Clicked elements have "tcgcactive" or "tcgcinactive" classes added
    togdivdisp: function (divdesc, display) {
        var dispelem = null;
        if(divdesc.rootids) {
            dispelem = jt.byId("tcgd" + divdesc.clicked); }
        else {
            dispelem = jt.byId(divdesc); }
        if(!display) {
            display = dispelem.style.display;
            if(display === "none") {
                display = "block"; }
            else {
                display = "none"; } }
        if(divdesc.rootids) {
            divdesc.rootids.forEach(function (rid) {
                var tcgce = jt.byId("tcgc" + rid);
                var tcgde = jt.byId("tcgd" + rid);
                if(rid === divdesc.clicked) {
                    tcgce.classList.remove("tcgcinactive");
                    tcgce.classList.add("tcgcactive");
                    tcgde.style.display = display; }
                else {
                    if(display === "block") {
                        tcgce.classList.add("tcgcinactive"); }
                    else {
                        tcgce.classList.remove("tcgcinactive"); }
                    tcgce.classList.remove("tcgcactive");
                    tcgde.style.display = "none"; } }); }
        else {
            dispelem.style.display = display; }
    },


    //Return the argument list as a string of arguments suitable for appending
    //to manager dispatch onwhatever function text.
    paramstr: function (args) {
        var ps = "";
        if(args && args.length) {
            ps = args.reduce(function (acc, arg) {
                if((typeof arg === "string") && (arg !== "event")) {
                    arg = "'" + arg + "'"; }
                return acc + "," + arg; }, ""); }  //always start with comma
        return ps;
    },


    //Dispatch function string.  Return an onwhatever function string.
    dfs: function (module, mgrfname, args) {
        var pstr = app.paramstr(args); var fstr;
        mgrfname = mgrfname.split(".");
        fstr = "app." + module + ".dispatch('" + mgrfname[0] + "','" +
            mgrfname[1] + "'" + pstr + ")";
        if(pstr !== ",event") {  //don't return false from event hooks
            fstr = jt.fs(fstr); }
        return fstr;
    },


    //make a cache busted url out of the endpoint and params
    cb: function (endpoint, params, toklev) {
        var url = endpoint + "?";
        toklev = toklev || "second";
        params = params || "";
        if(typeof params === "object") {
            params = jt.objdata(params); }
        if(params) {
            url += params + "&"; }
        url += jt.ts("cb=", toklev);
        return url;
    },


    //app.docroot is initialized with a terminating '/' so it can be
    //concatenated directly with a relative path, but remembering and
    //relying on whether a slash is required is annoying.  Double slashes
    //are usually handled properly but can be a source of confusion, so this
    //strips off any preceding slash in the relpath.
    dr: function (relpath) {
        if(relpath.startsWith("/")) {
            relpath = relpath.slice(1); }
        return app.docroot + relpath;
    },


    //Extract plain text from errmsg.  Controlled server errors return
    //reasonable text errors, but server crashes and anything handled by the
    //container may return full html pages which take up huge space in the 
    //UI when rendered.  This logs the original and returns best guess text.
    pt: function (errmsg) {
        errmsg = errmsg || "";
        const lcmsg = errmsg.toLowerCase();
        if(lcmsg.indexOf("<html") >= 0) {
            jt.log("app.pt original html errmsg: " + errmsg);
            const hidx = lcmsg.indexOf("<h1>");
            if(hidx >= 0) {
                errmsg = errmsg.slice(hidx + 4);
                const ci = errmsg.indexOf("</");
                if(ci >= 0) {
                    errmsg = errmsg.slice(0, ci); } }
            jt.log("app.pt returning: " + errmsg); }
        return errmsg;
    },


    subPlaceholders: function (divid, extlnk, body) {
        const dom = "diggerhub.com";
        const bot = "@" + dom;
        const docpre = "https://" + dom + "/docs/";
        const repls = [
            {plc:"MANUAL", txt:"Manual", url:docpre + "manual.html"},
            {plc:"TERMS", txt:"Terms", url:docpre + "terms.html"},
            {plc:"PRIVACY", txt:"Privacy", url:docpre + "privacy.html"},
            {plc:"SUPPORT", txt:"Support", url:docpre + "support.html"},
            {plc:"PRIVPOLICY", txt:"privacy policy",
             url:docpre + "privacy.html"},
            {plc:"OPENSOURCE", txt:"open source",
             url:"https://github.com/theriex/digger"},
            {plc:"ISSUESONGITHUB", txt:"issues on GitHub",
             url:"https://github.com/theriex/digger/issues"},
            {plc:"SUPPEMAIL", txt:"support" + bot,
             url:"mailto:support" + bot},
            {plc:"EPINOVA", txt:"epinova.com", url:"https://epinova.com"}];
        repls.forEach(function (repl) {
            var link = repl.url;
            if(link.startsWith(docpre)) {  //internal doc url
                link = jt.tac2html(["a", {href:link, onclick:jt.fs(
                    "app.displayDoc('" + divid + "','" + link + "')")},
                                    repl.txt]); }
            else if(extlnk) {  //external links supported by UI
                link = jt.tac2html(["a", {href:link, onclick:jt.fs(
                    "window.open('" + link + "')")}, repl.txt]); }
            else {  //links not supported
                if(link.startsWith("mailto")) {
                    link = repl.txt; }
                else {  //regular link
                    link = repl.txt + " (" + repl.url + ")"; } }
            body = body.replace(new RegExp(repl.plc, "g"), link); });
        return body;
    },


    displayDoc: function (divid, docurl) {  //full url or doc filename
        if(!docurl) {
            return jt.out(divid, ""); }
        jt.out(divid, "Loading " + docurl + "...");
        app.svc.docContent(docurl, function (body) {
            if(!body) { body = docurl + " unavailable"; }
            if(body.indexOf("<body>") >= 0 && body.indexOf("</body>") >= 0) {
                body = body.slice(body.indexOf("<body>") + 6,
                                  body.indexOf("</body>")); }
            const mbp = "| MANUAL | TERMS | PRIVACY | SUPPORT |";
            body = jt.tac2html(["div", {id:"docmenubardiv"}, mbp]) + body;
            body = app.subPlaceholders(divid, app.svc.urlOpenSupp(), body);
            jt.out(divid, jt.tac2html(
                ["div", {id:"docdispdiv"},
                 [["div", {id:"docdispxdiv"},
                   ["a", {href:"#close",
                          onclick:jt.fs("app.displayDoc('" + divid + "')")},
                    "X"]],
                  ["div", {id:"docdispbodydiv"}, body]]]));
            const lut = jt.byId("privlut");
            if(lut) {
                lut.innerHTML = jt.colloquialDate(lut.innerHTML); } });
    },


    //!UNPACKED BY appdat.py unescape_song_fields
    //Even a serialized song can run afoul of web security rules due to
    //paths, titles or other fields containing parenthetical expressions or
    //other triggering patterns.  For UPLOAD, remove any problematic temp
    //fields and escape whatever triggers security blocks.
    txSong: function (song) {
        var delflds = ["mrd", "smti", "smar", "smab"];
        //THIS MUST MATCH appdat.py unescape_song_fields
        var escflds = ["path", "ti", "ar", "ab", "nt"];
        //Web Security Reserved Words that must be escaped to be let through
        var wsrw = ["having", "select", "union", "within"];
        song = JSON.parse(JSON.stringify(song));
        delflds.forEach(function (fld) { delete song[fld]; });
        escflds.forEach(function (fld) {  //replace parens with HTML chars
            if(song[fld]) {
                song[fld] = song[fld].replace(/\(/g, "ESCOPENPAREN");
                song[fld] = song[fld].replace(/\)/g, "ESCCLOSEPAREN");
                song[fld] = song[fld].replace(/'/g, "ESCSINGLEQUOTE");
                song[fld] = song[fld].replace(/&/g, "ESCAMPERSAND");
                wsrw.forEach(function (rw) {
                    song[fld] = song[fld].replace(
                        new RegExp(rw, "gi"), function (match) {
                            const rev = match.split("").reverse().join("");
                            return "WSRW" + rev; }); });
            } });
        return song;
    }


};  //end returned functions
}());
