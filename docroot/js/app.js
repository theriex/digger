/*global jtminjsDecorateWithUtilities, window */
/*jslint browser, white, fudge */

var app = {};
var jt = {};

(function () {
    "use strict";

    var modules = ["svc", "top", "player", "filter", "deck"];

app = {

    init2: function () {
        jt.out("contentdiv", jt.tac2html(
            [["div", {cla:"paneldiv", id:"pantopdiv"}],
             ["div", {cla:"paneldiv", id:"panplaydiv"}],
             ["div", {cla:"paneldiv", id:"panfiltdiv"}],
             ["div", {cla:"paneldiv", id:"pandeckdiv"}]]));
        modules.forEach(function (modname) {
            app[modname].init(); });
    },


    init: function () {
        jtminjsDecorateWithUtilities(jt);
        jt.log("loading app modules v=210422");
        var href = window.location.href;
        if(href.indexOf("#") > 0) {
            href = href.slice(0, href.indexOf("#")); }
        if(href.indexOf("?") > 0) {
            href = href.slice(0, href.indexOf("?")); }
        jt.loadAppModules(app, modules.map((x) => "js/amd/" + x),
                          href, app.init2, "?v=210422");
    },


    fileVersion: function () {
        return "v=210422";  //updated as part of release process
    },


    togdivdisp: function (divid, display) {
        var div = jt.byId(divid);
        if(!div) {  //div not available yet, so nothing to do
            return; }
        if(!display) {
            display = div.style.display;
            if(display === "none") {
                display = "block"; }
            else {
                display = "none"; } }
        div.style.display = display;
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
        var pstr = app.paramstr(args);
        mgrfname = mgrfname.split(".");
        var fstr = "app." + module + ".dispatch('" + mgrfname[0] + "','" +
            mgrfname[1] + "'" + pstr + ")";
        if(pstr !== ",event") {  //don't return false from event hooks
            fstr = jt.fs(fstr); }
        return fstr;
    },


    cb: function (endpoint, params, toklev) {
        toklev = toklev || "second";
        params = params || "";
        if(typeof params === "object") {
            params = jt.objdata(params); }
        var url = endpoint + "?";
        if(params) {
            url += params + "&"; }
        url += jt.ts("cb=", toklev);
        return url;
    }

};
}());
