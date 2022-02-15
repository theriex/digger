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
        jt.log("window.innerWidth: " + window.innerWidth);
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
                   ["div", {cla:"paneldiv", id:"pandeckdiv"}]]]]));
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
        app.docroot = ox.split("/").slice(0, 3).join("/") + "/";
        if(!jtminjsDecorateWithUtilities) { //support lib not loaded yet
            return setTimeout(app.init, 50); }
        jtminjsDecorateWithUtilities(jt);
        const loadfs = diggerapp.modules.map((p) => "js/amd/" + p.name);
        app.amdtimer = {};
        app.amdtimer.load = { start: new Date() };
        jt.loadAppModules(app, loadfs, app.docroot, init2, "?v=220215");
    },


    restart: init2,


    initDiggerModules: function () {
        diggerapp.modules.forEach(function (md) {
            if(md.type === "dm") {
                app[md.name].init(); } });
    },


    fileVersion: function () {
        return "v=220215";  //updated as part of release process
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
    }

};  //end returned functions
}());
